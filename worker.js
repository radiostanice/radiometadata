// Station Handlers Registry
const STATION_HANDLERS = {
  'naxi': handleNaxiRadio,
  'radioparadise': handleRadioParadise,
  'default': handleDefaultStation
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    // Parse request URL
    const url = new URL(request.url);
    const stationUrl = url.searchParams.get('url');
    
    if (!stationUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing station URL parameter'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    try {
      // Determine which handler to use
      const handler = selectHandler(stationUrl);
      return await handler(stationUrl);

    } catch (error) {
      console.error('Metadata fetch error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.name === 'AbortError' ? 'Request timeout' : error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
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
    return STATION_HANDLERS.radioparadise;
  }
  
  return STATION_HANDLERS.default;
}

// Default station handler
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

  try {
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
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
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

// Enhanced Naxi station handler with correct station mapping
async function handleNaxiRadio(stationUrl) {
  try {
    // Map streaming hosts to their corresponding web pages and data-station values
    const hostToInfoMap = {
      'naxi128.streaming.rs:9152': { page: 'live', station: 'live' }, // Live station
      'naxidigital-rnb128ssl.streaming.rs': { page: 'rnb', station: 'rnb' },
      'naxidigital-rock128ssl.streaming.rs': { page: 'rock', station: 'rock' },
      'naxidigital-house128ssl.streaming.rs': { page: 'house', station: 'house' },
      'naxidigital-cafe128ssl.streaming.rs': { page: 'cafe', station: 'cafe' },
      'naxidigital-jazz128ssl.streaming.rs': { page: 'jazz', station: 'jazz' },
      'naxidigital-classic128ssl.streaming.rs': { page: 'classic', station: 'classic' },
      'naxidigital-80s128ssl.streaming.rs': { page: '80e', station: '80e' },
      'naxidigital-90s128ssl.streaming.rs': { page: '90e', station: '90e' },
      'naxidigital-reggae128.streaming.rs': { page: 'reggae', station: 'reggae' },
      'naxidigital-blues128ssl.streaming.rs': { page: 'blues-rock', station: 'blues-rock' },
      'naxidigital-chill128ssl.streaming.rs': { page: 'chillout', station: 'chill' },
      'naxidigital-lounge128ssl.streaming.rs': { page: 'lounge', station: 'lounge' },
      'naxidigital-dance128ssl.streaming.rs': { page: 'dance', station: 'dance' },
      'naxidigital-funk128ssl.streaming.rs': { page: 'funk', station: 'funk' },
      'naxidigital-disco128ssl.streaming.rs': { page: 'disco', station: 'disco' },
      'naxidigital-evergreen128ssl.streaming.rs': { page: 'evergreen', station: 'evergreen' },
      'naxidigital-mix128ssl.streaming.rs': { page: 'mix', station: 'mix' },
      'naxidigital-gold128ssl.streaming.rs': { page: 'gold', station: 'gold' },
      'naxidigital-latino128ssl.streaming.rs': { page: 'latino', station: 'latino' },
      'naxidigital-love128ssl.streaming.rs': { page: 'love', station: 'love' },
      'naxidigital-clubbing128ssl.streaming.rs': { page: 'clubbing', station: 'clubbing' },
      'naxidigital-exyu128ssl.streaming.rs': { page: 'exyu', station: 'exyu' },
      'naxidigital-exyurock128ssl.streaming.rs': { page: 'exyurock', station: 'exyurock' },
      'naxidigital-hype128ssl.streaming.rs': { page: 'hype', station: 'hype' },
      'naxidigital-70s128ssl.streaming.rs': { page: '70e', station: '70e' },
      'naxidigital-chillwave128ssl.streaming.rs': { page: 'chillwave', station: 'chillwave' },
      'naxidigital-instrumental128.streaming.rs': { page: 'instrumental', station: 'instrumental' },
      'naxidigital-fresh128ssl.streaming.rs': { page: 'fresh', station: 'fresh' },
      'naxidigital-boem128ssl.streaming.rs': { page: 'boem', station: 'boem' },
      'naxidigital-adore128ssl.streaming.rs': { page: 'adore', station: 'adore' },
      'naxidigital-slager128ssl.streaming.rs': { page: 'slager', station: 'slager' },
      'naxidigital-millennium128ssl.streaming.rs': { page: 'millennium', station: 'millennium' },
      'naxidigital-fitness128ssl.streaming.rs': { page: 'fitness', station: 'fitness' },
      'naxidigital-kids128ssl.streaming.rs': { page: 'kids', station: 'kids' },
      'naxidigital-xmas128ssl.streaming.rs': { page: 'xmas', station: 'xmas' }
    };
    
    // Extract host from station URL
    const urlObj = new URL(stationUrl);
    const host = urlObj.hostname;
    
    // Determine the web page and data-station value
    let pageInfo = null;
    for (const [streamHost, info] of Object.entries(hostToInfoMap)) {
      if (host.includes(streamHost.split('.')[0])) {
        pageInfo = info;
        break;
      }
    }
    
    // If no match found, return error
    if (!pageInfo) {
      return createErrorResponse('Naxi: Unknown station URL', 400);
    }
    
    // Build the web URL
    const webUrl = `https://www.naxi.rs/${pageInfo.page}`;
    
    // Add delay to allow JavaScript to update content (as requested)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Scrape the web page
    const nowPlaying = await tryNaxiWebScraping(webUrl, stationUrl, pageInfo.station);

    if (nowPlaying) {
      return createSuccessResponse(nowPlaying, {
        source: 'naxi-web',
        bitrate: '128',
        format: 'MP3',
        responseTime: 0
      });
    }

    return createErrorResponse('Naxi: No metadata found', 404);
    
  } catch (error) {
    return createErrorResponse(`Naxi: ${error.message}`, 500);
  }
}

// Enhanced web scraping function for Naxi.rs with better error handling
async function tryNaxiWebScraping(url, stationUrl, dataStation) {
  try {
    // Scrape the web page immediately after the delay in handleNaxiRadio
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,sr;q=0.8',
        'Cache-Control': 'no-cache'
      },
      cf: {
        cacheTtl: 0 // Disable caching for fresh data
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const result = extractNaxiNowPlaying(html, dataStation, url);
    
    return result;
  } catch (error) {
    throw error;
  }
}

function isNaxiStation(stationUrl) {
  const cleanUrl = stationUrl
    .replace('https://', '')
    .replace('http://', '')
    .replace(';stream.nsv', '')
    .replace(';*.mp3', '')
    .split('/')[0];
    
  return cleanUrl.includes('naxi');
}

// Enhanced extraction with precise targeting to avoid recently played songs
function extractNaxiNowPlaying(html, dataStation, webUrl) {
  try {
    // Target the first occurrence of current-program__data specifically
    const currentProgramRegex = /<div class="current-program__data">[\s\S]*?<p class="artist-name"[^>]*>([^<]+)<\/p>[\s\S]*?<p class="song-title"[^>]*data-station="([^"]*)"[^>]*>([^<]+)<\/p>/i;
    
    const match = html.match(currentProgramRegex);
    
    if (match) {
      const artist = match[1].trim();
      const stationMatch = match[2].trim();
      const title = match[3].trim();
      
      // Ensure the data-station matches our target station
      if (stationMatch === dataStation && artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    // Fallback to original pattern matching but with better targeting
    let artist = null;
    let title = null;
    
    // Find the first matching artist-name within current-program section
    const currentProgramSection = html.match(/<div class="current-program">([\s\S]*?)<div class="latest-songs">/i);
    if (currentProgramSection) {
      const sectionContent = currentProgramSection[1];
      
      const artistPattern = /<p[^>]*class="[^"]*artist-name[^"]*"[^>]*>([^<]+)<\/p>/i;
      const artistMatch = sectionContent.match(artistPattern);
      if (artistMatch && artistMatch[1]) {
        artist = artistMatch[1].trim();
      }
      
      // Pattern for song-title with specific data-station within current-program section
      const titlePattern = new RegExp(`<p[^>]*class="[^"]*song-title[^"]*"[^>]*data-station="${dataStation}"[^>]*>([^<]+)<\\/p>`, 'i');
      const titleMatch = sectionContent.match(titlePattern);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }
    }
    
    // If we found both, return the result
    if (artist && title) {
      return `${artist} - ${title}`;
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

async function streamMetadataMonitor(response, metaInt) {
  try {
    const reader = response.body.getReader();
    let buffer = new Uint8Array(0);
    let metadataFound = null;
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts && !metadataFound) {
      const targetBytes = metaInt + (attempts === 0 ? 0 : 1) + 255;

      while (buffer.length < targetBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;
      }

      metadataFound = extractIcyMetadata(buffer, metaInt, attempts * metaInt);
      attempts++;
    }

    return metadataFound;
  } catch (e) {
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
    const encodings = ['utf-8', 'iso-8859-1', 'windows-1250'];
    let metadataString = '';
    
    for (const encoding of encodings) {
      try {
        metadataString = new TextDecoder(encoding).decode(metadataBytes);
        if (metadataString.includes('StreamTitle=')) break;
      } catch (e) {
        // Ignore encoding errors
      }
    }
    
    if (metadataString.trim() === 'StreamTitle=\'\';' || 
        metadataString.trim() === 'StreamTitle="";') {
      return null;
    }
    
    const streamTitleMatch = metadataString.match(/StreamTitle=['"](.*?)['"]/);
    if (streamTitleMatch) {
      let title = streamTitleMatch[1].trim();
      if (title === '') return null;
      return !isLikelyStationName(title) ? title : null;
    }

    const altMatch = metadataString.match(/StreamTitle=([^;]+)/);
    if (altMatch) {
      let title = altMatch[1].trim();
      if (title === '') return null;
      return !isLikelyStationName(title) ? title : null;
    }
    
    return metadataString.trim() || null;
  } catch (e) {
    return null;
  }
}

async function handleRadioParadise(stationUrl) {
  const qualityInfo = {};
  
  try {
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
    return createErrorResponse(`Radio Paradise: ${e.message}`, 503, qualityInfo);
  }
}

async function tryAlternativeMethods(response, qualityInfo) {
  try {
    const shoutcastMetadata = await parseShoutcastV1Metadata(response.clone());
    if (shoutcastMetadata && !isLikelyStationName(shoutcastMetadata)) {
      return shoutcastMetadata;
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function parseShoutcastV1Metadata(response) {
  try {
    const reader = response.body.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value.slice(0, 4096));
    
    const matches = chunk.match(/StreamTitle=['"](.*?)['"]/);
    if (matches && matches[1]) {
      return matches[1].trim();
    }
  } catch (e) {
    // Ignore errors
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
    rawTitle: title || null,
    isStationName: title ? isLikelyStationName(title) : true,
    hasMetadata: title !== null,
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
  
  let cleaned = title
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/(https?:\/\/[^\s]+)/g, '')
    .replace(/\x00/g, '')
    .trim();
    
  const prefixes = [
    'Trenutno:', 'Now Playing:', 'Current:', 
    'Playing:', 'On Air:', 'NP:', 'Now:', '♪'
  ];
  
  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
    }
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Decode common HTML entities
  const entities = {
    '&#039;': "'",
    '&amp;': '&',
    '<': '<',
    '>': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`'
  };

  cleaned = cleaned.replace(
    /&#?\w+;/g,
    match => entities[match] || match
  );

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
