import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { questions } = await req.json()

    if (!questions || !Array.isArray(questions)) {
      throw new Error('Questions array is required')
    }

    // Enhanced conversational ordering logic with "why did you become" prioritized
    const orderedQuestions = orderQuestionsConversationally(questions)

    return new Response(
      JSON.stringify({ orderedQuestions }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  }
})

function orderQuestionsConversationally(questions: string[]): string[] {
  const ordered: string[] = []
  const remaining = [...questions]

  // 1. HIGHEST PRIORITY: "Why did you become a [job type]?" - Most conversational opener
  const whyBecomeQuestions = remaining.filter(q => 
    q.toLowerCase().includes('why did you become') ||
    q.toLowerCase().includes('what drew you to') ||
    q.toLowerCase().includes('what made you choose')
  )
  ordered.push(...whyBecomeQuestions)
  whyBecomeQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 2. Personal background and career overview
  const backgroundQuestions = remaining.filter(q => 
    q.toLowerCase().includes('background') ||
    q.toLowerCase().includes('overview of your career') ||
    q.toLowerCase().includes('tell me about yourself') ||
    q.toLowerCase().includes('walk me through your career')
  )
  ordered.push(...backgroundQuestions)
  backgroundQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 3. Current role and recent experience
  const currentRoleQuestions = remaining.filter(q => 
    q.toLowerCase().includes('current') ||
    q.toLowerCase().includes('most recent') ||
    q.toLowerCase().includes('what do you do now') ||
    q.toLowerCase().includes('present role')
  )
  ordered.push(...currentRoleQuestions)
  currentRoleQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 4. Experience and qualifications (knockout questions)
  const experienceQuestions = remaining.filter(q => 
    q.toLowerCase().includes('experience') ||
    q.toLowerCase().includes('licensed') ||
    q.toLowerCase().includes('certification') ||
    q.toLowerCase().includes('years') ||
    q.toLowerCase().includes('required') ||
    q.toLowerCase().includes('authorized to work')
  )
  ordered.push(...experienceQuestions)
  experienceQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 5. Motivation and change questions
  const motivationQuestions = remaining.filter(q => 
    q.toLowerCase().includes('why are you') ||
    q.toLowerCase().includes('looking to make a change') ||
    q.toLowerCase().includes('consider a change') ||
    q.toLowerCase().includes('what interests you')
  )
  ordered.push(...motivationQuestions)
  motivationQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 6. Technical and role-specific questions
  const technicalQuestions = remaining.filter(q => 
    q.toLowerCase().includes('technology') ||
    q.toLowerCase().includes('systems') ||
    q.toLowerCase().includes('software') ||
    q.toLowerCase().includes('tools') ||
    q.toLowerCase().includes('methods')
  )
  ordered.push(...technicalQuestions)
  technicalQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 7. Practical questions (salary, location, schedule)
  const practicalQuestions = remaining.filter(q => 
    q.toLowerCase().includes('salary') ||
    q.toLowerCase().includes('commute') ||
    q.toLowerCase().includes('relocate') ||
    q.toLowerCase().includes('available') ||
    q.toLowerCase().includes('schedule') ||
    q.toLowerCase().includes('start date')
  )
  ordered.push(...practicalQuestions)
  practicalQuestions.forEach(q => {
    const index = remaining.indexOf(q)
    if (index > -1) remaining.splice(index, 1)
  })

  // 8. Add any remaining questions at the end
  ordered.push(...remaining)

  return ordered
}