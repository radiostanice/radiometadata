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

// Handle Naxi radio stations - COMPLETE REWRITE
async function handleNaxiRadio(stationUrl) {
  try {
    console.log('Handling NAXI station:', stationUrl);
    
    // Map streaming hosts to their corresponding web pages
    const hostToPageMap = {
      'naxidigital-rnb128ssl.streaming.rs': 'rnb',
      'naxidigital-rock128ssl.streaming.rs': 'rock',
      'naxidigital-house128ssl.streaming.rs': 'house',
      'naxidigital-cafe128ssl.streaming.rs': 'cafe',
      'naxidigital-jazz128ssl.streaming.rs': 'jazz',
      'naxidigital-classic128ssl.streaming.rs': 'classic',
      'naxidigital-80s128ssl.streaming.rs': '80s',
      'naxidigital-90s128ssl.streaming.rs': '90s',
      'naxidigital-reggae128.streaming.rs': 'reggae',
      'naxidigital-blues128ssl.streaming.rs': 'blues',
      'naxidigital-chill128ssl.streaming.rs': 'chillout',
      'naxidigital-lounge128ssl.streaming.rs': 'lounge',
      'naxidigital-dance128ssl.streaming.rs': 'dance',
      'naxidigital-funk128ssl.streaming.rs': 'funk',
      'naxidigital-disco128ssl.streaming.rs': 'disco',
      'naxidigital-evergreen128ssl.streaming.rs': 'evergreen',
      'naxidigital-mix128ssl.streaming.rs': 'mix',
      'naxidigital-gold128ssl.streaming.rs': 'gold',
      'naxidigital-latino128ssl.streaming.rs': 'latino',
      'naxidigital-love128ssl.streaming.rs': 'love',
      'naxidigital-clubbing128ssl.streaming.rs': 'clubbing',
      'naxidigital-exyu128ssl.streaming.rs': 'exyu',
      'naxidigital-exyurock128ssl.streaming.rs': 'exyurock',
      'naxidigital-hype128ssl.streaming.rs': 'hype',
      'naxidigital-70s128ssl.streaming.rs': '70s',
      'naxidigital-chillwave128ssl.streaming.rs': 'chillwave',
      'naxidigital-instrumental128.streaming.rs': 'instrumental',
      'naxidigital-fresh128ssl.streaming.rs': 'fresh',
      'naxidigital-boem128ssl.streaming.rs': 'boem',
      'naxidigital-adore128ssl.streaming.rs': 'adore',
      'naxidigital-slager128ssl.streaming.rs': 'slager',
      'naxidigital-millennium128ssl.streaming.rs': 'millennium',
      'naxidigital-fitness128ssl.streaming.rs': 'fitness',
      'naxidigital-kids128ssl.streaming.rs': 'kids',
      'naxidigital-xmas128.streaming.rs': 'xmas'
    };
    
    // Extract host from station URL
    const urlObj = new URL(stationUrl);
    const host = urlObj.hostname;
    
    // Determine the web page to scrape
    let webPage = 'index'; // default
    for (const [streamHost, page] of Object.entries(hostToPageMap)) {
      if (host.includes(streamHost.split('.')[0])) {
        webPage = page;
        break;
      }
    }
    
    // Special handling for index page
    const webUrl = webPage === 'index' 
      ? 'https://www.naxi.rs/' 
      : `https://www.naxi.rs/${webPage}`;
      
    console.log('Scraping URL:', webUrl);
    
    // Scrape the web page
    const nowPlaying = await tryNaxiWebScraping(webUrl, stationUrl);

    if (nowPlaying) {
      console.log('Found metadata:', nowPlaying);
      return createSuccessResponse(nowPlaying, {
        source: 'naxi-web',
        bitrate: '128',
        format: 'MP3',
        responseTime: 0
      });
    }

    console.log('No metadata found for NAXI station');
    return createErrorResponse('Naxi: No metadata found', 404);
    
  } catch (error) {
    console.error('Error fetching Naxi metadata:', error);
    return createErrorResponse(`Naxi: ${error.message}`, 500);
  }
}

