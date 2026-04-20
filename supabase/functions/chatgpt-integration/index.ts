import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

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
  console.log('chatgpt-integration function called');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const requestData = await req.json();
    const { action, prompt, data, promptType } = requestData;
    console.log('Request received:', { action, promptType, hasPrompt: !!prompt, hasData: !!data });
    
    // Check for OpenAI API key - try multiple possible names
    let OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    // If not found, try VITE_OPENAI_API_KEY as fallback
    if (!OPENAI_API_KEY) {
      console.log('OPENAI_API_KEY not found, trying VITE_OPENAI_API_KEY');
      OPENAI_API_KEY = Deno.env.get('VITE_OPENAI_API_KEY');
    }
    
    if (!OPENAI_API_KEY) {
      console.error('No OpenAI API key found in environment variables');
      console.log('Available env vars:', Object.keys(Deno.env.toObject()).filter(k => k.includes('OPENAI') || k.includes('API')));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to Edge Function secrets.'
        }),
        { 
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(req) 
          } 
        }
      );
    }
    
    // Validate API key format
    if (!OPENAI_API_KEY.startsWith('sk-')) {
      console.error('Invalid API key format - should start with sk-');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid OpenAI API key format. Key should start with sk-'
        }),
        { 
          status: 401,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(req) 
          } 
        }
      );
    }
    
    console.log('OpenAI API key found:', OPENAI_API_KEY.substring(0, 10) + '...');

    // Initialize Supabase client
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Default AI settings
    let model = 'gpt-4o-mini';
    let temperature = 0.7;
    let maxTokens = 4000;
    let systemPrompt = 'You are a professional recruiter assistant helping with job-related tasks.';
    let userPrompt = prompt || '';

    // Try to fetch prompt from ai_prompts table if promptType is provided
    if (promptType) {
      console.log('Fetching prompt from database for:', promptType);
      const { data: promptData, error: promptError } = await supabase
        .from('ai_prompts')
        .select('prompt_text, model, temperature, max_tokens')
        .eq('name', promptType)
        .single();

      if (promptData && !promptError) {
        console.log('Prompt fetched successfully from ai_prompts table');
        systemPrompt = promptData.prompt_text;
        model = promptData.model || model;
        temperature = promptData.temperature || temperature;
        maxTokens = promptData.max_tokens || maxTokens;
      } else {
        console.log('Prompt not found in database, using defaults');
      }
    }

    // Handle different actions with specific prompts
    switch(action) {
      case 'call_summary':
        systemPrompt = 'You are an expert at summarizing recruitment calls. Create clear, concise summaries that capture key information about the job, requirements, and any important details discussed.';
        userPrompt = data?.transcript || prompt;
        break;
      
      case 'analyze_job':
        systemPrompt = 'You are an expert job analyst and recruiter. Analyze job descriptions and create professional content based on the instructions provided. Follow the specific format and guidelines given in the prompt. When asked for JSON format, provide only valid JSON without any markdown formatting.';
        break;
      
      case 'analyze_job_order':
        systemPrompt = `You are an expert recruiter analyzing job descriptions to create comprehensive job orders. 
        
        CRITICAL INSTRUCTIONS:
        1. Analyze the provided job description thoroughly
        2. Extract ALL information to answer questions in 4 sections:
           - Section 1: Urgency and Timing
           - Section 2: Questions about the job
           - Section 3: Questions about the company
           - Section 4: Questions about the hiring process
        3. For each question, provide a specific answer based on the job description
        4. If information for a question is not explicitly stated, make reasonable inferences based on context
        5. PRESERVE ALL INFORMATION - if there are important details that don't fit a specific question, add them in a NOTE field at the end of the relevant section
        6. Format your response as a structured JSON object with the 4 sections
        7. Each section should contain question-answer pairs and a notes field for extra information
        
        IMPORTANT: Do not lose any information from the job description. Every detail should be captured either as an answer to a question or in the notes section.`;
        
        userPrompt = `Analyze this job description and create a comprehensive job order with all 4 sections:
        
        ${JSON.stringify(data || requestData)}
        
        Return a JSON object with this structure:
        {
          "urgencyAndTiming": {
            "questions": [
              {"question": "What is the urgency level?", "answer": "..."},
              {"question": "When does the position need to be filled?", "answer": "..."},
              {"question": "What is the timeline for interviews?", "answer": "..."}
            ],
            "notes": "Any additional timing/urgency information not covered above"
          },
          "jobQuestions": {
            "questions": [
              {"question": "What is the job title?", "answer": "..."},
              {"question": "What are the primary responsibilities?", "answer": "..."},
              {"question": "What are the required qualifications?", "answer": "..."},
              {"question": "What is the salary range?", "answer": "..."},
              {"question": "What are the working hours?", "answer": "..."},
              {"question": "Is this remote, hybrid, or onsite?", "answer": "..."}
            ],
            "notes": "Any additional job information not covered above"
          },
          "companyQuestions": {
            "questions": [
              {"question": "What is the company name?", "answer": "..."},
              {"question": "What industry is the company in?", "answer": "..."},
              {"question": "What is the company culture like?", "answer": "..."},
              {"question": "What is the team size?", "answer": "..."},
              {"question": "Who will this position report to?", "answer": "..."}
            ],
            "notes": "Any additional company information not covered above"
          },
          "hiringProcessQuestions": {
            "questions": [
              {"question": "How many interview rounds?", "answer": "..."},
              {"question": "What is the interview format?", "answer": "..."},
              {"question": "Who will conduct the interviews?", "answer": "..."},
              {"question": "Are there any assessments required?", "answer": "..."},
              {"question": "What is the decision timeline?", "answer": "..."}
            ],
            "notes": "Any additional hiring process information not covered above"
          }
        }`;
        maxTokens = 4000;
        temperature = 0.3;
        break;
      
      case 'generate_job_questions':
        systemPrompt = 'You are an expert interviewer. Generate relevant, insightful interview questions for job positions that help assess candidate fit and qualifications.';
        userPrompt = `Generate interview questions for: Title: ${data?.jobTitle}, Company: ${data?.company}, Description: ${data?.description}, Job Type: ${data?.jobType}`;
        break;
      
      case 'prompting_support':
        systemPrompt = 'You are a helpful assistant providing guidance during recruitment calls. Offer relevant suggestions and support based on the conversation context.';
        userPrompt = `Context: ${data?.context}\nLast message: ${data?.lastMessage}`;
        break;
      
      case 'generate_job_order':
        systemPrompt = `You are an expert recruiter creating professional job order documents. 
        Format the content with these 4 main sections:
        1. Urgency and Timing - all time-related information
        2. Questions about the job - role details, responsibilities, requirements
        3. Questions about the company - culture, team, environment
        4. Questions about the hiring process - interview steps, timeline, decision makers
        
        Preserve ALL information from the source. If details don't fit specific questions, include them in a NOTES section.`;
        userPrompt = prompt || `Create a job order for: ${JSON.stringify(data)}`;
        break;
      
      case 'generate_job_ad':
        systemPrompt = 'You are an expert copywriter creating compelling job advertisements. Write engaging, professional job ads that attract qualified candidates.';
        userPrompt = JSON.stringify(data || requestData);
        break;
      
      default:
        console.log('Using default or database prompt for action:', action);
        if (!userPrompt && data) {
          userPrompt = JSON.stringify(data);
        }
    }

    console.log('Making OpenAI API call with model:', model);
    console.log('System prompt length:', systemPrompt.length);
    console.log('User prompt length:', userPrompt.length);
    
    let openaiResponse: Response | null = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
            response_format: (action === 'analyze_job_order') ? { type: "json_object" } : undefined
          })
        });
        if (openaiResponse.status === 429 && attempt < 2) {
          console.warn(`OpenAI 429 rate limit on attempt ${attempt + 1}, retrying...`);
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        break;
      } catch (fetchErr) {
        console.warn(`OpenAI fetch error on attempt ${attempt + 1}:`, (fetchErr as Error).message);
        if (attempt === 2) throw fetchErr;
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (!openaiResponse!.ok) {
      const errorText = await openaiResponse!.text();
      console.error('OpenAI API error:', openaiResponse!.status, errorText);

      let errorMessage = 'OpenAI API error';

      // Parse error for better message
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch {
        errorMessage = errorText.substring(0, 200);
      }

      // Check for specific error types
      if (openaiResponse!.status === 401) {
        errorMessage = 'Invalid OpenAI API key. Please verify the API key is correct and has not expired.';
      } else if (openaiResponse!.status === 429) {
        errorMessage = 'OpenAI API rate limit exceeded. Please try again later.';
      } else if (openaiResponse!.status === 500 || openaiResponse!.status === 503) {
        errorMessage = 'OpenAI service is temporarily unavailable. Please try again.';
      } else if (errorMessage.includes('model')) {
        errorMessage = `Model error: ${model} may not be available. Please check your model configuration.`;
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          status: openaiResponse!.status
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...getCorsHeaders(req) 
          } 
        }
      );
    }

    const result = await openaiResponse!.json();
    const content = result.choices[0]?.message?.content || '';
    
    console.log('OpenAI API call successful, content length:', content.length);

    // For analyze_job_order, try to parse JSON response
    let parsedContent = content;
    if (action === 'analyze_job_order') {
      try {
        parsedContent = JSON.parse(content);
      } catch (e) {
        console.log('Could not parse job order response as JSON, returning as string');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        content: parsedContent,
        action,
        model: model
      }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          ...getCorsHeaders(req) 
        } 
      }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    
    // Return a more detailed error response
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...getCorsHeaders(req) 
        } 
      }
    );
  }
});