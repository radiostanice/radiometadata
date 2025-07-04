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
          cacheTtl: 10,  // Cache for 10 seconds
          cacheEverything: true
        }
      };

      // Start timing the request
      const startTime = Date.now();
      
      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
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

// Updated handleRadioParadise function
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
    const response = await fetch(apiUrl, { cf: { cacheTtl: 15 } });

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

// Try all available metadata extraction methods
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

  // 3. Try parsing OGG streams
  if (qualityInfo.contentType?.includes('ogg')) {
    const oggMetadata = await parseOggMetadata(response.clone());
    if (oggMetadata) return oggMetadata;
  }

  // 4. Try parsing MP3 streams
  if (qualityInfo.contentType?.includes('mpeg')) {
    const mp3Metadata = await parseMp3Metadata(response.clone());
    if (mp3Metadata) return mp3Metadata;
  }

  return null;
}

// Improved ICY metadata parser
async function parseMetadataFromStream(response, metaInt) {
  const reader = response.body.getReader();
  let buffer = new Uint8Array();
  let bytesRead = 0;
  const maxBytesToRead = metaInt * 3; // Read up to 3 metadata blocks

  while (bytesRead < maxBytesToRead) {
    const { done, value } = await reader.read();
    if (done) break;
    
    bytesRead += value.length;
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    buffer = newBuffer;

    // Look for metadata marker
    const metadata = findMetadataInBuffer(buffer, metaInt);
    if (metadata) return metadata;
  }

  return null;
}

function findMetadataInBuffer(buffer, metaInt) {
  // Look for the metadata marker pattern
  for (let i = 0; i < buffer.length - 16; i++) {
    // Common patterns indicating metadata start
    if (
      (buffer[i] === 0x53 && buffer[i+1] === 0x74 && buffer[i+2] === 0x72) || // 'Str' in StreamTitle
      (buffer[i] === 0x4D && buffer[i+1] === 0x65 && buffer[i+2] === 0x74)    // 'Met' in Metadata
    ) {
      try {
        const metadataString = new TextDecoder().decode(buffer.slice(i));
        const titleMatch = metadataString.match(/StreamTitle=['"]([^'"]*)['"]/);
        
        if (titleMatch?.[1] && !isLikelyStationName(titleMatch[1])) {
          return titleMatch[1];
        }
      } catch (e) {
        console.log('Metadata parsing error:', e);
      }
    }
  }
  return null;
}

// Basic OGG metadata parser (simplified)
async function parseOggMetadata(response) {
  // This would require a full OGG parser implementation
  // For now, we'll just return null as it's complex
  return null;
}

// Basic MP3 metadata parser (simplified)
async function parseMp3Metadata(response) {
  // This would require ID3 tag parsing
  // For now, we'll just return null
  return null;
}

// Helper to detect station names vs song titles
function isLikelyStationName(text) {
  if (!text) return true;
  const t = text.toLowerCase();
  return (
    t.includes('radio') ||
    t.includes('fm') ||
    t.includes('station') ||
    t.length > 40 ||  // Very long text is probably not a song title
    t.split('-').length > 3 ||  // Too many hyphens
    t.split(' ').length > 8  // Too many words
  );
}

// Response helpers
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
      'Cache-Control': 'public, max-age=10'
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
    .trim();
}

function getFormatFromContentType(contentType) {
  if (!contentType) return null;
  if (contentType.includes('ogg')) return 'OGG';
  if (contentType.includes('mpeg')) return 'MP3';
  if (contentType.includes('aac')) return 'AAC';
  if (contentType.includes('wav')) return 'WAV';
  return contentType.split(';')[0].split('/')[1] || 'Unknown';
}
