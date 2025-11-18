
// Station Handlers Registry
const STATION_HANDLERS = {
  'naxi': handleNaxiRadio,
  'radioparadise': handleRadioParadise,
  'default': handleDefaultStation
};

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
      // Determine which handler to use
      const handler = selectHandler(stationUrl);
      return await handler(stationUrl);

    } catch (error) {
      console.error('Metadata fetch error:', error);
      return createErrorResponse(
        error.name === 'AbortError' ? 'Request timeout' : error.message, 
        500
      );
    }
  }
}

// Handler Selection Logic
function selectHandler(stationUrl) {
  const cleanUrl = normalizeUrlForComparison(stationUrl);
  
  if (isNaxiStation(cleanUrl)) {
    return STATION_HANDLERS.naxi;
  }
  
  if (cleanUrl.includes('radioparadise.com')) {
    return STATION_HANDLERS.radioparade;
  }
  
  return STATION_HANDLERS.default;
}

// Default station handler (unchanged but moved)
async function handleDefaultStation(stationUrl) {
  const fetchOptions = {
    method: 'GET',
    headers: { 
      'Icy-MetaData': '1',
      'User-Agent': 'Mozilla/5.0 (compatible; IcecastMetadataFetcher/1.0)',
      'Accept-Charset': 'utf-8'
    },
    cf: { 
      cacheTtl: 5,
      cacheEverything: true
    }
  };

  const startTime = Date.now();
  
  // Fetch with timeout (3 seconds)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  fetchOptions.signal = controller.signal;

  const response = await fetch(stationUrl, fetchOptions);
  clearTimeout(timeoutId);

  const qualityInfo = {
    bitrate: response.headers.get('icy-br') || null,
    metaInterval: response.headers.get('icy-metaint'),
    contentType: response.headers.get('content-type'),
    server: response.headers.get('server'),
    responseTime: Date.now() - startTime,
    icyHeadersPresent: response.headers.get('icy-metaint') !== null
  };

  // Check if we have ICY headers for metadata
  const icyTitle = response.headers.get('icy-title');
  if (icyTitle && !isLikelyStationName(icyTitle)) {
    return createSuccessResponse(icyTitle, qualityInfo);
  }

  // Parse metadata from stream if meta interval exists
  const metaInt = parseInt(response.headers.get('icy-metaint'));
  if (metaInt) {
    const currentMetadata = await streamMetadataMonitor(response.clone(), metaInt);
    if (currentMetadata) {
      return createSuccessResponse(currentMetadata, qualityInfo);
    }
  }

  // If no metadata found, try alternative methods
  const metadata = await tryAlternativeMethods(response, qualityInfo);
  
  return createSuccessResponse(metadata, qualityInfo);
}

// Helper function for URL normalization
function normalizeUrlForComparison(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(';stream.nsv', '')
    .replace(';*.mp3', '')
    .toLowerCase();
}

// Handle Naxi radio stations
async function handleNaxiRadio(stationUrl) {
  try {
    // Scrape the main Naxi.rs page which contains all station metadata
    const webUrl = 'https://www.naxi.rs/';
    const nowPlaying = await tryNaxiWebScraping(webUrl, stationUrl);

    // Check if we got valid data
    if (nowPlaying) {
      return createSuccessResponse(nowPlaying, {
        source: 'naxi-web',
        bitrate: '128',
        format: 'MP3',
        responseTime: 0
      });
    }

    // Fall back to traditional methods if web scraping fails
    return createErrorResponse('Naxi: No metadata found', 404);
    
  } catch (error) {
    console.error('Error fetching Naxi metadata:', error);
    return createErrorResponse(`Naxi: ${error.message}`, 500);
  }
}

// Web scraping function specifically for Naxi.rs main page
async function tryNaxiWebScraping(url, stationUrl) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      cf: {
        cacheTtl: 10
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    return extractNaxiNowPlaying(html, stationUrl);
  } catch (error) {
    console.error(`Error with Naxi web scraping (${url}):`, error);
    return null;
  }
}

