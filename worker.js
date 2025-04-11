export default {
  async fetch(request) {
    // CORS preflight handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

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
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      // Enhanced metadata extraction for different stream types
      const fetchOptions = {
        method: 'GET',
        headers: { 
          'Icy-MetaData': '1',
          'User-Agent': 'Mozilla/5.0 (compatible; RadioMetadataFetcher/1.0)'
        },
        cf: { cacheTtl: 15 } // Cache for 15 seconds
      };

      // First try regular fetch for ICY headers
      const response = await fetch(stationUrl, fetchOptions);
      
      // Check for ICY metadata headers first
      const icyMetaInt = parseInt(response.headers.get('icy-metaint'));
      const icyTitle = response.headers.get('icy-title');
      const icyName = response.headers.get('icy-name');

      // Return ICY metadata if found
      if (icyTitle) {
        return respondWithSuccess(icyTitle);
      }

      // Special handling for Radio Paradise
      if (stationUrl.includes('radioparadise.com')) {
        try {
          const rpResponse = await fetch('https://api.radioparadise.com/api/now_playing');
          const rpData = await rpResponse.json();
          return respondWithSuccess(`${rpData.artist} - ${rpData.title}`);
        } catch (e) {
          console.error('Radio Paradise API failed:', e);
        }
      }

      // Try parsing SHOUTcast style metadata if meta interval exists
      if (icyMetaInt) {
        const metadata = await parseMetadataFromStream(response, icyMetaInt);
        if (metadata) return respondWithSuccess(metadata);
      }

      // Try parsing OGG/Vorbis metadata
      try {
        const oggMetadata = await parseOggMetadata(stationUrl);
        if (oggMetadata) return respondWithSuccess(oggMetadata);
      } catch (e) {
        console.log('OGG metadata parsing failed:', e);
      }

      // Final fallback
      return respondWithError('No metadata found');
      
    } catch (error) {
      return respondWithError(error.message);
    }
  }
}

// Helper functions
function respondWithSuccess(title) {
  return new Response(JSON.stringify({
    success: true,
    title: title.trim(),
    isStationName: false
  }), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    }
  });
}

function respondWithError(error) {
  return new Response(JSON.stringify({ 
    success: false,
    error: error 
  }), {
    status: 500,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    }
  });
}

async function parseMetadataFromStream(response, metaInt) {
  const reader = response.body.getReader();
  let buffer = new Uint8Array();
  let bytesRead = 0;
  
  while (bytesRead < metaInt * 2) { // Read up to 2 metadata intervals
    const { done, value } = await reader.read();
    if (done) break;
    
    bytesRead += value.length;
    const newBuffer = new Uint8Array(buffer.length + value.length);
    newBuffer.set(buffer);
    newBuffer.set(value, buffer.length);
    buffer = newBuffer;
    
    // Look for metadata marker
    for (let i = 0; i < buffer.length - 1; i++) {
      if (buffer[i] === 0x53 && buffer[i+1] === 0x74) { // 'St' in StreamTitle
        const metadataStart = i;
        const metadataString = new TextDecoder().decode(buffer.slice(metadataStart));
        const titleMatch = metadataString.match(/StreamTitle=['"]([^'"]*)['"]/);
        
        if (titleMatch?.[1]) {
          return titleMatch[1];
        }
      }
    }
  }
  return null;
}

async function parseOggMetadata(streamUrl) {
  // Implement OGG/Vorbis metadata parsing here
  // This would require more complex implementation similar to icecast-metadata-js
  // For now, we'll just return null since it requires significant work
  return null;
}
