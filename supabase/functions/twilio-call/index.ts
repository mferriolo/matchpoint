export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !twilioPhone) {
      throw new Error('Missing Twilio credentials');
    }

    if (req.method === 'POST') {
      const { action, to, callbackUrl, voicemailUrl, message } = await req.json();

      if (action === 'make_call') {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
        
        const formData = new URLSearchParams();
        formData.append('To', to);
        formData.append('From', twilioPhone);
        formData.append('Url', callbackUrl || 'http://demo.twilio.com/docs/voice.xml');
        
        // Add voicemail handling if provided
        if (voicemailUrl) {
          formData.append('StatusCallback', voicemailUrl);
          formData.append('StatusCallbackEvent', 'completed');
        }

        const auth = btoa(`${accountSid}:${authToken}`);
        
        const response = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData
        });

        const result = await response.json();
        
        return new Response(JSON.stringify({ 
          success: true, 
          callSid: result.sid,
          status: result.status 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (action === 'send_sms') {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        
        const formData = new URLSearchParams();
        formData.append('To', to);
        formData.append('From', twilioPhone);
        formData.append('Body', message || 'Hi, I tried calling you but couldn\'t reach you. Please call me back when you get a chance.');

        const auth = btoa(`${accountSid}:${authToken}`);
        
        const response = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData
        });

        const result = await response.json();
        
        return new Response(JSON.stringify({ 
          success: true, 
          messageSid: result.sid,
          status: result.status 
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      if (action === 'leave_voicemail') {
        // Generate TwiML for voicemail recording
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say voice="alice">Hi, you've reached the voicemail. Please leave a message after the beep.</Say>
          <Record maxLength="60" timeout="5" transcribe="true" />
          <Say voice="alice">Thank you for your message. Goodbye.</Say>
        </Response>`;

        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml', ...corsHeaders }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});