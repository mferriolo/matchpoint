
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
    return new Response('ok', {
      headers: getCorsHeaders(req)
    });
  }

  try {
    const { candidateName, jobTitle, callType, questionsAndResponses } = await req.json();

    if (!Array.isArray(questionsAndResponses) || questionsAndResponses.length === 0) {
      return new Response(JSON.stringify({ error: 'questionsAndResponses is required and must be a non-empty array' }), { status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key not configured");
    }

    // Format questions and responses for the prompt
    const qaText = questionsAndResponses.map((qa: any) => 
      `Q: ${qa.question}\nA: ${qa.response}`
    ).join('\n\n');

    const prompt = `Create a professional call note summary for a recruitment call. Format it as follows:

**${candidateName} - ${jobTitle} - ${callType}**

**Call Summary:**
[Brief overview of the call and candidate's overall fit]

**Questions & Responses:**
${qaText}

**Key Takeaways:**
[3-4 bullet points highlighting the most important insights about the candidate]

Keep it professional and concise.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional recruitment assistant creating call notes.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${data.error?.message || 'Unknown error'}`);
    }

    const note = data.choices[0]?.message?.content || 'Unable to generate call note.';

    return new Response(JSON.stringify({ note }), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req)
      }
    });

  } catch (error) {
    console.error('Error generating call note:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to generate call note',
      details: error.message 
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req)
      }
    });
  }
});