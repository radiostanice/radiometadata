export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Parse request URL
    const url = new URL(request.url);
    const stationUrl = url.searchParams.get('url');
    
    if (!stationUrl) {
      return createErrorResponse('Missing station URL parameter', 400);
    }

    try {
      // Configuration for different stream types
      const fetchOptions = {
        method: 'GET',
        headers: { 
          'Icy-MetaData': '1',
          'User-Agent': 'Mozilla/5.0 (compatible; RadioMetadataFetcher/2.0)'
        },
        cf: { 
          cacheTtl: 5,  // Reduced cache to 5 seconds
          cacheEverything: true
        }
      };

      // Start timing the request
      const startTime = Date.now();
      
      // Fetch with timeout (reduced to 3 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      fetchOptions.signal = controller.signal;

      const response = await fetch(stationUrl, fetchOptions);
      clearTimeout(timeoutId);

      // Collect quality information
      const qualityInfo = {
        bitrate: response.headers.get('icy-br') || null,
        metaInterval: response.headers.get('icy-metaint'),
        contentType: response.headers.get('content-type'),
        server: response.headers.get('server'),
        responseTime: Date.now() - startTime,
        icyHeadersPresent: response.headers.get('icy-metaint') !== null
      };

      // Special handling for known radio services
      if (stationUrl.includes('radioparadise.com')) {
        return handleRadioParadise(qualityInfo, stationUrl);
      }

      // Try different metadata extraction methods in order
      const metadata = await tryAllMetadataMethods(response, qualityInfo);
      
      if (metadata) {
        return createSuccessResponse(metadata, qualityInfo);
      }

      // Final fallback - return quality info even if no metadata found
      return createSuccessResponse(null, qualityInfo);

    } catch (error) {
      console.error('Metadata fetch error:', error);
      return createErrorResponse(
        error.name === 'AbortError' ? 'Request timeout' : error.message, 
        500
      );
    }
  }
}

async function handleRadioParadise(qualityInfo, stationUrl) {
  try {
    // Normalize the URL (remove query params and protocol variations)
    const cleanUrl = stationUrl
      .replace(/^https?:\/\//, '')  // Remove http(s)://
      .split('?')[0]               // Remove query params
      .replace(/\/$/, '');         // Remove trailing slash

    // Map of Radio Paradise station URLs to API channel parameters
    const stationMap = {
      'stream.radioparadise.com/aac-320': 'main',
      'stream.radioparadise.com/mellow-320': '1',
      'stream.radioparadise.com/rock-320': '2',
      'stream.radioparadise.com/global-320': '3',
      'stream.radioparadise.com/radio2050-320': '2050',
      'stream.radioparadise.com/serenity': '42'
    };

    // Check which station URL we're dealing with
    let channel = Object.keys(stationMap).find(key => 
      cleanUrl.includes(key)
    );

    if (!channel) {
      console.error('Radio Paradise station not recognized:', cleanUrl);
      throw new Error('Unknown Radio Paradise station');
    }

    const apiUrl = `https://api.radioparadise.com/api/now_playing?chan=${stationMap[channel]}`;
    const response = await fetch(apiUrl, { 
      cf: { 
        cacheTtl: 5 // Reduced cache time for faster updates
      } 
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    qualityInfo.bitrate = '320'; // AAC streams are 320kbps
    qualityInfo.format = 'AAC';

    // Clean up metadata (remove tags, brackets, etc.)
    const title = `${data.artist} - ${data.title}`
      .replace(/\[.*?\]|\(.*?\)/g, '') // Remove [tags] or (text)
      .trim();

    return createSuccessResponse(title, qualityInfo);
  } catch (e) {
    console.error('Radio Paradise metadata error:', e);
    return createErrorResponse(`Radio Paradise: ${e.message}`, 503, qualityInfo);
  }
}

async function tryAllMetadataMethods(response, qualityInfo) {
  // 1. Check ICY headers first (most common)
  const icyTitle = response.headers.get('icy-title');
  if (icyTitle && !isLikelyStationName(icyTitle)) {
    return icyTitle;
  }

  // 2. Parse metadata from stream if meta interval exists
  const metaInt = parseInt(response.headers.get('icy-metaint'));
  if (metaInt) {
    const streamMetadata = await parseMetadataFromStream(response.clone(), metaInt);
    if (streamMetadata) return streamMetadata;
  }

  // 3. Try parsing SHOUTcast v2 metadata
  const shoutcastMetadata = await parseShoutcastV2Metadata(response.clone());
  if (shoutcastMetadata) return shoutcastMetadata;

  // 4. Try parsing OGG streams
  if (qualityInfo.contentType?.includes('ogg')) {
    const oggMetadata = await parseOggMetadata(response.clone());
    if (oggMetadata) return oggMetadata;
  }

  // 5. Try parsing MP3 streams
  if (qualityInfo.contentType?.includes('mpeg')) {
    const mp3Metadata = await parseMp3Metadata(response.clone());
    if (mp3Metadata) return mp3Metadata;
  }

  return null;
}

// New: SHOUTcast v2 metadata parser
async function parseShoutcastV2Metadata(response) {
  try {
    // Read the first 10KB of the response
    const reader = response.body.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value.slice(0, 10240));
    
    // Look for SHOUTcast v2 metadata pattern
    if (chunk.includes('StreamTitle=')) {
      const match = chunk.match(/StreamTitle='([^']*)'/);
      if (match && match[1] && !isLikelyStationName(match[1])) {
        return match[1];
      }
    }
  } catch (e) {
    console.log('Shoutcast v2 metadata parsing error:', e);
  }
  return null;
}

async function parseMetadataFromStream(response, metaInt) {
  try {
    const reader = response.body.getReader();
    let buffer = new Uint8Array();
    let bytesRead = 0;
    // Only read up to 2 metadata blocks for faster response
    const maxBytesToRead = metaInt * 2;

    while (bytesRead < maxBytesToRead) {
      const { done, value } = await reader.read();
      if (done) break;
      
      bytesRead += value.length;
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      // Look for metadata after each audio block
      if (bytesRead >= metaInt) {
        const offset = metaInt * Math.floor(bytesRead / metaInt);
        const metadata = findMetadataInBuffer(buffer, offset, metaInt);
        if (metadata) return metadata;
      }
    }

    return null;
  } catch (e) {
    console.error('Stream metadata parsing error:', e);
    return null;
  }
}

function findMetadataInBuffer(buffer, offset, metaInt) {
  // Check if we have enough data for metadata
  if (buffer.length < offset + 1) return null;
  
  // Get metadata length (in 16-byte blocks)
  const metaLength = buffer[offset] * 16;
  if (metaLength === 0 || offset + 1 + metaLength > buffer.length) return null;

  try {
    const metadataBytes = buffer.slice(offset + 1, offset + 1 + metaLength);
    const metadataString = new TextDecoder().decode(metadataBytes);
    
    // Try both single and double quote patterns
    const patterns = [
      /StreamTitle=(['"])([^'"]*)\1/,
      /StreamTitle='([^']*)'/,
      /StreamTitle="([^"]*)"/
    ];
    
    for (const pattern of patterns) {
      const match = metadataString.match(pattern);
      if (match?.[1] && !isLikelyStationName(match[1])) {
        return match[1];
      }
    }
  } catch (e) {
    console.log('Metadata parsing error:', e);
  }
  return null;
}

