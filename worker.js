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
      return new Response(JSON.stringify({ error: 'Missing station URL' }), { 
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      // First try ICY metadata headers
      const icyResponse = await fetch(stationUrl, {
        headers: { 'Icy-MetaData': '1' },
        cf: { cacheEverything: false }
      });

      // Prepare basic metadata
      const metadata = {
        icyName: icyResponse.headers.get('icy-name'),
        icyTitle: icyResponse.headers.get('icy-title'),
        icyGenre: icyResponse.headers.get('icy-genre'),
        success: false
      };

      // If we got ICY headers, return them
      if (metadata.icyTitle || metadata.icyName) {
        metadata.success = true;
        return new Response(JSON.stringify(metadata), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // If no ICY headers, try parsing the metadata from the stream
      const streamResponse = await fetch(stationUrl);
      const reader = streamResponse.body.getReader();
      let chunks = [];
      let metadataFound = false;
      let totalBytes = 0;
      const MAX_BYTES = 8192; // Limit to first 8KB

      while (!metadataFound && totalBytes < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        totalBytes += value.length;
        const combined = Buffer.concat(chunks).toString('binary');
        
        // Look for common metadata patterns
        const titleMatch = combined.match(/StreamTitle=['"]([^'"]*)['"]/i);
        if (titleMatch) {
          metadata.icyTitle = titleMatch[1].trim();
          metadata.success = true;
          metadataFound = true;
        }
      }

      return new Response(JSON.stringify(metadata), {
        status: metadataFound ? 200 : 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack
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
