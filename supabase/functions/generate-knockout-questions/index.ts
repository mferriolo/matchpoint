export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { jobTitle, jobDescription, requirements, company, location, salary } = await req.json();
    
    console.log('Generating knockout questions for job:', jobTitle);
    
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert recruiter creating knockout screening questions. Your questions should:
1. Determine if the candidate has the required qualifications
2. Assess genuine interest in the specific role
3. Identify deal-breakers early
4. Be clear and direct
5. Require specific answers (not just yes/no)

Return ONLY valid JSON with this structure:
{
  "questions": ["question 1", "question 2", "question 3", "question 4", "question 5"]
}

Generate 5-7 questions. Do not include any markdown or extra text.`
          },
          {
            role: 'user',
            content: `Generate knockout screening questions for this job:

Job Title: ${jobTitle || 'Not specified'}
Company: ${company || 'Not specified'}
Location: ${location || 'Not specified'}
Salary Range: ${salary || 'Not specified'}

Job Description:
${jobDescription || 'Not provided'}

Requirements:
${requirements || 'Not provided'}

Create 5-7 knockout questions that will help screen candidates for both qualifications and genuine interest in this specific position.`
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    let content = data.choices[0].message.content;
    
    console.log('Raw ChatGPT response:', content);
    
    // Clean up any markdown formatting
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse the JSON
    const result = JSON.parse(content);
    
    console.log('Parsed questions:', result.questions);
    
    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
    
  } catch (error) {
    console.error('Error generating knockout questions:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to generate knockout questions',
        questions: []
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});