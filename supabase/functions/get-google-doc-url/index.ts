import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { jobTitle, company, jobId } = await req.json()
    
    console.log('Fetching Google Doc URL for:', { jobTitle, company, jobId })
    
    // Get the Google Drive webhook URL from environment
    // This should be a Zapier webhook that queries Google Drive
    const GOOGLE_DRIVE_WEBHOOK = Deno.env.get('GOOGLE_DRIVE_WEBHOOK_URL')
    
    if (!GOOGLE_DRIVE_WEBHOOK) {
      console.log('No Google Drive webhook configured, falling back to database check')
      
      // Fallback: Check database for URL
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      const { data, error } = await supabase
        .from('job_orders')
        .select('google_doc_url')
        .eq('id', jobId)
        .single()
      
      if (error) {
        throw new Error('Failed to fetch from database: ' + error.message)
      }
      
      const docUrl = data?.google_doc_url
      
      if (docUrl) {
        return new Response(
          JSON.stringify({ 
            url: docUrl,
            source: 'database'
          }),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      
      return new Response(
        JSON.stringify({ error: 'No document URL found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Call Google Drive webhook/Zapier to search for the document
    const searchQuery = `${jobTitle} ${company}`.trim()
    
    console.log('Calling Google Drive webhook with search query:', searchQuery)
    
    const response = await fetch(GOOGLE_DRIVE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchQuery: searchQuery,
        jobTitle: jobTitle,
        company: company,
        orderBy: 'createdTime desc',
        maxResults: 1
      })
    })
    
    if (!response.ok) {
      throw new Error(`Google Drive webhook failed: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('Google Drive webhook response:', data)
    
    // Extract URL from response (adjust based on actual Zapier response format)
    const docUrl = data.url || data.webViewLink || data.alternateLink || data.documentUrl
    
    if (docUrl) {
      // Save URL to database
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      await supabase
        .from('job_orders')
        .update({ 
          google_doc_url: docUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
      
      return new Response(
        JSON.stringify({ 
          url: docUrl,
          name: data.name || data.title,
          id: data.id,
          source: 'google_drive'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    return new Response(
      JSON.stringify({ error: 'No document found in Google Drive' }),
      { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
    
  } catch (error) {
    console.error('Error fetching Google Doc URL:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})