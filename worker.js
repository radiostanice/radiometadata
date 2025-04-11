export default {
  async fetch(request) {
    // Handle CORS preflight
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
      // Try ICY metadata headers first
      const icyResponse = await fetch(stationUrl, {
        headers: { 'Icy-MetaData': '1' },
        cf: { cacheEverything: false }
      });

      const icyMetaInt = parseInt(icyResponse.headers.get('icy-metaint'));
      const icyTitle = icyResponse.headers.get('icy-title');
      const icyName = icyResponse.headers.get('icy-name');

      // If we have ICY metadata, return it
      if (icyTitle) {
        return new Response(JSON.stringify({
          success: true,
          title: icyTitle,
          isStationName: false
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Special handling for Radio Paradise
      if (stationUrl.includes('radioparadise.com')) {
        try {
          const rpResponse = await fetch('https://api.radioparadise.com/api/now_playing');
          const rpData = await rpResponse.json();
          return new Response(JSON.stringify({
            success: true,
            title: `${rpData.artist} - ${rpData.title}`,
            isStationName: false
          }), {
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        } catch (e) {
          console.error('Radio Paradise API failed:', e);
        }
      }

      // If we have metadata interval, try to parse metadata from stream
      if (icyMetaInt) {
        const reader = icyResponse.body.getReader();
        let buffer = new Uint8Array();
        let metadataFound = false;
        
        while (!metadataFound) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Combine chunks
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
          
          // Check for metadata marker
          for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0x53 && buffer[i+1] === 0x74) { // 'St' in StreamTitle
              const metadataStart = i;
              const metadataString = new TextDecoder().decode(buffer.slice(metadataStart));
              const titleMatch = metadataString.match(/StreamTitle=['"]([^'"]*)['"]/);
              
              if (titleMatch && titleMatch[1]) {
                return new Response(JSON.stringify({
                  success: true,
                  title: titleMatch[1].trim(),
                  isStationName: false
                }), {
                  headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                  }
                });
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: false,
        error: 'No metadata found'
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
}
