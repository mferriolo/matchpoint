
const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const jobData = await req.json();
    console.log('Received job data:', JSON.stringify(jobData, null, 2));
    
    const crelateApiKey = Deno.env.get("CRELATE_API_KEY");

    if (!crelateApiKey) {
      console.log('Missing Crelate API key');
      return new Response(JSON.stringify({
        success: false,
        error: 'Crelate API key not configured'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
      });
    }

    // Basic job data mapping
    const crelateJobData = {
      name: String(jobData.title || jobData.jobTitle || 'Untitled Position'),
      description: String(jobData.jobDescription || jobData.description || ''),
      status: 'Active'
    };

    console.log('Sending to Crelate:', JSON.stringify(crelateJobData, null, 2));

    const crelateResponse = await fetch('https://app.crelate.com/api/pub/v1/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${crelateApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(crelateJobData)
    });

    const responseText = await crelateResponse.text();
    console.log('Crelate response:', crelateResponse.status, responseText);
    
    if (!crelateResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `Crelate API returned ${crelateResponse.status}`,
        details: responseText
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
      });
    }

    let crelateResult;
    try {
      crelateResult = JSON.parse(responseText);
    } catch {
      crelateResult = { id: 'unknown' };
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Job successfully sent to Crelate',
      crelateJobId: crelateResult.id || 'created'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Integration failed',
      details: error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });
  }
});