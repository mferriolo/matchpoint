# Zoom Meetings API Deployment Instructions

## Overview
This guide explains how to replace the Zoom Video SDK implementation with the Zoom Meetings API to create real zoom.us meeting links.

## Manual Deployment Required

Due to API connectivity issues, please manually update the edge function in the Supabase dashboard:

1. Go to your Supabase Dashboard
2. Navigate to Edge Functions
3. Find the `create-zoom-meeting` function
4. Replace the entire contents with the code below

## Complete Edge Function Code

```typescript
// supabase/functions/create-zoom-meeting/index.ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const ZOOM_ACCOUNT_ID = Deno.env.get('ZOOM_ACCOUNT_ID');
    const ZOOM_CLIENT_ID = Deno.env.get('ZOOM_CLIENT_ID');
    const ZOOM_CLIENT_SECRET = Deno.env.get('ZOOM_CLIENT_SECRET');

    if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
      throw new Error('Missing Zoom credentials');
    }

    const tokenResponse = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=account_credentials&account_id=${ZOOM_ACCOUNT_ID}`,
    });

    if (!tokenResponse.ok) {
      throw new Error(`OAuth failed: ${await tokenResponse.text()}`);
    }

    const { access_token } = await tokenResponse.json();
    const { topic = 'Interview Call', duration = 60 } = await req.json();

    const meetingResponse = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic,
        type: 2,
        duration,
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: true,
          mute_upon_entry: false,
          waiting_room: false,
        },
      }),
    });

    if (!meetingResponse.ok) {
      throw new Error(`Meeting creation failed: ${await meetingResponse.text()}`);
    }

    const meetingData = await meetingResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meetingData.id.toString(),
        join_url: meetingData.join_url,
        password: meetingData.password || '',
        start_url: meetingData.start_url,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

## What Changed
- Removed Zoom Video SDK (jsrsasign, JWT generation)
- Added OAuth Server-to-Server authentication
- Creates real Zoom meetings via REST API
- Returns actual zoom.us join URLs

## Frontend Updated
The ZoomIntegration component has been updated to work with real Zoom URLs.
