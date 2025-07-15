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

// Replace your complex fetch logic with this simpler version
try {
  const response = await fetch(stationUrl, {
    method: 'GET',
    headers: { 
      'Icy-MetaData': '1',
      'User-Agent': 'Mozilla/5.0 (compatible; RadioMetadataFetcher/2.0)'
    },
    signal: AbortSignal.timeout(5000), // Simplified timeout
  });

      // Start timing the request
      const startTime = Date.now();
      
      // Try fast fetch first
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fastTimeout);
      
      let response = await fetch(stationUrl, {
        ...fetchOptions,
        signal: controller.signal
      }).catch(() => null);
      
      clearTimeout(timeoutId);

      // If fast fetch failed or doesn't have metadata, try with longer timeout
      if (!response || !response.headers.get('icy-metaint')) {
        const slowController = new AbortController();
        const slowTimeoutId = setTimeout(() => slowController.abort(), slowTimeout);
        
        response = await fetch(stationUrl, {
          ...fetchOptions,
          signal: slowController.signal,
          cf: { 
            cacheTtl: 5,  // Short cache for metadata
            cacheEverything: true
          }
        });
        
        clearTimeout(slowTimeoutId);
      }

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

// Improved Radio Paradise metadata handler
async function handleRadioParadise(qualityInfo, stationUrl) {
  try {
    // Extract channel from URL more reliably
    const urlObj = new URL(stationUrl);
    const pathParts = urlObj.pathname.split('/').filter(p => p);
    const channelMap = {
      'aac-320': 'main',
      'mellow-320': '1',
      'rock-320': '2', 
      'global-320': '3',
      'radio2050-320': '2050',
      'serenity': '42'
    };
    
    const channelKey = Object.keys(channelMap).find(key => 
      pathParts.some(part => part.includes(key))
    );
    
    if (!channelKey) throw new Error('Unknown Radio Paradise station');
    
    // Use newer v3 API endpoint
    const apiUrl = `https://api.radioparadise.com/api/v3/now_playing/${channelMap[channelKey]}`;
    const response = await fetch(apiUrl, { 
      cf: { 
        cacheTtl: 5,  // Short cache for frequent updates
        cacheEverything: true
      }
    });

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    
    const data = await response.json();
    qualityInfo.bitrate = '320';
    qualityInfo.format = 'AAC';
    
    // Extract artist and title, handling missing fields
    const artist = data.artist?.trim() || '';
    const title = (data.title?.trim() || '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
    
    return createSuccessResponse(
      artist && title ? `${artist} - ${title}` : title || artist,
      qualityInfo
    );
    
  } catch (e) {
    console.error('Radio Paradise metadata error:', e);
    return createErrorResponse(`Radio Paradise: ${e.message}`, 503, qualityInfo);
  }
}

// Optimized metadata extraction pipeline
async function tryAllMetadataMethods(response, qualityInfo) {
  // 1. Check ICY headers first (most common) - keep it simple
  const icyTitle = response.headers.get('icy-title');
  if (icyTitle && !isLikelyStationName(icyTitle)) {
    return cleanTitle(icyTitle);
  }

  // 2. Parse metadata from stream if meta interval exists
  const metaInt = parseInt(response.headers.get('icy-metaint'));
  if (metaInt) {
    return await parseMetadataFromStream(response.clone(), metaInt);
  }

  // For other formats, return null (keep it simple for now)
  return null;
}

// Faster metadata stream parser with timeout
async function parseMetadataFromStream(response, metaInt) {
  const METADATA_TIMEOUT = 5000;
  const READ_SIZE = metaInt + 256; // Read first metadata block plus some buffer

  try {
    const reader = response.body.getReader();
    const { value } = await Promise.race([
      reader.read(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), METADATA_TIMEOUT)
      )
    ]);

    if (!value) return null;

    // Simple metadata extraction (like in your working version)
    const str = new TextDecoder().decode(value);
    const titleMatch = str.match(/StreamTitle=['"]([^'"]*)['"]/);
    return titleMatch?.[1] && !isLikelyStationName(titleMatch[1]) 
      ? cleanTitle(titleMatch[1]) 
      : null;
  } catch (e) {
    console.log('Metadata stream parsing error:', e);
    return null;
  }
}

// More robust buffer analysis
function findMetadataInBuffer(buffer, metaInt) {
  // Convert first 128 bytes to string for quick check
  const str = new TextDecoder().decode(buffer.slice(0, Math.min(128, buffer.length)));
  
  // Match common metadata patterns
  const titleMatch = str.match(/StreamTitle=['"]([^'"]*)['"]/);
  if (titleMatch?.[1] && !isLikelyStationName(titleMatch[1])) {
    return titleMatch[1];
  }

  // For binary metadata formats
  if (buffer.length >= 16) {
    const header = Array.from(buffer.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    
    // Check for common binary metadata patterns
    if (/53 74 72 65 61 6d 54 69 74 6c 65/.test(header)) { // "StreamTitle" in hex
      try {
        const fullStr = new TextDecoder().decode(buffer);
        const binaryTitleMatch = fullStr.match(/StreamTitle=['"]([^'"]*)['"]/);
        return binaryTitleMatch?.[1] && !isLikelyStationName(binaryTitleMatch[1]) 
          ? binaryTitleMatch[1] 
          : null;
      } catch (e) {
        console.log('Binary metadata decode error:', e);
      }
    }
  }
  
  return null;
}

// Placeholder for OGG metadata parser
async function parseOggMetadata(response) {
  // In a real implementation, this would parse OGG headers
  return null;
}

// Placeholder for MP3 metadata parser
async function parseMp3Metadata(response) {
  // In a real implementation, this would parse ID3 tags
  return null;
}

// Improved response helpers
function createSuccessResponse(title, quality = {}) {
  const response = {
    success: true,
    title: title ? cleanTitle(title) : null,
    isStationName: title ? isLikelyStationName(title) : true,
    quality: quality.bitrate || quality.format || quality.metaInterval
      ? {
          bitrate: quality.bitrate,
          format: getFormatFromContentType(quality.contentType),
          metaInt: quality.metaInterval,
          responseTime: quality.responseTime
        } 
      : null
  };

  return new Response(JSON.stringify(response), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, max-age=3', // Reduced cache for more frequent updates
      'Expires': new Date(Date.now() + 3000).toUTCString() // 3 second expiration
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

// Helper functions (unchanged but included for completeness)
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
