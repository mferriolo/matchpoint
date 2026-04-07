# Fix for OpenAI API Key Error

## Problem
The Edge Function cannot find the OPENAI_API_KEY environment variable, causing a 401/500 error.

## Solution

### Option 1: Add the Secret via Supabase Dashboard (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **Settings** → **Edge Functions**
3. Click on the **Secrets** tab
4. Add a new secret:
   - Name: `OPENAI_API_KEY`
   - Value: Your OpenAI API key (starts with `sk-proj-` or `sk-`)
5. Save the secret
6. Redeploy the Edge Function

### Option 2: Use Supabase CLI

```bash
# Set the secret
supabase secrets set OPENAI_API_KEY=sk-proj-your-actual-key-here

# Redeploy the function
supabase functions deploy chatgpt-integration
```

### Option 3: Quick Fix Using Existing Secret

Since `VITE_OPENAI_API_KEY` is already configured, you can:

1. Copy the value from VITE_OPENAI_API_KEY
2. Create a new secret named OPENAI_API_KEY with the same value
3. Or update the Edge Function code to use VITE_OPENAI_API_KEY:

```javascript
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || Deno.env.get('VITE_OPENAI_API_KEY');
```

## Verification

After adding the secret:

1. Check the Supabase Dashboard → Edge Functions → Logs
2. Look for: "OpenAI API key found: sk-..."
3. Test the function again

## Important Notes

- The secret name must be exactly `OPENAI_API_KEY` (case-sensitive)
- The API key should start with `sk-proj-` or `sk-`
- After adding the secret, the Edge Function may need 1-2 minutes to pick up the change
- If still not working, manually redeploy the Edge Function