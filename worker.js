export default {
  async fetch(request) {
    const url = new URL(request.url);
    const stationUrl = url.searchParams.get('url');
    
    if (!stationUrl) {
      return new Response('Missing station URL', { status: 400 });
    }

    try {
      // Try with ICY metadata first
      const icyResponse = await fetch(stationUrl, {
        headers: {
          'Icy-MetaData': '1',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      // Extract ICY metadata
      let metadata = {
        icyName: icyResponse.headers.get('icy-name'),
        icyTitle: icyResponse.headers.get('icy-title'),
        icyGenre: icyResponse.headers.get('icy-genre'),
        contentType: icyResponse.headers.get('content-type')
      };
      
      // If no ICY metadata, try parsing the stream directly
      if (!metadata.icyTitle) {
        const streamResponse = await fetch(stationUrl);
        const streamText = await streamResponse.text();
        
        // Try to find common metadata patterns
        const titleMatch = streamText.match(/StreamTitle='([^']*)'/i) || 
                          streamText.match(/StreamTitle="([^"]*)"/i) ||
                          streamText.match(/title="([^"]*)"/i) ||
                          streamText.match(/TITLE=(.*)/i);
        
        if (titleMatch && titleMatch[1]) {
          metadata.icyTitle = titleMatch[1].trim();
        }
      }
      
      return new Response(JSON.stringify(metadata), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
