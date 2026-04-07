export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }

  try {
    const jobData = await req.json();
    
    console.log('Received job data for Crelate:', jobData);

    // Get the Crelate API key from environment variables
    const crelateApiKey = Deno.env.get("CRELATE_API_KEY");
    
    if (!crelateApiKey) {
      console.error('CRELATE_API_KEY not found in environment variables');
      return new Response(JSON.stringify({ 
        error: 'Crelate API key not configured' 
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Prepare the payload for Crelate API
    const crelatePayload = {
      name: jobData.title,
      company: jobData.company,
      description: jobData.description,
      location: jobData.location,
      salary: jobData.salary,
      requirements: jobData.requirements,
      benefits: jobData.benefits,
      jobType: jobData.type,
      status: jobData.status || 'active',
      externalId: jobData.jobId,
      createdAt: jobData.timestamp
    };

    console.log('Sending to Crelate API:', crelatePayload);

    // Make the API call to Crelate
    const crelateResponse = await fetch('https://api.crelate.com/api/pub/v1/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${crelateApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(crelatePayload)
    });

    const responseText = await crelateResponse.text();
    console.log('Crelate API response status:', crelateResponse.status);
    console.log('Crelate API response:', responseText);

    if (!crelateResponse.ok) {
      console.error('Crelate API error:', responseText);
      return new Response(JSON.stringify({ 
        error: 'Failed to send to Crelate',
        details: responseText,
        status: crelateResponse.status
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    let crelateData;
    try {
      crelateData = JSON.parse(responseText);
    } catch (e) {
      crelateData = { message: responseText };
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Job successfully sent to Crelate',
      crelateResponse: crelateData,
      jobId: jobData.jobId
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error in CreateaJob function:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
});