# Send Email Function Fix

## Problem Identified
The `send-email` edge function is receiving mixed up parameters:
- `to`: ["Matt"] ❌ (receiving name instead of email)
- `subject`: "matt@medcentric.net" ❌ (receiving email instead of subject)

## Root Cause
The edge function doesn't exist in the codebase or has incorrect parameter extraction.

## Frontend Code Analysis
Both frontend files are passing parameters CORRECTLY:

### SendEmailDialog.tsx (Line 41-56)
```typescript
await supabase.functions.invoke('send-email', {
  body: {
    to: candidateEmail,        // ✅ Correct
    subject: subject,           // ✅ Correct
    html: `<div>...</div>`      // ✅ Correct
  }
});
```

### EmailTestSection.tsx (Line 51-57)
```typescript
await supabase.functions.invoke('send-email', {
  body: {
    to: testEmail,              // ✅ Correct
    subject: testSubject,       // ✅ Correct
    html: testHtml              // ✅ Correct
  }
});
```

## Solution: Create/Update Edge Function

Create `supabase/functions/send-email/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Resend } from 'npm:resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    const resend = new Resend(resendApiKey);
    const body = await req.json();
    
    // CRITICAL: Extract parameters correctly
    const { to, subject, html, from } = body;
    
    console.log('=== SEND EMAIL DEBUG ===');
    console.log('to:', to, 'type:', typeof to);
    console.log('subject:', subject, 'type:', typeof subject);
    console.log('html length:', html?.length);
    
    // Validate parameters
    if (!to) {
      return new Response(
        JSON.stringify({ error: 'Missing "to" (email address)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!subject) {
      return new Response(
        JSON.stringify({ error: 'Missing "subject"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send email
    const result = await resend.emails.send({
      from: from || 'onboarding@resend.dev',
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      html: html,
    });

    return new Response(
      JSON.stringify({ success: true, id: result.data?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

## Deployment Steps

1. **Create the function file:**
   ```bash
   mkdir -p supabase/functions/send-email
   # Copy the code above into supabase/functions/send-email/index.ts
   ```

2. **Deploy to Supabase:**
   ```bash
   supabase functions deploy send-email
   ```

3. **Set your Resend API key:**
   ```bash
   supabase secrets set RESEND_API_KEY=re_your_actual_key_here
   ```

4. **Test the function:**
   - Go to Admin → System Settings → Email Test
   - Enter your email and click "Send Test Email"
   - Check function logs: `supabase functions logs send-email`

## Verification
After deployment, the logs should show:
```
to: matt@medcentric.net type: string
subject: Interview Invitation type: string
html length: 423
```

NOT:
```
to: Matt type: string  ❌
subject: matt@medcentric.net type: string  ❌
```