function isNaxiStation(stationUrl) {
    const naxiDomains = [
        'naxi128.streaming.rs',
        'naxidigital-hype128ssl.streaming.rs',
        'naxidigital-rock128ssl.streaming.rs', 
        'naxidigital-exyu128ssl.streaming.rs',
        'naxidigital-exyurock128ssl.streaming.rs',
        'naxidigital-70s128ssl.streaming.rs',
        'naxidigital-80s128ssl.streaming.rs',
        'naxidigital-90s128ssl.streaming.rs',
        'naxidigital-cafe128ssl.streaming.rs',
        'naxidigital-classic128ssl.streaming.rs',
        'naxidigital-jazz128ssl.streaming.rs',
        'naxidigital-chill128ssl.streaming.rs',
        'naxidigital-house128ssl.streaming.rs',
        'naxidigital-lounge128ssl.streaming.rs',
        'naxidigital-chillwave128ssl.streaming.rs',
        'naxidigital-instrumental128.streaming.rs',
        'naxidigital-reggae128.streaming.rs',
        'naxidigital-rnb128ssl.streaming.rs',
        'naxidigital-mix128ssl.streaming.rs',
        'naxidigital-gold128ssl.streaming.rs',
        'naxidigital-blues128ssl.streaming.rs',
        'naxidigital-evergreen128ssl.streaming.rs',
        'naxidigital-funk128ssl.streaming.rs',
        'naxidigital-dance128ssl.streaming.rs',
        'naxidigital-disco128ssl.streaming.rs',
        'naxidigital-clubbing128ssl.streaming.rs',
        'naxidigital-fresh128ssl.streaming.rs',
        'naxidigital-latino128ssl.streaming.rs',
        'naxidigital-love128ssl.streaming.rs',
        'naxidigital-boem128ssl.streaming.rs',
        'naxidigital-adore128ssl.streaming.rs',
        'naxidigital-slager128ssl.streaming.rs',
        'naxidigital-millennium128ssl.streaming.rs',
        'naxidigital-fitness128ssl.streaming.rs',
        'naxidigital-kids128ssl.streaming.rs',
        'naxidigital-xmas128.streaming.rs'
    ];
    
    const cleanUrl = stationUrl
        .replace('https://', '')
        .replace('http://', '')
        .replace(';stream.nsv', '')
        .replace(';*.mp3', '')
        .split('/')[0];
        
    return naxiDomains.some(domain => cleanUrl.includes(domain));
}

