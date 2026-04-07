const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { newInfo, existingData, questionLists } = await req.json();
    
    if (!newInfo || newInfo.trim() === '') {
      return new Response(JSON.stringify({ error: 'No information provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    const prompt = `You are analyzing new information about a job position. Extract relevant details and map them to the appropriate job order fields.

EXISTING JOB ORDER QUESTIONS:
Timing Questions: ${JSON.stringify(questionLists?.timing || [])}
Job Questions: ${JSON.stringify(questionLists?.job || [])}
Company Questions: ${JSON.stringify(questionLists?.company || [])}
Hiring Questions: ${JSON.stringify(questionLists?.hiring || [])}

NEW INFORMATION PROVIDED:
${newInfo}

Analyze the new information and return a JSON object with updates to make. Only include fields that have new information. Match the information to the most appropriate existing question.

Return format:
{
  "timingQuestions": { "question text": "new answer or appended info" },
  "jobQuestions": { "question text": "new answer or appended info" },
  "companyQuestions": { "question text": "new answer or appended info" },
  "hiringQuestions": { "question text": "new answer or appended info" },
  "summary": "Brief summary of what was extracted"
}

Rules:
1. Only include sections/questions that have relevant new information
2. If a question already has an answer, append the new info with " | Additional: " prefix
3. Match information to the most relevant existing question
4. Be precise and concise in your answers
5. Return valid JSON only`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content || '';
    
    // Clean and parse JSON
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}') + 1;
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      content = content.substring(jsonStart, jsonEnd);
    }
    
    const updates = JSON.parse(content);

    return new Response(JSON.stringify({ success: true, updates }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});