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
    const { action, meetingId, signature } = await req.json()
    
    // Mock Zoom SDK integration
    if (action === 'initializeSDK') {
      return new Response(
        JSON.stringify({
          success: true,
          sdkKey: 'mock-sdk-key',
          signature: 'mock-signature'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }
    
    if (action === 'joinMeeting') {
      return new Response(
        JSON.stringify({
          success: true,
          meetingUrl: `https://zoom.us/j/${meetingId}`,
          status: 'joined'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})