// Extract currently playing song from Naxi HTML with new structure
function extractNaxiNowPlaying(html, stationUrl) {
  try {
    // Map streaming URLs to CSS classes used in the HTML
    const stationClassMap = {
      'naxi128.streaming.rs:9152': 'naxi',
      'naxidigital-hype128ssl.streaming.rs:8272': 'hype',
      'naxidigital-rock128ssl.streaming.rs:8182': 'rock',
      'naxidigital-exyu128ssl.streaming.rs:8242': 'exyu',
      'naxidigital-exyurock128ssl.streaming.rs:8402': 'exyurock',
      'naxidigital-70s128ssl.streaming.rs:8382': '70e',
      'naxidigital-80s128ssl.streaming.rs:8042': '80e',
      'naxidigital-90s128ssl.streaming.rs:8282': '90e',
      'naxidigital-cafe128ssl.streaming.rs:8022': 'cafe',
      'naxidigital-classic128ssl.streaming.rs:8032': 'classic',
      'naxidigital-jazz128ssl.streaming.rs:8172': 'jazz',
      'naxidigital-chill128ssl.streaming.rs:8412': 'chill',
      'naxidigital-house128ssl.streaming.rs:8002': 'house',
      'naxidigital-lounge128ssl.streaming.rs:8252': 'lounge',
      'naxidigital-chillwave128ssl.streaming.rs:8322': 'chillwave',
      'naxidigital-instrumental128.streaming.rs:8432': 'instrumental',
      'naxidigital-reggae128.streaming.rs:8422': 'reggae',
      'naxidigital-rnb128ssl.streaming.rs:8122': 'rnb',
      'naxidigital-mix128ssl.streaming.rs:8222': 'mix',
      'naxidigital-gold128ssl.streaming.rs:8062': 'gold',
      'naxidigital-blues128ssl.streaming.rs:8312': 'blues-rock',
      'naxidigital-evergreen128ssl.streaming.rs:8012': 'evergreen',
      'naxidigital-funk128ssl.streaming.rs:8362': 'funk',
      'naxidigital-dance128ssl.streaming.rs:8112': 'dance',
      'naxidigital-disco128ssl.streaming.rs:8352': 'disco',
      'naxidigital-clubbing128ssl.streaming.rs:8092': 'clubbing',
      'naxidigital-fresh128ssl.streaming.rs:8212': 'fresh',
      'naxidigital-latino128ssl.streaming.rs:8232': 'latino',
      'naxidigital-love128ssl.streaming.rs:8102': 'love',
      'naxidigital-boem128ssl.streaming.rs:8162': 'boem',
      'naxidigital-adore128ssl.streaming.rs:8332': 'adore',
      'naxidigital-slager128ssl.streaming.rs:8372': 'slager',
      'naxidigital-millennium128ssl.streaming.rs:8342': 'millennium',
      'naxidigital-fitness128ssl.streaming.rs:8292': 'fitness',
      'naxidigital-kids128ssl.streaming.rs:8052': 'kids',
      'naxidigital-xmas128.streaming.rs:8392': 'xmas'
    };

    // Extract station key from URL
    const cleanUrl = stationUrl
      .replace('https://', '')
      .replace('http://', '')
      .replace(';stream.nsv', '')
      .replace(';*.mp3', '')
      .split('/')[0];

    // Get the CSS class for this station
    const stationClass = stationClassMap[cleanUrl] || cleanUrl.split('.')[0];
    
    // Pattern to match the specific station's artist and song
    const stationPattern = new RegExp(
      `<p class="artist ${stationClass}"[^>]*>([^<]+)<\\/p>\\s*<p class="song ${stationClass}"[^>]*>([^<]+)<\\/p>`,
      'i'
    );
    
    const match = html.match(stationPattern);
    
    if (match && match[1] && match[2]) {
      const artist = match[1].trim();
      const title = match[2].trim();
      
      // Basic validation to avoid station names
      if (artist && title && 
          !artist.toLowerCase().includes('naxi') && 
          !title.toLowerCase().includes('naxi')) {
        return `${artist} - ${title}`;
      }
    }
    
    // Alternative pattern matching the structure you provided
    const alternativePattern = new RegExp(
      `<div class="station-data"[^>]*>\\s*<p class="artist ${stationClass}"[^>]*>([^<]+)<\\/p>\\s*<p class="song ${stationClass}"[^>]*>([^<]+)<\\/p>`,
      'is'
    );
    
    const altMatch = html.match(alternativePattern);
    
    if (altMatch && altMatch[1] && altMatch[2]) {
      const artist = altMatch[1].trim();
      const title = altMatch[2].trim();
      
      if (artist && title && 
          !artist.toLowerCase().includes('naxi') && 
          !title.toLowerCase().includes('naxi')) {
        return `${artist} - ${title}`;
      }
    }

    return null;
  } catch (e) {
    console.error('Naxi parsing error:', e);
    return null;
  }
}

