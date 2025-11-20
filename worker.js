// Station Handlers Registry
const STATION_HANDLERS = {
  'naxi': handleNaxiRadio,
  'radioparadise': handleRadioParadise,
  'radios': handleRadioS,
  'radioin': handleRadioIn, // <-- Added
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

// Handler Selection Logic (Reverted to match original working pattern, adding only Radio IN)
function selectHandler(stationUrl) {
  const cleanUrl = normalizeUrlForComparison(stationUrl);

  if (isNaxiStation(cleanUrl)) {
    return STATION_HANDLERS.naxi;
  }

  // Use original stationUrl for isRadioSStation, like the original working version
  if (isRadioSStation(stationUrl)) {
    return STATION_HANDLERS.radios;
  }

  // Add the new check for Radio IN, using its specific function
  if (isRadioInStation(stationUrl)) { // <-- Added check, using stationUrl like isRadioSStation
    return STATION_HANDLERS.radioin; // <-- Added return
  }

  if (cleanUrl.includes('radioparadise.com')) {
    return STATION_HANDLERS.radioparadise;
  }

  return STATION_HANDLERS.default;
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

// Enhanced Naxi station handler that uses Firebase API directly
async function handleNaxiRadio(stationUrl) {
  try {
    // Map streaming hosts to their corresponding data-station values
    const hostToStationMap = {
      'naxi128.streaming.rs:9152': 'live',
      'naxidigital-rnb128ssl.streaming.rs': 'rnb',
      'naxidigital-rock128ssl.streaming.rs': 'rock',
      'naxidigital-house128ssl.streaming.rs': 'house',
      'naxidigital-cafe128ssl.streaming.rs': 'cafe',
      'naxidigital-jazz128ssl.streaming.rs': 'jazz',
      'naxidigital-classic128ssl.streaming.rs': 'classic',
      'naxidigital-80s128ssl.streaming.rs': '80e',
      'naxidigital-90s128ssl.streaming.rs': '90e',
      'naxidigital-reggae128.streaming.rs': 'reggae',
      'naxidigital-blues128ssl.streaming.rs': 'blues-rock',
      'naxidigital-chill128ssl.streaming.rs': 'chill',
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
      'naxidigital-70s128ssl.streaming.rs': '70e',
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
    
    // Determine the station value
    let station = null;
    for (const [streamHost, stationValue] of Object.entries(hostToStationMap)) {
      if (host.includes(streamHost.split('.')[0])) {
        station = stationValue;
        break;
      }
    }
    
    // If no match found, return error
    if (!station) {
      return createErrorResponse('Naxi: Unknown station URL', 400);
    }
    
    // Try to fetch from Firebase API directly for the specific station
    const firebaseResult = await tryNaxiFirebaseAPI(station);

    if (firebaseResult) {
      return createSuccessResponse(firebaseResult, {
        source: 'naxi-firebase',
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

// Try to fetch from Naxi's Firebase API directly for a specific station
async function tryNaxiFirebaseAPI(station) {
  try {
    // Fetch the Firebase document for the specific station
    const firebaseUrl = `https://firestore.googleapis.com/v1/projects/naxiproject/databases/(default)/documents/now_playing/${station}`;
    
    const response = await fetch(firebaseUrl, {
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) {
      // If the specific station document doesn't exist, try the main one
      if (response.status === 404 && station !== 'naxi') {
        return await tryNaxiFirebaseAPI('naxi');
      }
      throw new Error(`Firebase API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse the Firestore document structure
    if (data.fields && data.fields.now_playing_json) {
      const nowPlayingJson = data.fields.now_playing_json.stringValue;
      const nowPlayingData = JSON.parse(nowPlayingJson);
      
      // Extract the current playing data
      const current = nowPlayingData.now_playing;
      
      if (current && current.artist && current.title) {
        return `${current.artist} - ${current.title}`;
      }
    }
    
    // Alternative structure - if the data is directly in the document
    if (data.fields) {
      // Try to find artist and title fields directly
      let artist = null;
      let title = null;
      
      if (data.fields.artist && data.fields.artist.stringValue) {
        artist = data.fields.artist.stringValue;
      }
      
      if (data.fields.title && data.fields.title.stringValue) {
        title = data.fields.title.stringValue;
      }
      
      // If we have both, return the result
      if (artist && title) {
        return `${artist} - ${title}`;
      }
    }
    
    return null;
  } catch (error) {
    console.log('Firebase API attempt failed:', error.message);
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

// Radio S handler
async function handleRadioS(stationUrl) {
  try {
    // Correct port-to-alias mapping for Radio S stations
    const portToAliasMap = {
      '9000': 's1',        // Radio S1
      '9002': 's2',        // Radio S2
      '9004': 's3',        // Radio S3
      '9006': 's4',        // Radio S4
      '9030': 's_mchits',  // S Trap&Rap
      '9032': 's_rock',    // S Rock
      '9028': 's_pop',     // S Pop&Rock
      '9058': 's_rock_ballads', // S Rock Ballads
      '9012': 's_cafe',    // S Cafe
      '9066': 's_chill',   // S Chill
      '9076': 's_jazz',    // S Jazz
      '9074': 's_classic', // S Classic
      '9072': 's_mod_classic', // S Modern Classic
      '9054': 's_latino',  // S Latino
      '9044': 's_easy',    // S Easy
      '9062': 's_lounge2', // S Lounge
      '9014': 's_energy',  // S Dance
      '9022': 's_kids',    // S Kids
      '9010': 's_mix',     // S Mix
      '9020': 's_gold',    // S Gold
      '9026': 's_love',    // S Extra
      '9042': 's_ex_yu',   // S Ex-Yu
      '9036': 's_80te',    // S 80-te
      '9052': 's_2000-e',  // S 2000-te
      '9060': 's_2000-te_folk', // S 2000-te Folk
      '9016': 's_folk',    // S Narodni
      '9024': 's_lounge',  // S Folk Stars
      '9046': 's_pop_folk', // S Pop Folk
      '9038': 's_juzni',   // S Južni
      '9040': 's_zavicaj', // S Zavičaj
      '9064': 's_starogradski', // S Starogradski
      '9068': 's_gym',     // S Gym
      '9078': 's_sport',   // S Sport
      '9080': 's_sport_urban'  // S Sport Urban
    };
    
    // Extract port from station URL
    const urlObj = new URL(stationUrl);
    const port = urlObj.port || '80';
    
    // Determine the station alias
    const alias = portToAliasMap[port];
    
    // If no match found, return error
    if (!alias) {
      return createErrorResponse(`Radio S: Unknown station port: ${port}`, 400);
    }
    
    // Try to fetch from Radio S API directly
    const radioSResult = await tryRadioSAPI(alias);

    if (radioSResult) {
      return createSuccessResponse(radioSResult, {
        source: 'radios-api',
        bitrate: '128', // Default assumption
        format: 'MP3',
        responseTime: 0
      });
    }

    return createErrorResponse('Radio S: No metadata found', 404);
    
  } catch (error) {
    return createErrorResponse(`Radio S: ${error.message}`, 500);
  }
}

// Try to fetch from Radio S API directly
async function tryRadioSAPI(alias) {
  try {
    // Radio S API endpoint for now playing information
    const apiUrl = `https://www.radios.rs/includes/get/now-playing-json.php?radio=${alias}`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; RadioMetadataFetcher/1.0)',
        'Referer': 'https://www.radios.rs/'
      },
      cf: { 
        cacheTtl: 5,
        cacheEverything: true
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check if we have artist and song information
    if (data.artist && data.song) {
      return `${data.artist} - ${data.song}`;
    }
    
    // Fallback to show information if available
    if (data.show) {
      return data.show;
    }
    
    return null;
  } catch (error) {
    console.log('Radio S API attempt failed:', error.message);
    return null;
  }
}

// Enhanced function to check if it's a Radio S station
function isRadioSStation(stationUrl) {
  const cleanUrl = stationUrl
    .replace('https://', '')
    .replace('http://', '')
    .replace(';stream.nsv', '')
    .replace(';*.mp3', '')
    .split('/')[0];
    
  return cleanUrl.includes('radios.rs') || cleanUrl.includes('stream.radios.rs');
}

// Radio IN handler
async function handleRadioIn(stationUrl) {
  try {
    // Radio IN API endpoint for now playing information
    const apiUrl = 'https://www.radioinbeograd.rs/live/nowonair.php';
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; RadioMetadataFetcher/1.0)',
        'Referer': 'https://www.radioinbeograd.rs/'
      },
      cf: { 
        cacheTtl: 5,
        cacheEverything: true
      }
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Simple approach: split the HTML and find the NOW ON AIR section
    const nowOnAirStart = html.indexOf('<div class="nowonair">');
    if (nowOnAirStart === -1) {
      return createErrorResponse('Radio IN: No now playing section found', 404);
    }
    
    const nowOnAirSection = html.substring(nowOnAirStart);
    const noapesmaStart = nowOnAirSection.indexOf('<div class="noapesma">');
    if (noapesmaStart === -1) {
      return createErrorResponse('Radio IN: No song data found', 404);
    }
    
    const contentStart = noapesmaStart + '<div class="noapesma">'.length;
    const contentEnd = nowOnAirSection.indexOf('</div>', contentStart);
    
    if (contentEnd === -1) {
      return createErrorResponse('Radio IN: Could not extract song data', 404);
    }
    
    let title = nowOnAirSection.substring(contentStart, contentEnd).trim();
    
    if (title) {
      return createSuccessResponse(title, {
        source: 'radioin-api',
        bitrate: '128', // Default assumption for the 128k stream
        format: 'MP3',
        responseTime: 0
      });
    }
    
    return createErrorResponse('Radio IN: No metadata found', 404);
    
  } catch (error) {
    return createErrorResponse(`Radio IN: ${error.message}`, 500);
  }
}

// Enhanced function to check if it's a Radio IN station
function isRadioInStation(stationUrl) {
  const cleanUrl = stationUrl
    .replace('https://', '')
    .replace('http://', '')
    .replace(';stream.nsv', '')
    .replace(';*.mp3', '')
    .split('/')[0];
    
  return cleanUrl.includes('radioin') || cleanUrl.includes('radio3-128ssl.streaming.rs');
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
    t.length > 90 ||
    t.split('-').length > 6 ||
    t.split(' ').length > 20
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
