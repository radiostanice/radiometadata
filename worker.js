Play radio stations get song title to be - (just a dash).  HEre are the play radio stations:         <div class="radio" data-name="Play Radio" data-link="https://stream.playradio.rs:8443/play.mp3" data-genre="pop,strana"><div class="radio-text">Play Radio</div></div>
        <div class="radio" data-name="Play Rock" data-link="https://stream.playradio.rs:8443/rock.mp3" data-genre="rock,strana"><div class="radio-text">Play Rock</div></div>
        <div class="radio" data-name="Play Party" data-link="https://stream.playradio.rs:8443/party.mp3" data-genre="dance,strana,pop"><div class="radio-text">Play Party</div></div>
        <div class="radio" data-name="Play Soft" data-link="https://stream.playradio.rs:8443/soft.mp3" data-genre="strana,house"><div class="radio-text">Play Soft</div></div>
        <div class="radio" data-name="Play Urban" data-link="https://stream.playradio.rs:8443/urban.mp3" data-genre="strana"><div class="radio-text">Play Urban</div></div>	
        <div class="radio" data-name="Play Balkan" data-link="https://stream.playradio.rs:8443/balkan.aac" data-genre="hiphop,zabavna"><div class="radio-text">Play Balkan</div></div>
 
 Here is the url: https://playradio.rs/ajax/now_playing.php 
 
 The song title is Irie FM - Oda
 but looking into header it has data in request: {
	"artist": "Irie+FM",
	"title": "Oda",
	"last_artist": "Retrospektiva",
	"last_title": "Samo+ti",
	"last_five[0][order]": "1",
	"last_five[0][artist]": "Retrospektiva",
	"last_five[0][title]": "Samo+ti",
	"last_five[1][order]": "2",
	"last_five[1][artist]": "Irie+FM",
	"last_five[1][title]": "Oda",
	"last_five[2][order]": "3",
	"last_five[2][artist]": "Retrospektiva",
	"last_five[2][title]": "Samo+ti",
	"last_five[3][order]": "4",
	"last_five[3][artist]": "Irie+FM",
	"last_five[3][title]": "Oda",
	"last_five[4][order]": "5",
	"last_five[4][artist]": "Retrospektiva",
	"last_five[4][title]": "Samo+ti",
	"dataType": "json",
	"stream": "https://stream.playradio.rs:8443/balkan.aac"
}

And response is: 
Disable Cache
74 requests
96.16 kB / 123.76 kB transferred
Finish: 5.84 min
DOMContentLoaded: 5.69 s
load: 6.34 s
	
last_five_list	`<div class="d-flex flex-row gap-1">\n <div class="width-50px">\n <h1 class="fs-1 green-dark fw-bold pl-no">1.</h1>\n </div>\n <div class="lp-informations">\n <span class="lp-title">Teddy Swims</span><br>\n <span class="text-uppercase">Guilty</span>\n </div>\n </div><div class="d-flex flex-row gap-1">\n <div class="width-50px">\n <h1 class="fs-1 green-dark fw-bold pl-no">2.</h1>\n </div>\n <div class="lp-informations">\n <span …>\n <div class="lp-informations">\n <span class="lp-title">Wes Nelson</span><br>\n <span class="text-uppercase">Yellow</span>\n </div>\n </div><div class="d-flex flex-row gap-1">\n <div class="width-50px">\n <h1 class="fs-1 green-dark fw-bold pl-no">5.</h1>\n </div>\n <div class="lp-informations">\n <span class="lp-title">Ofenbach</span><br>\n <span class="text-uppercase">Feelings don't lie w. salem ilese</span>\n </div>\n </div>`
last_five_list_right	`<div class="five_item_right">\n <div class="five_number_right">1</div>\n <div class="artist_right">\n <span class="five_artist">Teddy Swims</span><br>\n <span class="five_song">Guilty</span>\n </div>\n </div><div class="five_item_right">\n <div class="five_number_right">2</div>\n <div class="artist_right">\n <span class="five_artist">30 seconds to Mars</span><br>\n <span class="five_song">Stuck</span>\n </div>\n </div…em_right">\n <div class="five_number_right">4</div>\n <div class="artist_right">\n <span class="five_artist">Wes Nelson</span><br>\n <span class="five_song">Yellow</span>\n </div>\n </div><div class="five_item_right">\n <div class="five_number_right">5</div>\n <div class="artist_right">\n <span class="five_artist">Ofenbach</span><br>\n <span class="five_song">Feelings don't lie w. salem ilese</span>\n </div>\n </div>`
scroll	'<div id="scroll" class="marquee now_player_title marquee -speed-normal marquee-direction-alternate" data-marquee="Ofenbach - Oda"></div>'

