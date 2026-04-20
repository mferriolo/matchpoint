
const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

async function getZoomAccessToken() {
  try {
    const accountId = Deno.env.get('ZOOM_ACCOUNT_ID')
    const clientId = Deno.env.get('ZOOM_CLIENT_ID')
    const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')
    
    if (!accountId || !clientId || !clientSecret) {
      throw new Error('Missing Zoom credentials in environment variables')
    }
    
    const credentials = btoa(`${clientId}:${clientSecret}`)
    
    const response = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Zoom OAuth error:', errorText)
      throw new Error(`Failed to get Zoom access token: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (!data.access_token) {
      throw new Error('No access token received from Zoom')
    }
    
    return data.access_token
  } catch (error) {
    console.error('Error getting Zoom access token:', error)
    throw error
  }
}

async function createZoomMeeting(accessToken: string, meetingData: any) {
  try {
    console.log('Creating Zoom meeting with data:', JSON.stringify(meetingData, null, 2))
    
    const response = await fetch(
      `https://api.zoom.us/v2/users/me/meetings`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(meetingData),
      }
    )
    
    const responseData = await response.json()
    
    if (!response.ok) {
      console.error('Zoom API error response:', responseData)
      throw new Error(`Failed to create Zoom meeting: ${response.status} - ${responseData.message || JSON.stringify(responseData)}`)
    }
    
    return responseData
  } catch (error) {
    console.error('Error creating Zoom meeting:', error)
    throw error
  }
}

async function sendEmailInvite(to: string, meetingDetails: any) {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not found in environment variables')
      throw new Error('Email service not configured')
    }
    
    console.log('Sending email to:', to)
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Meetings <onboarding@resend.dev>',
        to: [to],
        subject: `Meeting Invitation: ${meetingDetails.topic || 'Zoom Meeting'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">You're invited to a meeting</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Topic:</strong> ${meetingDetails.topic || 'Zoom Meeting'}</p>
              ${meetingDetails.start_time ? `<p><strong>Time:</strong> ${new Date(meetingDetails.start_time).toLocaleString()}</p>` : ''}
              ${meetingDetails.duration ? `<p><strong>Duration:</strong> ${meetingDetails.duration} minutes</p>` : ''}
            </div>
            <div style="margin: 20px 0;">
              <a href="${meetingDetails.join_url}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Join Meeting
              </a>
            </div>
            <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Meeting ID:</strong> ${meetingDetails.id}</p>
              ${meetingDetails.password ? `<p style="margin: 5px 0;"><strong>Passcode:</strong> ${meetingDetails.password}</p>` : ''}
              <p style="margin: 5px 0;"><strong>Join URL:</strong> <a href="${meetingDetails.join_url}">${meetingDetails.join_url}</a></p>
            </div>
          </div>
        `,
      }),
    })
    
    const result = await response.json()
    
    if (!response.ok) {
      console.error('Resend API error:', result)
      throw new Error(result.message || `Email failed: ${response.status}`)
    }
    
    console.log('Email sent successfully:', result)
    return result
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

async function sendSMSInvite(to: string, meetingDetails: any) {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')
    
    if (!accountSid || !authToken || !fromNumber) {
      console.error('Twilio credentials not found in environment variables')
      throw new Error('SMS service not configured')
    }
    
    console.log('Sending SMS to:', to)
    
    const timeStr = meetingDetails.start_time 
      ? `\nTime: ${new Date(meetingDetails.start_time).toLocaleString()}`
      : ''
    
    const message = `Meeting: ${meetingDetails.topic || 'Zoom Meeting'}${timeStr}\n\nJoin: ${meetingDetails.join_url}\nID: ${meetingDetails.id}${meetingDetails.password ? `\nPasscode: ${meetingDetails.password}` : ''}`
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: message,
        }),
      }
    )
    
    const result = await response.json()
    
    if (!response.ok) {
      console.error('Twilio API error:', result)
      throw new Error(result.message || `SMS failed: ${response.status}`)
    }
    
    console.log('SMS sent successfully:', result)
    return result
  } catch (error) {
    console.error('Error sending SMS:', error)
    throw error
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    const body = await req.json()
    console.log('Received request:', JSON.stringify(body, null, 2))
    
    // Check if this is just sending invites for existing meeting
    if (body.meeting && body.meeting.join_url) {
      // Just send invites for existing meeting
      const { emails = [], phones = [], meeting, topic } = body
      const meetingDetails = {
        ...meeting,
        topic: topic || meeting.topic || 'Zoom Meeting'
      }
      
      const results = {
        notifications: { emails: [], sms: [] }
      }
      
      // Send emails
      for (const email of emails) {
        try {
          const result = await sendEmailInvite(email, meetingDetails)
          results.notifications.emails.push({ email, success: true, id: result.id })
        } catch (error) {
          console.error(`Failed to send email to ${email}:`, error)
          results.notifications.emails.push({ email, success: false, error: error.message })
        }
      }
      
      // Send SMS
      for (const phone of phones) {
        try {
          const result = await sendSMSInvite(phone, meetingDetails)
          results.notifications.sms.push({ phone, success: true, sid: result.sid })
        } catch (error) {
          console.error(`Failed to send SMS to ${phone}:`, error)
          results.notifications.sms.push({ phone, success: false, error: error.message })
        }
      }
      
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
      })
    }
    
    // Otherwise create new meeting
    const { topic, duration, start_time, emails = [], phones = [], agenda, settings = {} } = body
    
    const accessToken = await getZoomAccessToken()
    
    const meetingData = {
      topic: topic || 'Zoom Meeting',
      type: start_time ? 2 : 1,
      duration: duration || 60,
      agenda: agenda || '',
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: true,
        audio: 'both',
        auto_recording: 'cloud',
        ...settings
      }
    }
    
    if (start_time) {
      meetingData.start_time = start_time
      meetingData.timezone = 'UTC'
    }
    
    const meeting = await createZoomMeeting(accessToken, meetingData)
    
    const results = {
      meeting: {
        id: meeting.id,
        topic: meeting.topic,
        join_url: meeting.join_url,
        start_url: meeting.start_url,
        password: meeting.password,
        start_time: meeting.start_time,
        duration: meeting.duration
      },
      notifications: { emails: [], sms: [] }
    }
    
    // Send invites for new meeting
    for (const email of emails) {
      try {
        const result = await sendEmailInvite(email, meeting)
        results.notifications.emails.push({ email, success: true, id: result.id })
      } catch (error) {
        results.notifications.emails.push({ email, success: false, error: error.message })
      }
    }
    
    for (const phone of phones) {
      try {
        const result = await sendSMSInvite(phone, meeting)
        results.notifications.sms.push({ phone, success: true, sid: result.sid })
      } catch (error) {
        results.notifications.sms.push({ phone, success: false, error: error.message })
      }
    }
    
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) }
    })
    
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    )
  }
})