async function parseOggMetadata(response) {
  // This is a simplified OGG parser focused on finding metadata quickly
  try {
    const reader = response.body.getReader();
    const { value } = await reader.read();
    const header = new TextDecoder().decode(value.slice(0, 1024));
    
    // Look for common OGG metadata patterns
    if (header.includes('TITLE=')) {
      const match = header.match(/TITLE=([^\n\r]+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (e) {
    console.log('OGG metadata parsing error:', e);
  }
  return null;
}

async function parseMp3Metadata(response) {
  // Simplified ID3 parser for quick metadata extraction
  try {
    const reader = response.body.getReader();
    const { value } = await reader.read();
    
    // Check for ID3 tag at the beginning
    if (value.length >= 10) {
      const id3Header = new TextDecoder().decode(value.slice(0, 3));
      if (id3Header === 'ID3') {
        // Very basic ID3 tag extraction
        const frame = new TextDecoder().decode(value.slice(10, 60));
        const match = frame.match(/TIT2[^\x00]*([^\x00]+)/);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  } catch (e) {
    console.log('MP3 metadata parsing error:', e);
  }
  return null;
}

function isLikelyStationName(text) {
  if (!text) return true;
  const t = text.toLowerCase();
  return (
    t.includes('radio') ||
    t.includes('fm') ||
    t.includes('station') ||
    t.length > 50 ||       // Increased threshold for longer titles
    t.split('-').length > 4 || // More hyphens
    t.split(' ').length > 10   // More words
  );
}

function createSuccessResponse(title, quality = {}) {
  // Only include quality info if we have valid data
  const qualityResponse = {};
  
  if (quality.bitrate) {
    qualityResponse.bitrate = quality.bitrate;
  }
  
  if (quality.contentType) {
    qualityResponse.format = getFormatFromContentType(quality.contentType);
  }
  
  if (quality.metaInterval) {
    qualityResponse.metaInt = quality.metaInterval;
  }
  
  if (quality.responseTime) {
    qualityResponse.responseTime = quality.responseTime;
  }

  return new Response(JSON.stringify({
    success: true,
    title: title ? cleanTitle(title) : null,
    isStationName: title ? isLikelyStationName(title) : true,
    quality: Object.keys(qualityResponse).length > 0 ? qualityResponse : null
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=5' // Reduced cache time
    }
  });
}

function createErrorResponse(message, status = 500, quality = {}) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    quality: null // Never include quality info in error responses
  }), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags
    .replace(/(https?:\/\/[^\s]+)/g, '') // Remove URLs
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\|.*$/, '') // Remove everything after pipe
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/\x00/g, '') // Remove null bytes
    .trim();
}

function getFormatFromContentType(contentType) {
  if (!contentType) return null;
  if (contentType.includes('ogg')) return 'OGG';
  if (contentType.includes('mpeg')) return 'MP3';
  if (contentType.includes('aac')) return 'AAC';
  if (contentType.includes('wav')) return 'WAV';
  if (contentType.includes('flac')) return 'FLAC';
  return contentType.split(';')[0].split('/')[1] || 'Unknown';
}
