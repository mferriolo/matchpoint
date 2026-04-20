import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const ZOOM_ACCOUNT_ID = Deno.env.get('ZOOM_ACCOUNT_ID');
    const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID');
    const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET');

    if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
      throw new Error('Missing Zoom credentials');
    }

    let access_token: string;

    // Use cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
      access_token = cachedToken.token;
      console.log('Using cached OAuth token');
    } else {
      console.log('Getting OAuth token...');

      const tokenResponse = await fetch('https://zoom.us/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`OAuth failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      access_token = tokenData.access_token;
      const expiresIn = tokenData.expires_in || 3600; // default 1 hour
      cachedToken = { token: access_token, expiresAt: Date.now() + expiresIn * 1000 };
      console.log('OAuth token obtained and cached');
    }

    const { topic = 'Interview Call', duration = 60 } = await req.json();
    
    const meetingResponse = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: topic,
        type: 2,
        duration: duration,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          waiting_room: true,
          audio: 'both',
        },
      }),
    });

    if (!meetingResponse.ok) {
      const errorText = await meetingResponse.text();
      throw new Error(`Meeting creation failed: ${errorText}`);
    }

    const meetingData = await meetingResponse.json();
    console.log('Meeting created:', meetingData.id);

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meetingData.id.toString(),
        join_url: meetingData.join_url,
        password: meetingData.password || '',
        meetingNumber: meetingData.id.toString(),
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});