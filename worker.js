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
      return new Response(JSON.stringify({ error: 'Missing station URL parameter' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      // Try standard ICY metadata first
      const icyResponse = await fetch(stationUrl, {
        headers: { 'Icy-MetaData': '1' },
        cf: { cacheEverything: false }
      });

      const icyTitle = icyResponse.headers.get('icy-title');
      const icyName = icyResponse.headers.get('icy-name');
      
      // If we have metadata, return it immediately
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
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        } catch (e) {
          console.error('Radio Paradise API failed:', e);
        }
      }

      // Fallback for streams without ICY metadata
      const streamResponse = await fetch(stationUrl);
      const text = await streamResponse.text();
      
      // Try to extract metadata from stream
      const titleMatch = text.match(/StreamTitle=['"]([^'"]*)['"]/) || 
                        text.match(/title=['"]([^'"]*)['"]/);
      
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
