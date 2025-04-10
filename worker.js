export default {
  async fetch(request) {
    const url = new URL(request.url);
    const stationUrl = url.searchParams.get('url');
    
    if (!stationUrl) {
      return new Response('Missing station URL', { status: 400 });
    }

    try {
      // Forward the request to the radio station
      const response = await fetch(stationUrl, {
        headers: {
          'Icy-MetaData': '1', // Required for Shoutcast metadata
          'User-Agent': 'Mozilla/5.0' // Some servers block non-browser UAs
        }
      });
      
      // Extract metadata headers
      const metadata = {
        icyName: response.headers.get('icy-name'),
        icyTitle: response.headers.get('icy-title'),
        contentType: response.headers.get('content-type')
      };
      
      return new Response(JSON.stringify(metadata), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