async function streamMetadataMonitor(response, metaInt) {
  try {
    const reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let metadataFound = null;
    const maxAttempts = 3; // Try up to 3 meta intervals
    let attempts = 0;

    while (attempts < maxAttempts && !metadataFound) {
      // Read exactly one metadata interval plus potential metadata block
      const targetBytes = metaInt + (attempts === 0 ? 0 : 1) + 255;

      while (buffer.length < targetBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Efficient buffer appending
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
      }

      // Extract metadata from current position
      metadataFound = extractIcyMetadata(buffer, metaInt, attempts * metaInt);
      attempts++;
    }

    return metadataFound;
  } catch (e) {
    console.error('Metadata monitoring error:', e);
    return null;
  }
}

function extractIcyMetadata(buffer, metaInt, offset = 0) {
  offset = offset || (metaInt * Math.floor(buffer.length / metaInt));
  
  if (buffer.length < offset + 1) return null;
  
  const metaLength = buffer[offset] * 16;
  if (metaLength === 0 || offset + 1 + metaLength > buffer.length) return null;

  try {
    const metadataBytes = buffer.slice(offset + 1, offset + 1 + metaLength);
    
    // Try multiple encodings in sequence
    const encodings = ['utf-8', 'iso-8859-1', 'windows-1250'];
    let metadataString = '';
    
    for (const encoding of encodings) {
      try {
        metadataString = new TextDecoder(encoding).decode(metadataBytes);
        if (metadataString.includes('StreamTitle=')) break;
      } catch (e) {
        console.log(`Failed decoding with ${encoding}`);
      }
    }
    
    // Skip specific empty metadata patterns but keep others for analysis
    if (metadataString.trim() === 'StreamTitle=\'\';' || 
        metadataString.trim() === 'StreamTitle="";') {
      return null;
    }
    
    const streamTitleMatch = metadataString.match(/StreamTitle=['"](.*?)['"]/);
    if (streamTitleMatch) {
      let title = streamTitleMatch[1].trim();
      // Only return null for truly empty titles (after trim)
      if (title === '') return null;
      
      return !isLikelyStationName(title) ? title : null;
    }

    // Alternative pattern for some streams
    const altMatch = metadataString.match(/StreamTitle=([^;]+)/);
    if (altMatch) {
      let title = altMatch[1].trim();
      if (title === '') return null;
      return !isLikelyStationName(title) ? title : null;
    }
    
    // If we have non-empty metadata but no pattern matched, return as-is
    return metadataString.trim() || null;
  } catch (e) {
    console.log('Metadata parsing error:', e);
    return null;
  }
}

async function handleRadioParadise(stationUrl) {
  const qualityInfo = {}; // Initialize empty qualityInfo object
  
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

    const title = `${data.artist} - ${data.title}`;
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

function isLikelyStationName(text) {
  if (!text || !text.trim()) return true;
  const t = text.toLowerCase();
  return (
    t.includes('radio') ||
    t.includes('fm') ||
    t.includes('station') ||
    t.length > 50 ||
    t.split('-').length > 4 ||
    t.split(' ').length > 10 ||
    t.includes('stream') ||
    t.includes('broadcast') ||
    t.includes('naxi')
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
    rawTitle: title || null,  // Include the raw title for reference
    isStationName: title ? isLikelyStationName(title) : true,
    hasMetadata: title !== null,  // Explicitly indicate if metadata was found
    quality: Object.keys(qualityResponse).length > 0 ? qualityResponse : null
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0'
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
  if (!title) return null;
  
  // First basic cleanup
  let cleaned = title
    .replace(/<\/?[^>]+(>|$)/g, '')  // Remove HTML tags
    .replace(/(https?:\/\/[^\s]+)/g, '')  // Remove URLs
    .replace(/\x00/g, '')  // Remove null bytes
    .trim();
    
  // Remove common prefixes if they exist
  const prefixes = [
    'Trenutno:', 'Now Playing:', 'Current:', 
    'Playing:', 'On Air:', 'NP:', 'Now:', '♪'
  ];
  
  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
    }
  }
  
  // Trim any remaining whitespace and normalize spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Only return null for truly empty strings
  return cleaned || null;
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