Here is my worker.js: // Station Handlers Registry
const STATION_HANDLERS = {
  'naxi': handleNaxiRadio,
  'radioparadise': handleRadioParadise,
  'play-radio': handlePlayRadio,
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
  
  if (cleanUrl.includes('playradio.rs')) {
    return STATION_HANDLERS['play-radio'];
  }
  
  return STATION_HANDLERS.default;
}

async function handlePlayRadio(stationUrl) {
  try {
    // Extract the stream identifier from the URL
    const streamMatch = stationUrl.match(/playradio\.rs.*?\/([^\/]+)\.(mp3|aac)/i);
    if (!streamMatch || !streamMatch[1]) {
      throw new Error('Could not identify Play Radio stream');
    }
    
    const streamName = streamMatch[1]; // e.g. "play", "rock", "party", etc.
    
    // Prepare form data for the API request
    const formData = new FormData();
    formData.append('artist', '');
    formData.append('title', '');
    formData.append('last_artist', '');
    formData.append('last_title', '');
    formData.append('dataType', 'json');
    formData.append('stream', stationUrl);
    
    // Add last_five array entries (required by the API)
    for (let i = 0; i < 5; i++) {
      formData.append(`last_five[${i}][order]`, String(i+1));
      formData.append(`last_five[${i}][artist]`, '');
      formData.append(`last_five[${i}][title]`, '');
    }
    
    // Make the API request
    const apiUrl = 'https://playradio.rs/ajax/now_playing.php';
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Referer': 'https://playradio.rs/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      cf: { cacheTtl: 5 }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    
    // First try to get direct artist and title from the response
    if (data.artist && data.title) {
      return createSuccessResponse(`${data.artist} - ${data.title}`, {
        source: 'play-radio-api',
        responseTime: 0
      });
    }
    
    // Check for last_five_list HTML content
    if (data.last_five_list) {
      // Try to parse the first song from last_five_list
      const firstSongMatch = data.last_five_list.match(/<span class="lp-title">([^<]+)<\/span><br>\s*<span class="text-uppercase">([^<]+)<\/span>/);
      if (firstSongMatch && firstSongMatch[1] && firstSongMatch[2]) {
        return createSuccessResponse(`${firstSongMatch[1].trim()} - ${firstSongMatch[2].trim()}`, {
          source: 'play-radio-api',
          responseTime: 0
        });
      }
    }
    
    // Check for last_five_list_right HTML content
    if (data.last_five_list_right) {
      // Try to parse the first song from last_five_list_right
      const firstSongMatch = data.last_five_list_right.match(/<span class="five_artist">([^<]+)<\/span><br>\s*<span class="five_song">([^<]+)<\/span>/);
      if (firstSongMatch && firstSongMatch[1] && firstSongMatch[2]) {
        return createSuccessResponse(`${firstSongMatch[1].trim()} - ${firstSongMatch[2].trim()}`, {
          source: 'play-radio-api',
          responseTime: 0
        });
      }
    }
    
    // Fall back to traditional methods if API fails
    return handleDefaultStation(stationUrl);
    
  } catch (error) {
    console.error('Play Radio handler error:', error);
    return handleDefaultStation(stationUrl);
  }
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
  // Map station URLs to their webpage paths
  const stationNameMap = {
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

  // Get the station name for web scraping
  const stationName = stationNameMap[cleanUrl] || cleanUrl;
  
  try {
    // First try the direct API endpoint
    const apiUrl1 = `https://www.naxi.rs/stations/rs-${stationName}.json?_=${Date.now()}`;
    let nowPlaying = await tryNaxiApi(apiUrl1);
    
    if (!nowPlaying) {
      // Fallback to alternative endpoint if first one fails
      const apiUrl2 = `https://www.naxi.rs/proxy/${stationName}.xml?_=${Date.now()}`;
      nowPlaying = await tryNaxiApi(apiUrl2);
    }
    
    if (!nowPlaying) {
      // Final fallback to generic nowplaying endpoint
      const apiUrl3 = `https://nowplaying.naxi.rs/data/${stationName}.json?_=${Date.now()}`;
      nowPlaying = await tryNaxiApi(apiUrl3);
    }

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

async function tryNaxiApi(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.naxi.rs/'
      },
      cf: {
        cacheTtl: 10
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      
      // Handle the HTML response format with "rs" field
      if (data.rs && typeof data.rs === 'string') {
        return extractNaxiNowPlaying(data.rs);
      }
      // Other JSON formats you already handle
      else if (data.title || data.artist) {
        return `${data.artist || 'Unknown'} - ${data.title || 'Unknown'}`;
      } else if (data.current_track) {
        return data.current_track;
      } else if (typeof data === 'string') {
        return data.includes(' - ') ? data : null;
      }
    } else if (contentType && contentType.includes('text/xml')) {
      // Handle XML response (unchanged)
      const text = await response.text();
      const xmlMatch = text.match(/<artist>([^<]+)<\/artist>.*?<title>([^<]+)<\/title>/is);
      if (xmlMatch && xmlMatch[1] && xmlMatch[2]) {
        return `${xmlMatch[1].trim()} - ${xmlMatch[2].trim()}`;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error with Naxi API (${url}):`, error);
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

// Extract currently playing song from Naxi HTML
function extractNaxiNowPlaying(html) {
  try {
    // Try parsing as JSON first (for API responses)
    try {
      const jsonData = JSON.parse(html);
      if (typeof jsonData === 'string') {
        // Sometimes the response is JSON but contains HTML as a string
        return extractFromHtml(jsonData);
      }
    } catch (e) {
      // Not JSON, parse as HTML
      return extractFromHtml(html);
    }

    function extractFromHtml(htmlString) {
      // New pattern for the structure shown in your example
      const naxiPattern = /Slušate:[\s\S]*?<span>([^<]+)<\/span>\s*-\s*([^<]+)/;
      const match = htmlString.match(naxiPattern);
      if (match && match[1] && match[2]) {
        const artist = match[1].trim();
        const title = match[2].trim();
        return `${artist} - ${title}`;
      }

      // Keep your existing patterns as fallbacks
      const onAirPattern = /Slušate:[\s\S]*?<b>([^<]+)<\/b>\s*-?\s*<b>([^<]+)<\/b>/;
      const onAirMatch = htmlString.match(onAirPattern);
      if (onAirMatch && onAirMatch[1] && onAirMatch[2]) {
        const artist = onAirMatch[1].trim();
        const title = onAirMatch[2].trim();
        return `${artist} - ${title}`;
      }

      const listItemPattern = /<li><b>([^<]+)<\/b>\s*-\s*([^<]+)<\/li>/;
      const listItemMatch = htmlString.match(listItemPattern);
      if (listItemMatch && listItemMatch[1] && listItemMatch[2]) {
        const artist = listItemMatch[1].trim();
        const title = listItemMatch[2].trim();
        return `${artist} - ${title}`;
      }

      const messyPattern = /Slušate:[\s\S]*?<\/i>([^<]+)/;
      const messyMatch = htmlString.match(messyPattern);
      if (messyMatch && messyMatch[1]) {
        const match = messyMatch[1].trim();
        return match.includes(' - ') ? match : null;
      }

      return null;
    }
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
    t.includes('broadcast')
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
