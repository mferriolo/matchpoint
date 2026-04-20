
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
    const { 
      jobId, 
      jobTitle, 
      company, 
      timingQuestions, 
      jobQuestions, 
      companyQuestions, 
      hiringQuestions,
      timingNotes,
      jobNotes,
      companyNotes,
      hiringNotes,
      unansweredQuestions,
      summary,
      activeQuestions,
      googleDocUrl
    } = await req.json();

    if (!jobId) {
      throw new Error('jobId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.3');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing, error: checkError } = await supabase
      .from('job_orders')
      .select('id')
      .eq('job_id', jobId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing job order:', checkError);
      throw checkError;
    }

    const jobOrderData = {
      job_id: jobId,
      job_title: jobTitle || '',
      company: company || '',
      timing_questions: timingQuestions || {},
      job_questions: jobQuestions || {},
      company_questions: companyQuestions || {},
      hiring_questions: hiringQuestions || {},
      timing_notes: timingNotes || '',
      job_notes: jobNotes || '',
      company_notes: companyNotes || '',
      hiring_notes: hiringNotes || '',
      unanswered_questions: unansweredQuestions || {},
      summary: summary || '',
      active_questions: activeQuestions || [],
      updated_at: new Date().toISOString()
    };

    // Add Google Doc URL if provided
    if (googleDocUrl) {
      jobOrderData.google_doc_url = googleDocUrl;
      jobOrderData.website = googleDocUrl;
    }

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('job_orders')
        .update(jobOrderData)
        .eq('job_id', jobId)
        .select()
        .single();

      if (error) {
        console.error('Error updating job order:', error);
        throw error;
      }
      result = data;
    } else {
      const insertData = {
        ...jobOrderData,
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('job_orders')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error inserting job order:', error);
        throw error;
      }
      result = data;
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );
  } catch (error) {
    console.error('Error in save-job-order function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } 
      }
    );
  }
});