import * as pdfjsLib from 'npm:pdfjs-dist@4.0.379'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    let resumeText = ''
    
    // Handle file data
    if (body.fileData || body.file) {
      const fileData = body.fileData || body.file
      const fileType = body.fileType || ''
      
      // Decode base64
      const binaryString = atob(fileData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Extract text based on file type
      if (fileType.includes('pdf')) {
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const textContent = await page.getTextContent()
          resumeText += textContent.items.map((item: any) => item.str).join(' ') + ' '
        }
      } else if (fileType.includes('text')) {
        resumeText = new TextDecoder().decode(bytes)
      } else if (fileType.includes('word')) {
        // Basic DOCX text extraction
        resumeText = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
        const matches = resumeText.match(/[\x20-\x7E]+/g)
        if (matches) resumeText = matches.join(' ')
      }
    } else if (body.resumeText) {
      resumeText = body.resumeText
    }

    if (resumeText.length < 50) {
      return new Response(
        JSON.stringify({ 
          error: 'Could not extract text. File may be scanned/image-based. Try a text-based PDF or DOCX.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Extract: firstName, lastName, cellPhone, workEmail, personalEmail, city, state, currentJobTitle, currentCompany, skills[]. Return JSON only.\n\n${resumeText.substring(0, 20000)}`
        }],
        max_tokens: 1000,
        temperature: 0.3
      })
    })

    const data = await aiRes.json()
    const parsed = JSON.parse(data.choices[0].message.content.replace(/```json|```/g, ''))
    
    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})