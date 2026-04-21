
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
      jobTitle, 
      company, 
      description, 
      location, 
      jobType,
      timingQuestions,
      jobQuestions,
      companyQuestions,
      hiringQuestions
    } = await req.json();

    if (!Array.isArray(timingQuestions) || !Array.isArray(jobQuestions) || !Array.isArray(companyQuestions) || !Array.isArray(hiringQuestions)) {
      return new Response(JSON.stringify({ error: 'Missing required question arrays', timingQuestions: {}, jobQuestions: {}, companyQuestions: {}, hiringQuestions: {} }), { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
    }

    const openAIKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAIKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Create the prompt for ChatGPT
    const prompt = `You are analyzing a job order for the position of ${jobTitle} at ${company}.
    
Job Description: ${description || 'Not provided'}
Location: ${location || 'Not specified'}
Job Type: ${jobType || 'General'}

Please analyze this job and provide intelligent answers to the following questions based on the job information provided. If you cannot determine an answer from the available information, respond with "Not Specified" but also suggest what information would be needed.

TIMING QUESTIONS:
${timingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

JOB QUESTIONS:
${jobQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

COMPANY QUESTIONS:
${companyQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

HIRING PROCESS QUESTIONS:
${hiringQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Please provide your response in the following JSON format:
{
  "timingQuestions": { "question": "answer", ... },
  "jobQuestions": { "question": "answer", ... },
  "companyQuestions": { "question": "answer", ... },
  "hiringQuestions": { "question": "answer", ... },
  "timingNotes": "Additional insights about timing",
  "jobNotes": "Additional insights about the job",
  "companyNotes": "Additional insights about the company",
  "hiringNotes": "Additional insights about hiring process",
  "unansweredQuestions": {
    "timing": ["questions that need more info"],
    "job": ["questions that need more info"],
    "company": ["questions that need more info"],
    "hiring": ["questions that need more info"],
    "insightful": ["5-10 additional insightful questions specific to this role"]
  }
}`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert recruiter analyzing job orders. Provide detailed, professional answers based on the information available. When information is not available, indicate "Not Specified" but suggest what additional information would be helpful.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = (data?.choices?.[0]?.message?.content || '').replace(/```json\n?|```\n?/g, '').trim();
    let analysisResult: any;
    try { analysisResult = JSON.parse(rawContent); }
    catch { throw new Error('AI returned invalid JSON'); }

    // Ensure all questions have answers (even if "Not Specified")
    const ensureAnswers = (questions: string[], answers: any) => {
      const result: any = {};
      questions.forEach(q => {
        result[q] = answers[q] || 'Not Specified';
      });
      return result;
    };

    const finalResult = {
      timingQuestions: ensureAnswers(timingQuestions, analysisResult.timingQuestions || {}),
      jobQuestions: ensureAnswers(jobQuestions, analysisResult.jobQuestions || {}),
      companyQuestions: ensureAnswers(companyQuestions, analysisResult.companyQuestions || {}),
      hiringQuestions: ensureAnswers(hiringQuestions, analysisResult.hiringQuestions || {}),
      timingNotes: analysisResult.timingNotes || '',
      jobNotes: analysisResult.jobNotes || '',
      companyNotes: analysisResult.companyNotes || '',
      hiringNotes: analysisResult.hiringNotes || '',
      unansweredQuestions: analysisResult.unansweredQuestions || {
        timing: [],
        job: [],
        company: [],
        hiring: [],
        insightful: []
      }
    };

    return new Response(JSON.stringify(finalResult), {
      headers: { 
        'Content-Type': 'application/json',
        ...getCorsHeaders(req) 
      },
    });

  } catch (error) {
    console.error('Error in analyze-job-order function:', error);
    
    // Return a basic structure on error
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timingQuestions: {},
        jobQuestions: {},
        companyQuestions: {},
        hiringQuestions: {},
        timingNotes: '',
        jobNotes: '',
        companyNotes: '',
        hiringNotes: '',
        unansweredQuestions: {
          timing: [],
          job: [],
          company: [],
          hiring: [],
          insightful: []
        }
      }), 
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...getCorsHeaders(req) 
        },
      }
    );
  }
});