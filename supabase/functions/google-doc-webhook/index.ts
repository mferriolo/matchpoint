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
    const requestBody = await req.json();
    console.log('Received webhook data:', JSON.stringify(requestBody, null, 2));

    const { jobId, googleDocUrl, job_title, company } = requestBody;

    if (!googleDocUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing googleDocUrl',
        receivedFields: Object.keys(requestBody)
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    console.log('Processing Google Doc URL:', googleDocUrl);

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let updateResult;

    // Try to update by jobId first
    if (jobId) {
      console.log('Attempting to update by jobId:', jobId);
      updateResult = await supabase
        .from('job_orders')
        .update({ google_doc_url: googleDocUrl })
        .eq('id', jobId)
        .select();
      
      if (updateResult.error) {
        console.log('Update by jobId failed:', updateResult.error);
      } else if (updateResult.data && updateResult.data.length > 0) {
        console.log('Successfully updated by jobId. Final URL in database:', updateResult.data[0].google_doc_url);
        return new Response(JSON.stringify({
          success: true,
          jobId,
          googleDocUrl: updateResult.data[0].google_doc_url,
          message: 'Google Doc URL saved successfully by jobId',
          updatedRecord: updateResult.data[0]
        }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    }

    // If jobId didn't work, try by job_title and company
    if (job_title && company) {
      console.log('Attempting to update by job_title and company:', { job_title, company });
      updateResult = await supabase
        .from('job_orders')
        .update({ google_doc_url: googleDocUrl })
        .eq('job_title', job_title)
        .eq('company', company)
        .order('created_at', { ascending: false })
        .limit(1)
        .select();
      
      if (updateResult.error) {
        console.log('Update by job_title/company failed:', updateResult.error);
      } else if (updateResult.data && updateResult.data.length > 0) {
        console.log('Successfully updated by job_title/company. Final URL in database:', updateResult.data[0].google_doc_url);
        return new Response(JSON.stringify({
          success: true,
          googleDocUrl: updateResult.data[0].google_doc_url,
          message: 'Google Doc URL saved successfully by job_title/company match',
          updatedRecord: updateResult.data[0]
        }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    }

    // If nothing worked, try to update the most recent job order
    console.log('Attempting to update most recent job order');
    updateResult = await supabase
      .from('job_orders')
      .update({ google_doc_url: googleDocUrl })
      .order('created_at', { ascending: false })
      .limit(1)
      .select();

    if (updateResult.error) {
      console.error('All update attempts failed. Final error:', updateResult.error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to update job order with Google Doc URL',
        details: updateResult.error.message,
        receivedData: requestBody
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    console.log('Successfully updated most recent job order. Final URL in database:', updateResult.data[0].google_doc_url);

    return new Response(JSON.stringify({
      success: true,
      googleDocUrl: updateResult.data[0].google_doc_url,
      message: 'Google Doc URL saved successfully to most recent job order',
      updatedRecord: updateResult.data[0]
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to process webhook',
      details: error.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
});