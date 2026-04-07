export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const body = await req.json();
    // ADD DETAILED LOGGING FOR DEBUGGING
    console.log('=== EMAIL REQUEST DEBUG ===');
    console.log('Full request body:', JSON.stringify(body, null, 2));
    console.log('to field:', body.to);
    console.log('to field type:', typeof body.to);
    console.log('to field is array:', Array.isArray(body.to));
    console.log('subject field:', body.subject);
    console.log('html field length:', body.html?.length);
    console.log('from field:', body.from);
    console.log('=========================');
    const { to, subject, html, text, from, replyTo, testMode } = body;
    // Validate required fields
    if (!to || !subject || !html && !text) {
      return new Response(JSON.stringify({
        error: 'Missing required fields. Please provide: to, subject, and either html or text'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not found in environment variables');
      return new Response(JSON.stringify({
        error: 'Email service not configured. Please set RESEND_API_KEY in environment variables.'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    // For test mode, just return success without actually sending
    if (testMode) {
      console.log('Test mode - would send email:', {
        to,
        subject,
        from
      });
      return new Response(JSON.stringify({
        success: true,
        message: 'Test mode - email not actually sent',
        data: {
          to,
          subject,
          from: from || 'onboarding@resend.dev'
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    console.log('Sending email to:', to);
    console.log('Subject:', subject);
    // Prepare email data
    const emailData = {
      from: from || 'MatchPoint <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [
        to
      ],
      subject: subject,
      ...html && {
        html
      },
      ...text && {
        text
      },
      ...replyTo && {
        reply_to: replyTo
      }
    };
    console.log('Email data being sent to Resend:', JSON.stringify(emailData, null, 2));
    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });
    const result = await response.json();
    if (!response.ok) {
      console.error('Resend API error:', result);
      // Provide helpful error messages
      let errorMessage = result.message || `Email failed with status ${response.status}`;
      if (response.status === 401) {
        errorMessage = 'Invalid API key. Please check your RESEND_API_KEY configuration.';
      } else if (response.status === 403) {
        errorMessage = 'API key lacks permission. Please verify your Resend account and API key permissions.';
      } else if (response.status === 422) {
        errorMessage = `Validation error: ${result.message || 'Invalid email data'}`;
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      }
      return new Response(JSON.stringify({
        error: errorMessage,
        details: result
      }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    console.log('Email sent successfully:', result);
    return new Response(JSON.stringify({
      success: true,
      message: 'Email sent successfully',
      data: result
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'An unexpected error occurred',
      details: error.toString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
});
