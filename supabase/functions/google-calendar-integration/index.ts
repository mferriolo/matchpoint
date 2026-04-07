export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    
    const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

    switch (action) {
      case 'scheduleCall': {
        const { 
          title, 
          description, 
          startTime, 
          endTime, 
          attendeeEmail, 
          attendeePhone,
          zoomLink,
          sendEmail = true,
          sendSMS = false 
        } = data;

        // Create calendar event data
        const event = {
          summary: title,
          description: `${description}\n\nZoom Link: ${zoomLink}`,
          start: { dateTime: startTime, timeZone: 'America/New_York' },
          end: { dateTime: endTime, timeZone: 'America/New_York' },
          attendees: [{ email: attendeeEmail }],
          conferenceData: {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 30 },
              { method: 'popup', minutes: 10 }
            ]
          }
        };

        // Send email invitation using Resend
        if (sendEmail && RESEND_API_KEY) {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'noreply@yourdomain.com',
              to: attendeeEmail,
              subject: `Call Scheduled: ${title}`,
              html: `
                <h2>You have a scheduled call</h2>
                <p><strong>Title:</strong> ${title}</p>
                <p><strong>Date/Time:</strong> ${new Date(startTime).toLocaleString()}</p>
                <p><strong>Duration:</strong> ${Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)} minutes</p>
                <p><strong>Description:</strong> ${description}</p>
                <br>
                <p><a href="${zoomLink}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Zoom Call</a></p>
                <br>
                <p>Add to your calendar:</p>
                <ul>
                  <li><a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startTime.replace(/[-:]/g, '').replace('.000', '')}/${endTime.replace(/[-:]/g, '').replace('.000', '')}&details=${encodeURIComponent(description + '\n\nZoom Link: ' + zoomLink)}">Add to Google Calendar</a></li>
                </ul>
              `
            })
          });

          if (!emailRes.ok) {
            console.error('Failed to send email:', await emailRes.text());
          }
        }

        // Send SMS notification using Twilio
        if (sendSMS && attendeePhone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
          const formattedPhone = attendeePhone.startsWith('+') ? attendeePhone : `+1${attendeePhone.replace(/\D/g, '')}`;
          
          const twilioRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: new URLSearchParams({
                From: TWILIO_PHONE_NUMBER!,
                To: formattedPhone,
                Body: `Call scheduled: ${title} on ${new Date(startTime).toLocaleString()}. Zoom link: ${zoomLink}`
              })
            }
          );

          if (!twilioRes.ok) {
            console.error('Failed to send SMS:', await twilioRes.text());
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Call scheduled successfully',
            event 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getAuthUrl': {
        // Generate Google OAuth URL for calendar access
        const redirectUri = `${req.headers.get('origin')}/auth/google/callback`;
        const scope = 'https://www.googleapis.com/auth/calendar.events';
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${CLIENT_ID}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scope)}&` +
          `access_type=offline&` +
          `prompt=consent`;

        return new Response(
          JSON.stringify({ authUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});