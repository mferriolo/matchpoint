
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
    const { jobTitle, company, description, jobType, generateJobOrder, generateJobAd } = await req.json();
    console.log('Processing request for:', { jobTitle, company, jobType, generateJobOrder, generateJobAd });
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OpenAI API key not found');
      throw new Error('OpenAI API key not configured');
    }

    // Create parallel promises for faster processing
    const promises = [];

    if (generateJobAd) {
      const jobAdPrompt = `Create a professional healthcare job ad using the following information. Follow the EXACT format structure with these specific bolded subheadings:

Job Title: ${jobTitle}
Company: ${company}
Job Type: ${jobType}
Full Description: ${description}

Format the job ad with these exact sections and subheadings (use **bold** formatting):

**About the Job**
[Briefly outline the nature of the position, type of care, and patient population. Include key highlights such as schedule, type of team, or any unique features.]

**Who You Are**
[Describe the ideal candidate, focusing on clinical background, experience level, and soft skills.]

**Who We Are**
[A brief, mission-oriented summary referring to "Our Client" (never name the actual company). Highlight the culture, values, or type of organization (e.g., mission-driven, innovative).]

**Your Role**
[Outline key responsibilities, workflow, team interaction, and reporting structure.]

**How You Qualify**
[List required and preferred qualifications such as board certification, licenses, and years of experience.]

**How You Are Supported**
[Summarize benefits, support structures (e.g., MA/nurse support, care coordination), and perks like sign-on bonuses or flexible schedules. Do not include specific salary figures.]

CRITICAL GUIDELINES:
- Always refer to the company as "Our Client" for confidentiality
- Do not include specific salary ranges or figures
- Keep tone professional, engaging, and mission-driven like Honest Medical Group
- Make it concise and formatted for easy reading
- Focus on attracting clinical talent`;

      promises.push(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: jobAdPrompt }],
            max_tokens: 1200,
            temperature: 0.7,
          }),
        }).then(async (response) => {
          const data = await response.json();
          return { type: 'jobAd', content: data.choices?.[0]?.message?.content?.trim() };
        })
      );
    }

    if (generateJobOrder) {
      const jobOrderPrompt = `Based on the following job information, extract answers to these questions. If information is not available, leave the answer blank.

Job Title: ${jobTitle}
Company: ${company}
Description: ${description || ''}

Please provide answers in JSON format with three sections:
1. jobQuestions - answers to job-related questions
2. companyQuestions - answers to company-related questions  
3. hiringQuestions - answers to hiring process questions

Job Questions:
1. What is the title of the position?
2. What are the primary responsibilities?
3. What is the work schedule (e.g., hours, days, weekends)?
4. Is this a remote, hybrid, or onsite position?
5. What qualifications are required?
6. What qualifications are preferred?
7. What is the compensation structure?
8. Are there any bonuses or incentives?
9. What benefits are offered?
10. What is the expected start date?
11. What is the reporting structure?
12. Are there travel requirements?
13. How many direct reports (if any)?

Company Questions:
1. What is the size and scope of the organization?
2. What services or specialties does the organization provide?
3. What is the company's mission or core values?
4. What makes the organization unique or attractive to candidates?
5. Are there any growth plans or recent milestones to share?

Hiring Questions:
1. What is the hiring timeline?
2. What are the interview stages?
3. Who will be involved in the interview process (names and titles)?
4. How will interviews be conducted (e.g., phone, video, in-person)?
5. What is the target start date?
6. Who is the final decision maker?
7. Is there a backup candidate process?

Return only valid JSON with the structure:
{
  "jobQuestions": {"question": "answer or empty string"},
  "companyQuestions": {"question": "answer or empty string"},
  "hiringQuestions": {"question": "answer or empty string"}
}`;

      promises.push(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: jobOrderPrompt }],
            max_tokens: 1500,
            temperature: 0.3,
          }),
        }).then(async (response) => {
          const data = await response.json();
          return { type: 'jobOrder', content: data.choices?.[0]?.message?.content?.trim() };
        })
      );
    }

    if (!generateJobAd && !generateJobOrder) {
      const summaryPrompt = `Analyze this job description and create a compelling 2-3 sentence summary that SELLS this opportunity to top candidates.

Job Title: ${jobTitle}
Company: ${company}
Job Type: ${jobType}
Full Description: ${description}

Instructions:
1. Read the ENTIRE job description carefully
2. Identify the 3-5 BEST selling points (growth opportunities, benefits, company culture, role impact, etc.)
3. Write a compelling summary that introduces AND sells the position
4. Focus on what makes this opportunity special and attractive
5. Use an enthusiastic but professional tone

Write ONLY the summary, no additional text.`;

      promises.push(
        fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: summaryPrompt }],
            max_tokens: 300,
            temperature: 0.8,
          }),
        }).then(async (response) => {
          const data = await response.json();
          return { type: 'summary', content: data.choices?.[0]?.message?.content?.trim() };
        })
      );
    }

    // Wait for all promises to resolve
    const results = await Promise.all(promises);
    console.log('All API calls completed');

    // Process results
    const response = {};
    for (const result of results) {
      if (result.type === 'jobAd') {
        response.jobAd = result.content || `**About the Job**\nExciting ${jobType} opportunity with Our Client.\n\n**Who You Are**\nExperienced healthcare professional ready for the next challenge.\n\n**Who We Are**\nOur Client is a mission-driven healthcare organization committed to excellence.\n\n**Your Role**\nKey responsibilities in ${jobTitle} position with collaborative team.\n\n**How You Qualify**\nRelevant clinical experience and professional qualifications required.\n\n**How You Are Supported**\nComprehensive benefits package and professional development opportunities.`;
      } else if (result.type === 'jobOrder') {
        try {
          response.jobOrderData = JSON.parse(result.content);
        } catch (parseError) {
          console.error('Failed to parse job order JSON:', parseError);
          response.jobOrderData = {
            jobQuestions: {},
            companyQuestions: {},
            hiringQuestions: {}
          };
        }
      } else if (result.type === 'summary') {
        response.summary = result.content || `Join Our Client as a ${jobTitle} and make a meaningful impact in ${jobType}. This exciting opportunity offers professional growth, competitive benefits, and the chance to work with a dynamic team in a thriving healthcare environment.`;
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });

  } catch (error) {
    console.error('Function error:', error);
    
    const fallbackResponse = {};
    
    if (generateJobAd) {
      fallbackResponse.jobAd = `**About the Job**\nExciting ${jobType} opportunity with Our Client.\n\n**Who You Are**\nExperienced healthcare professional ready for the next challenge.\n\n**Who We Are**\nOur Client is a mission-driven healthcare organization committed to excellence.\n\n**Your Role**\nKey responsibilities in ${jobTitle} position with collaborative team.\n\n**How You Qualify**\nRelevant clinical experience and professional qualifications required.\n\n**How You Are Supported**\nComprehensive benefits package and professional development opportunities.`;
    }
    
    if (generateJobOrder) {
      fallbackResponse.jobOrderData = {
        jobQuestions: {},
        companyQuestions: {},
        hiringQuestions: {}
      };
    }
    
    if (!generateJobAd && !generateJobOrder) {
      fallbackResponse.summary = `Exciting ${jobType} opportunity with competitive benefits, professional growth potential, and the chance to make a meaningful impact in healthcare.`;
    }
    
    fallbackResponse.error = error.message;
    
    return new Response(JSON.stringify(fallbackResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    });
  }
});