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
      // Configuration for fetching the stream
      const fetchOptions = {
        method: 'GET',
        headers: { 
          'Icy-MetaData': '1',
          'User-Agent': 'Mozilla/5.0 (compatible; IcecastMetadataFetcher/1.0)'
        },
        cf: { 
          cacheTtl: 5,
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

      // Check if we have ICY headers for metadata
      const icyTitle = response.headers.get('icy-title');
      if (icyTitle && !isLikelyStationName(icyTitle)) {
        return createSuccessResponse(icyTitle, qualityInfo);
      }

      // Parse metadata from stream if meta interval exists
      const metaInt = parseInt(response.headers.get('icy-metaint'));
      if (metaInt) {
        const streamMetadata = await parseMetadataFromStream(response.clone(), metaInt);
        if (streamMetadata) {
          return createSuccessResponse(streamMetadata, qualityInfo);
        }
      }

      // If no metadata found, try alternative methods
      const metadata = await tryAlternativeMethods(response, qualityInfo);
      
      // Final fallback - return quality info even if no metadata found
      return createSuccessResponse(metadata || null, qualityInfo);

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
      .replace(/^https?:\/\//, '')
      .split('?')[0]
      .replace(/\/$/, '');

    const stationMap = {
      'stream.radioparadise.com/aac-320': 'main',
      'stream.radioparadise.com/mellow-320': '1',
      'stream.radioparadise.com/rock-320': '2',
      'stream.radioparadise.com/global-320': '3',
      'stream.radioparadise.com/radio2050-320': '2050',
      'stream.radioparadise.com/serenity': '42'
    };

    let channel = Object.keys(stationMap).find(key => cleanUrl.includes(key));

    if (!channel) {
      console.error('Radio Paradise station not recognized:', cleanUrl);
      throw new Error('Unknown Radio Paradise station');
    }

    const apiUrl = `https://api.radioparadise.com/api/now_playing?chan=${stationMap[channel]}`;
    const response = await fetch(apiUrl, { 
      cf: { 
        cacheTtl: 5
      } 
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    qualityInfo.bitrate = '320';
    qualityInfo.format = 'AAC';

    const title = `${data.artist} - ${data.title}`
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .trim();

    return createSuccessResponse(title, qualityInfo);
  } catch (e) {
    console.error('Radio Paradise metadata error:', e);
    return createErrorResponse(`Radio Paradise: ${e.message}`, 503, qualityInfo);
  }
}

async function tryAlternativeMethods(response, qualityInfo) {
  try {
    // Check for SHOUTcast v1 metadata (similar to ICY)
    const shoutcastMetadata = await parseShoutcastV1Metadata(response.clone());
    if (shoutcastMetadata && !isLikelyStationName(shoutcastMetadata)) {
      return shoutcastMetadata;
    }

    return null;
  } catch (e) {
    console.error('Alternative metadata extraction error:', e);
    return null;
  }
}

async function parseShoutcastV1Metadata(response) {
  try {
    const reader = response.body.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value.slice(0, 4096));
    
    // Look for SHOUTcast v1 metadata pattern (same as ICY)
    const matches = chunk.match(/StreamTitle=['"](.*?)['"]/);
    if (matches && matches[1]) {
      return matches[1].trim();
    }
  } catch (e) {
    console.log('Shoutcast v1 metadata parsing error:', e);
  }
  return null;
}

async function parseMetadataFromStream(response, metaInt) {
  try {
    const reader = response.body.getReader();
    let buffer = new Uint8Array();
    let bytesRead = 0;
    const maxBytesToRead = metaInt * 2; // Read enough to ensure we get metadata

    while (bytesRead < maxBytesToRead) {
      const { done, value } = await reader.read();
      if (done) break;
      
      bytesRead += value.length;
      const newBuffer = new Uint8Array(buffer.length + value.length);
      newBuffer.set(buffer);
      newBuffer.set(value, buffer.length);
      buffer = newBuffer;

      if (bytesRead >= metaInt) {
        const metadata = extractIcyMetadata(buffer, metaInt);
        if (metadata) return metadata;
      }
    }

    return null;
  } catch (e) {
    console.error('Stream metadata parsing error:', e);
    return null;
  }
}

function extractIcyMetadata(buffer, metaInt) {
  const offset = metaInt * Math.floor(buffer.length / metaInt);
  
  if (buffer.length < offset + 1) return null;
  
  const metaLength = buffer[offset] * 16;
  if (metaLength === 0 || offset + 1 + metaLength > buffer.length) return null;

  try {
    const metadataBytes = buffer.slice(offset + 1, offset + 1 + metaLength);
    let metadataString = new TextDecoder().decode(metadataBytes);
    
    // Check for empty metadata
    if (!metadataString.trim()) return null;
    
    // Improved metadata pattern matching
    const streamTitleMatch = metadataString.match(/StreamTitle=['"](.*?)['"]/);
    if (streamTitleMatch && streamTitleMatch[1]) {
      const title = streamTitleMatch[1].trim();
      return title && !isLikelyStationName(title) ? title : null;
    }

    // Alternative pattern for some streams
    const altMatch = metadataString.match(/StreamTitle=([^;]+)/);
    if (altMatch && altMatch[1]) {
      const title = altMatch[1].trim();
      return title && !isLikelyStationName(title) ? title : null;
    }
    
    // If we have non-empty metadata but no pattern matched, return as-is
    return metadataString.trim() || null;
  } catch (e) {
    console.log('Metadata parsing error:', e);
  }
  return null;
}

function isLikelyStationName(text) {
  if (!text || !text.trim()) return true;
  const t = text.toLowerCase();
  return (
    t.includes('radio') ||
    t.includes('fm') ||
    t.includes('station') ||
    t.length > 50 ||
    t.split('-').length > 4 ||
    t.split(' ').length > 10
  );
}

function createSuccessResponse(title, quality = {}) {
  const qualityResponse = {};
  
  if (quality.bitrate) qualityResponse.bitrate = quality.bitrate;
  if (quality.contentType) qualityResponse.format = getFormatFromContentType(quality.contentType);
  if (quality.metaInterval) qualityResponse.metaInt = quality.metaInterval;
  if (quality.responseTime) qualityResponse.responseTime = quality.responseTime;

  return new Response(JSON.stringify({
    success: true,
    title: title ? cleanTitle(title) : null,
    isStationName: title ? isLikelyStationName(title) : true,
    quality: Object.keys(qualityResponse).length > 0 ? qualityResponse : null
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=5'
    }
  });
}

function createErrorResponse(message, status = 500, quality = {}) {
  return new Response(JSON.stringify({
    success: false,
    error: message,
    quality: quality ? {
      responseTime: quality.responseTime,
      server: quality.server
    } : null
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
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/(https?:\/\/[^\s]+)/g, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\|.*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/\x00/g, '')
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