// Web scraping function for Naxi.rs with better error handling
async function tryNaxiWebScraping(url, stationUrl) {
  try {
    console.log('Fetching NAXI page:', url);
    
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
    console.log('Received HTML length:', html.length);
    
    const result = extractNaxiNowPlaying(html, stationUrl, url);
    console.log('Extracted result:', result);
    
    return result;
  } catch (error) {
    console.error(`Error with Naxi web scraping (${url}):`, error);
    return null;
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

// Extract currently playing song from Naxi HTML - COMPLETE REWRITE
function extractNaxiNowPlaying(html, stationUrl, webUrl) {
  try {
    console.log('Extracting metadata from HTML for:', webUrl);
    
    // Try multiple patterns in order of specificity
    
    // Pattern 1: Look for the specific structure you mentioned
    // First, try to find data based on the web page
    const urlObj = new URL(webUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const category = pathParts[0] || 'index';
    
    console.log('Category:', category);
    
    // For category pages, look for specific elements
    if (category !== 'index') {
      // Pattern 1: The exact structure you specified
      const pattern1 = /<div class="current-program__data"[^>]*>\s*<p class="artist-name"[^>]*>([^<]+)<\/p>\s*<p class="song-title"[^>]*[^>]*>([^<]+)<\/p>/i;
      let match = html.match(pattern1);
      
      if (match && match[1] && match[2]) {
        const artist = match[1].trim();
        const title = match[2].trim();
        console.log('Pattern 1 matched:', artist, '-', title);
        if (artist && title) {
          return `${artist} - ${title}`;
        }
      }
      
      // Pattern 2: More flexible pattern for current-program__data
      const pattern2 = new RegExp(
        `<div[^>]*class="[^"]*current-program__data[^"]*"[^>]*>\\s*<p[^>]*class="[^"]*artist-name[^"]*"[^>]*>([^<]+)<\\/p>\\s*<p[^>]*class="[^"]*song-title[^"]*"[^>]*>([^<]+)<\\/p>`,
        'gi'
      );
      match = pattern2.exec(html);
      
      if (match && match[1] && match[2]) {
        const artist = match[1].trim();
        const title = match[2].trim();
        console.log('Pattern 2 matched:', artist, '-', title);
        if (artist && title) {
          return `${artist} - ${title}`;
        }
      }
    }
    
    // Pattern 3: Look for any artist-name and song-title classes in proximity
    const artistMatches = [...html.matchAll(/<p[^>]*class="[^"]*artist-name[^"]*"[^>]*>([^<]+)<\/p>/gi)];
    const titleMatches = [...html.matchAll(/<p[^>]*class="[^"]*song-title[^"]*"[^>]*>([^<]+)<\/p>/gi)];
    
    console.log('Found artist matches:', artistMatches.length);
    console.log('Found title matches:', titleMatches.length);
    
    if (artistMatches.length > 0 && titleMatches.length > 0) {
      // Take the first match of each
      const artist = artistMatches[0][1].trim();
      const title = titleMatches[0][1].trim();
      console.log('Pattern 3 matched:', artist, '-', title);
      if (artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    // Pattern 4: Look for data-program elements
    const pattern4 = /<div[^>]*data-program[^>]*>\s*<div[^>]*artist[^>]*>([^<]+)<\/div>\s*<div[^>]*title[^>]*>([^<]+)<\/div>/i;
    let match = html.match(pattern4);
    
    if (match && match[1] && match[2]) {
      const artist = match[1].trim();
      const title = match[2].trim();
      console.log('Pattern 4 matched:', artist, '-', title);
      if (artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    // Pattern 5: Look for "Trenutno" (Currently Playing in Serbian)
    const pattern5 = /Trenutno:[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?-[\s\S]*?<strong>([^<]+)<\/strong>/i;
    match = html.match(pattern5);
    
    if (match && match[1] && match[2]) {
      const artist = match[1].trim();
      const title = match[2].trim();
      console.log('Pattern 5 matched:', artist, '-', title);
      if (artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    // Pattern 6: Look for "Now Playing" text
    const pattern6 = /Now Playing:[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?-[\s\S]*?<strong>([^<]+)<\/strong>/i;
    match = html.match(pattern6);
    
    if (match && match[1] && match[2]) {
      const artist = match[1].trim();
      const title = match[2].trim();
      console.log('Pattern 6 matched:', artist, '-', title);
      if (artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    // Pattern 7: Very generic pattern looking for artist and title in the same container
    const pattern7 = /<div[^>]*class="[^"]*now-playing[^"]*"[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<span[^>]*>([^<]+)<\/span>/i;
    match = html.match(pattern7);
    
    if (match && match[1] && match[2]) {
      const artist = match[1].trim();
      const title = match[2].trim();
      console.log('Pattern 7 matched:', artist, '-', title);
      if (artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    console.log('No patterns matched');
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
    console.log('Metadata parsing error:', e);
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
