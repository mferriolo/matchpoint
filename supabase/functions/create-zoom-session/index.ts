import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const { sessionName, userName, role } = await req.json()

    const sdkKey = Deno.env.get('ZOOM_SDK_KEY')
    const sdkSecret = Deno.env.get('ZOOM_SDK_SECRET')

    if (!sdkKey || !sdkSecret) {
      throw new Error('Zoom SDK credentials not configured')
    }

    const sessionTopic = sessionName || `Interview-${Date.now()}`

    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 60 * 60 * 2

    // Handle both string 'host' and number 1 for host role
    const roleType = (role === 'host' || role === 1) ? 1 : 0

    const payload = {
      app_key: sdkKey,
      tpc: sessionTopic,
      role_type: roleType,
      user_identity: userName || 'User',
      session_key: sessionTopic,
      version: 1,
      iat,
      exp,
    }

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(sdkSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const jwt = await create(header, payload, key)

    const appUrl = Deno.env.get('APP_URL') || 'http://localhost:5173'
    const joinUrl = `${appUrl}/join-call?session=${encodeURIComponent(sessionTopic)}`

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    await supabase.from('zoom_sessions').insert({
      session_name: sessionTopic,
      created_at: new Date().toISOString(),
      expires_at: new Date(exp * 1000).toISOString(),
      host_name: userName,
    })

    return new Response(
      JSON.stringify({
        success: true,
        sessionName: sessionTopic,
        jwt,
        joinUrl,
        sdkKey,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error creating Zoom session:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }
})