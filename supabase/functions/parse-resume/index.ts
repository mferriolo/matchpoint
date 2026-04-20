import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

const toTitleCase = (str: string | null | undefined): string => {
  if (!str) return ''
  return str.toLowerCase().split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

const normalizeSkillsAggressively = async (skills: string[]): Promise<string[]> => {
  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openaiApiKey) {
      console.error('OpenAI API key not configured for skill normalization')
      return []
    }

    // Create Supabase client to fetch master skills
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Fetch all skills from master_skills table
    const { data: masterSkills, error: skillsError } = await supabaseClient
      .from('master_skills')
      .select('skill_name, category, profession, aliases')

    if (skillsError) {
      console.error('Error fetching master skills:', skillsError)
      return []
    }

    if (!masterSkills || masterSkills.length === 0) {
      console.error('No master skills found in database')
      return []
    }

    // Create comprehensive master skills list for AI
    const masterSkillsList = masterSkills.map(s => s.skill_name).join(', ')
    
    // Create a Set of valid skill names for strict matching (case-insensitive)
    const validSkillsSet = new Set(
      masterSkills.map(s => s.skill_name.toLowerCase())
    )

    const systemPrompt = `You are a healthcare recruiting skills normalizer. Map verbose skills to clean, standardized skill names.

MASTER SKILLS LIST (THESE ARE THE ONLY VALID SKILLS):
${masterSkillsList}

CRITICAL RULES:

1. REMOVE ALL FILLER WORDS:
   Remove: "Experience in", "Experience with", "Proficient in", "Knowledge of", "Skilled in", "Strong", "Excellent", "Good", "Expert", "Ability to", "Background in", "Familiar with", "Various", "Multiple"

2. SPLIT COMPOUND SKILLS:
   "EMR systems including Epic and Cerner" becomes ["EMR Proficiency", "Epic", "Cerner"]
   "Botox and Fillers" becomes ["Botox", "Dermal Fillers"]

3. ONLY MAP TO SKILLS FROM THE MASTER SKILLS LIST:
   - You MUST only return skills that exist in the master skills list above
   - If a parsed skill doesn't match any master skill, DO NOT include it
   - Match skills as closely as possible to the exact names in the master list

4. EXTRACT SOFTWARE NAMES:
   Split lists and only include software names that exist in the master skills list

5. OUTPUT:
   Return ONLY a JSON array of skill names from the master list`

    const userPrompt = `Normalize these skills and return ONLY a JSON array of skills from the master list: ${JSON.stringify(skills)}`

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000
      })
    })

    if (!openaiResponse.ok) {
      console.error('OpenAI normalization failed')
      return []
    }

    const openaiData = await openaiResponse.json()
    let normalizedSkillsText = openaiData.choices[0].message.content.trim()

    // Remove markdown code blocks
    normalizedSkillsText = normalizedSkillsText.replace(/```json\n?/g, '').replace(/```\n?/g, '')

    let normalizedSkills = []
    try {
      normalizedSkills = JSON.parse(normalizedSkillsText)
    } catch (e) {
      console.error('Failed to parse normalized skills JSON:', e)
      return []
    }

    // STRICT FILTER: Only keep skills that exist in master_skills table (case-insensitive)
    const finalSkills = normalizedSkills.filter((skill: any) => {
      if (typeof skill !== 'string') return false
      return validSkillsSet.has(skill.toLowerCase())
    })

    // Remove duplicates and trim
    const uniqueSkills = [...new Set(finalSkills.map((s: string) => s.trim()))]

    console.log(`Normalized ${skills.length} raw skills to ${uniqueSkills.length} master skills`)
    
    return uniqueSkills
    
  } catch (error) {
    console.error('Error in skill normalization:', error)
    return []
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const body = await req.json()
    const { resumeText, images, useVision } = body
    
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    let parsedData: any = {}

    // Vision API mode
    if (useVision && images && Array.isArray(images)) {
      console.log('Using Vision API for', images.length, 'images')
      
      const visionMessages: any[] = [
        {
          role: 'system',
          content: `You are a healthcare resume parser. Extract ALL information from resumes including every skill, procedure, software, and competency mentioned.

Return this exact JSON structure:
{
  "firstName": "string",
  "lastName": "string",
  "cellPhone": "string or null",
  "homePhone": "string or null",
  "workEmail": "string or null",
  "personalEmail": "string or null",
  "streetAddress": "string or null",
  "city": "string or null",
  "state": "string or null",
  "zip": "string or null",
  "currentJobTitle": "string or null",
  "currentCompany": "string or null",
  "skills": ["array of skill strings"]
}

CRITICAL - SKILLS EXTRACTION:
Extract EVERY skill mentioned including:
- Clinical procedures (Botox, Suturing, IV Therapy, Wound Care, etc.)
- Medical specialties (Family Medicine, Internal Medicine, Cardiology, etc.)
- Software and EMR systems (Epic, Cerner, eClinicalWorks, Meditech, etc.)
- Certifications (BLS, ACLS, DEA License, Medical License, Board Certified, etc.)
- Languages spoken (Spanish, English, etc.)
- Soft skills if prominent (Patient Communication, Leadership, Team Management, etc.)
- Any other competencies mentioned

Keep each skill concise (1-4 words). Extract everything - be comprehensive.

Return ONLY valid JSON, no explanations.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract ALL information from these resume images. Pay special attention to extracting EVERY skill mentioned.'
            },
            ...images.map((img: string) => ({
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${img}`
              }
            }))
          ]
        }
      ]

      const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: visionMessages,
          max_tokens: 2000,
          temperature: 0.3
        })
      })

      if (!visionResponse.ok) {
        console.error('Vision API error:', await visionResponse.text())
        return new Response(
          JSON.stringify({ error: 'Vision API error' }),
          { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 502 }
        )
      }

      const visionData = await visionResponse.json()
      const content = visionData?.choices?.[0]?.message?.content || ''
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try { parsedData = JSON.parse(jsonStr) }
      catch { return new Response(JSON.stringify({ error: 'AI returned invalid JSON', raw: jsonStr.substring(0, 500) }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 422 }) }

    } else if (resumeText && typeof resumeText === 'string') {
      console.log('Using text mode, length:', resumeText.length)
      
      if (resumeText.trim().length < 50) {
        return new Response(
          JSON.stringify({ error: 'Resume text too short' }),
          { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 422 }
        )
      }

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a healthcare resume parser. Extract ALL information from resumes including every skill, procedure, software, and competency mentioned.

Return this exact JSON structure:
{
  "firstName": "string",
  "lastName": "string",
  "cellPhone": "string or null",
  "homePhone": "string or null",
  "workEmail": "string or null",
  "personalEmail": "string or null",
  "streetAddress": "string or null",
  "city": "string or null",
  "state": "string or null",
  "zip": "string or null",
  "currentJobTitle": "string or null",
  "currentCompany": "string or null",
  "skills": ["array of skill strings"]
}

CRITICAL - SKILLS EXTRACTION:
Extract EVERY skill mentioned including:
- Clinical procedures (Botox, Suturing, IV Therapy, Wound Care, etc.)
- Medical specialties (Family Medicine, Internal Medicine, Cardiology, etc.)
- Software and EMR systems (Epic, Cerner, eClinicalWorks, Meditech, etc.)
- Certifications (BLS, ACLS, DEA License, Medical License, Board Certified, etc.)
- Languages spoken (Spanish, English, etc.)
- Soft skills if prominent (Patient Communication, Leadership, Team Management, etc.)
- Any other competencies mentioned

Keep each skill concise (1-4 words). Extract everything - be comprehensive.

Return ONLY valid JSON, no explanations.`
            },
            {
              role: 'user',
              content: `Extract ALL information from this resume. Pay special attention to extracting EVERY skill mentioned:\n\n${resumeText.substring(0, 30000)}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        })
      })

      if (!openaiResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'AI service error' }),
          { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 502 }
        )
      }

      const openaiData = await openaiResponse.json()
      const content = openaiData?.choices?.[0]?.message?.content || ''
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try { parsedData = JSON.parse(jsonStr) }
      catch { return new Response(JSON.stringify({ error: 'AI returned invalid JSON', raw: jsonStr.substring(0, 500) }), { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 422 }) }

    } else {
      return new Response(
        JSON.stringify({ error: 'No resume text or images provided' }),
        { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 422 }
      )
    }

    // Clean up and format data
    if (parsedData.lastName) {
      parsedData.lastName = parsedData.lastName.replace(/^[A-Z]\.\s+/g, '').trim()
    }

    parsedData.firstName = toTitleCase(parsedData.firstName)
    parsedData.lastName = toTitleCase(parsedData.lastName)
    parsedData.currentJobTitle = toTitleCase(parsedData.currentJobTitle)
    parsedData.currentCompany = toTitleCase(parsedData.currentCompany)
    parsedData.city = toTitleCase(parsedData.city)
    parsedData.state = (parsedData.state || '').trim().toUpperCase()

    console.log('Raw skills extracted:', parsedData.skills)
    console.log('Raw skills count:', parsedData.skills?.length || 0)

    // Use aggressive normalization for skills - ONLY MASTER SKILLS
    if (parsedData.skills && Array.isArray(parsedData.skills)) {
      const cleanedSkills = parsedData.skills.map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      parsedData.normalizedSkills = await normalizeSkillsAggressively(cleanedSkills)
      
      // Store raw skills for reference
      parsedData.rawSkills = cleanedSkills
      
      // Use normalized skills as the primary skills array
      parsedData.skills = parsedData.normalizedSkills
      
      console.log('Normalized skills:', parsedData.normalizedSkills)
      console.log('Normalized skills count:', parsedData.normalizedSkills.length)
    } else {
      parsedData.skills = []
      parsedData.normalizedSkills = []
      parsedData.rawSkills = []
      console.log('No skills found in parsed data')
    }

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})