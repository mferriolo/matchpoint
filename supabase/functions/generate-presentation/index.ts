
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
    const { candidate, job } = await req.json();
    
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Create a comprehensive prompt for the presentation
    const prompt = `Create a professional candidate presentation for the following:

CANDIDATE:
Name: ${candidate.first_name} ${candidate.last_name}
Current Title: ${candidate.current_job_title || 'N/A'}
Current Company: ${candidate.current_company || 'N/A'}
Location: ${candidate.location || 'N/A'}
Experience: ${candidate.experience || 'N/A'}
Education: ${candidate.education || 'N/A'}
Skills: ${candidate.skills || 'N/A'}
Summary: ${candidate.summary || 'N/A'}

JOB POSITION:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'N/A'}
Description: ${job.description || 'N/A'}
Compensation: ${job.compensation || 'N/A'}

Please create a compelling 2-3 paragraph presentation that:
1. Introduces the candidate professionally
2. Highlights their relevant experience and qualifications
3. Explains why they're an excellent fit for this specific role
4. Emphasizes their unique value proposition

Keep it professional, concise, and persuasive.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a professional recruiter creating candidate presentations for clients.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 800
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const presentation = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ presentation }),
      { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );
  } catch (error) {
    console.error('Error generating presentation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );
  }
});