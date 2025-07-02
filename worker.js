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
        return handleRadioParadise(qualityInfo);
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

// Specialized handlers for specific radio services
async function handleRadioParadise(qualityInfo) {
  try {
    const apiUrl = 'https://api.radioparadise.com/api/now_playing';
    const response = await fetch(apiUrl, {
      cf: { cacheTtl: 15 }
    });
    
    if (!response.ok) throw new Error('API request failed');
    
    const data = await response.json();
    qualityInfo.bitrate = '320'; // Radio Paradise streams are typically 320kbps
    
    return createSuccessResponse(
      `${data.artist} - ${data.title}`,
      qualityInfo
    );
  } catch (e) {
    console.error('Radio Paradise API failed:', e);
    return createErrorResponse('Radio Paradise API unavailable', 503, qualityInfo);
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
  const maxBytesToRead = metaInt * 5; // Read up to 5 metadata blocks

  while (bytesRead < maxBytesToRead) {
    const { done, value } = await reader.read();
    if (done) break;
    
    bytesRead += value.length;
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    buffer = newBuffer;

    // Try both metadata detection methods in order
    const metadataFromPattern = findMetadataInBuffer(buffer, metaInt);
    if (metadataFromPattern) return metadataFromPattern;
    
    const metadataFromMultiple = findMultipleMetadataPatterns(buffer);
    if (metadataFromMultiple) return metadataFromMultiple;
  }

  return null;
}

function findMetadataInBuffer(buffer, metaInt) {
  // Look for hexadecimal patterns indicating metadata start
  for (let i = 0; i < buffer.length - 16; i++) {
    if (
      (buffer[i] === 0x53 && buffer[i+1] === 0x74 && buffer[i+2] === 0x72) || // 'Str' in StreamTitle
      (buffer[i] === 0x4D && buffer[i+1] === 0x65 && buffer[i+2] === 0x74)    // 'Met' in Metadata
    ) {
      try {
        const metadataString = new TextDecoder().decode(buffer.slice(i));
        // First try the standard StreamTitle pattern
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

function findMultipleMetadataPatterns(buffer) {
  // Look for multiple possible metadata patterns
  const patterns = [
    /StreamTitle=['"]([^'"]*)['"]/,     // Standard ICY metadata
    /Title=['"]([^'"]*)['"]/,           // Alternative casing
    /TITLE=['"]([^'"]*)['"]/,           // Uppercase
    /(?:Now Playing|Sada se pušta|Sada slušate|Slušate|Trenutno slušate): ([^\x00]*)/i,  // Naxi-style
    /([^\-]+)\s*-\s*([^\-]+)/            // Artist - Title format
  ];

  try {
    const text = new TextDecoder().decode(buffer);
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1] && !isLikelyStationName(match[1])) {
        // For artist-title pattern, combine the groups
        if (pattern === /([^\-]+)\s*-\s*([^\-]+)/ && match[2]) {
          return `${match[1].trim()} - ${match[2].trim()}`;
        }
        return match[1].trim();
      }
    }
  } catch (e) {
    console.log('Metadata pattern matching error:', e);
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
