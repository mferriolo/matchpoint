// Gmail OAuth handshake.
//
// Three actions:
//   ?action=start    → 302 to Google's consent screen with our scopes
//                      and redirect_uri pointing back to ?action=callback
//   ?action=callback → exchanges the auth code, fetches the connected
//                      gmail address, upserts gmail_tokens, then 302s
//                      the user back into the app
//   POST {action:'status'}     → JSON: connected state + connected email
//   POST {action:'disconnect'} → drops the row + revokes the refresh token
//
// Required Supabase secrets (set via the dashboard, not committed):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   APP_URL                  — e.g. https://matchpoint-nu-dun.vercel.app
//                              used as the post-callback landing page
//   SUPABASE_URL             — auto-set by Supabase, used to build the
//                              redirect_uri Google sees (must match what
//                              you registered in the Google Cloud Console)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://matchpoint-nu-dun.vercel.app',
  'http://localhost:8080',
  'http://localhost:5173',
];

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

// Send + read-write minimum: gmail.send is enough for outbound only;
// we don't need to read the inbox. userinfo.email is requested so we
// can label the connection by the actual gmail address the user chose.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
].join(' ');

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO  = 'https://openidconnect.googleapis.com/v1/userinfo';

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getRedirectUri(): string {
  // The function's own public URL, with action=callback. Whatever you
  // register in Google Cloud Console MUST match this string exactly.
  const supabaseUrl = getEnv('SUPABASE_URL').replace(/\/$/, '');
  return `${supabaseUrl}/functions/v1/gmail-oauth?action=callback`;
}

function getServiceClient() {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonResp(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

// --- start: redirect to Google ---
async function handleStart(req: Request): Promise<Response> {
  try {
    const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: getRedirectUri(),
      response_type: 'code',
      scope: SCOPES,
      // offline => return refresh_token; prompt=consent forces a
      // re-prompt so the refresh_token is reliably issued (Google
      // suppresses it on subsequent grants without this).
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });
    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    return new Response(null, { status: 302, headers: { Location: authUrl, ...corsHeaders(req) } });
  } catch (e: any) {
    return jsonResp({ error: e?.message || String(e) }, 500, req);
  }
}

// --- callback: exchange code, store tokens, redirect into the app ---
async function handleCallback(req: Request, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const appUrl = (Deno.env.get('APP_URL') || ALLOWED_ORIGINS[0]).replace(/\/$/, '');

  if (error) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/?gmail=error&reason=${encodeURIComponent(error)}` },
    });
  }
  if (!code) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/?gmail=error&reason=no_code` },
    });
  }

  try {
    const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = getEnv('GOOGLE_OAUTH_CLIENT_SECRET');

    // Exchange auth code for tokens.
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(),
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenResp.ok) {
      const txt = await tokenResp.text();
      console.error('Google token exchange failed:', tokenResp.status, txt);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/?gmail=error&reason=${encodeURIComponent('token_exchange_' + tokenResp.status)}` },
      });
    }
    const tokens = await tokenResp.json();
    const accessToken = tokens.access_token as string;
    const refreshToken = tokens.refresh_token as string | undefined;
    const expiresIn = Number(tokens.expires_in || 3600);
    const scope = tokens.scope as string | undefined;

    if (!accessToken) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/?gmail=error&reason=no_access_token` },
      });
    }

    // Pull the email + sub from userinfo so we know which Gmail
    // account the user just connected.
    const userResp = await fetch(GOOGLE_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userResp.ok) {
      const txt = await userResp.text();
      console.error('userinfo failed:', userResp.status, txt);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/?gmail=error&reason=userinfo_failed` },
      });
    }
    const u = await userResp.json();
    const email = String(u.email || '').toLowerCase().trim();
    const sub = String(u.sub || '');
    if (!email) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/?gmail=error&reason=no_email` },
      });
    }

    const sb = getServiceClient();

    // If the caller didn't include refresh_token (e.g. re-auth without
    // prompt=consent), keep whatever we have on file so we don't lose
    // the ability to refresh later.
    const existing = await sb.from('gmail_tokens').select('refresh_token').eq('gmail_email', email).maybeSingle();
    const finalRefresh = refreshToken || existing.data?.refresh_token;

    if (!finalRefresh) {
      // First-time connect with no refresh_token returned. Force the
      // user back through with prompt=consent.
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/?gmail=error&reason=no_refresh_token` },
      });
    }

    const expiresAt = new Date(Date.now() + (expiresIn * 1000) - 60_000).toISOString();
    const { error: upsertErr } = await sb.from('gmail_tokens').upsert({
      gmail_email: email,
      refresh_token: finalRefresh,
      access_token: accessToken,
      access_token_expires_at: expiresAt,
      scope: scope || null,
      google_subject: sub || null,
    }, { onConflict: 'gmail_email' });
    if (upsertErr) {
      console.error('gmail_tokens upsert failed:', upsertErr);
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/?gmail=error&reason=db_upsert_failed` },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/?gmail=connected&email=${encodeURIComponent(email)}` },
    });
  } catch (e: any) {
    console.error('callback fatal:', e);
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/?gmail=error&reason=${encodeURIComponent('exception')}` },
    });
  }
}

async function handleStatus(req: Request): Promise<Response> {
  try {
    const sb = getServiceClient();
    const { data } = await sb.from('gmail_tokens')
      .select('gmail_email, scope, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return jsonResp({ connected: false }, 200, req);
    return jsonResp({
      connected: true,
      email: data.gmail_email,
      scope: data.scope || null,
      updated_at: data.updated_at,
    }, 200, req);
  } catch (e: any) {
    return jsonResp({ error: e?.message || String(e) }, 500, req);
  }
}

async function handleDisconnect(req: Request, body: any): Promise<Response> {
  try {
    const sb = getServiceClient();
    const email = String(body?.email || '').toLowerCase().trim();
    if (!email) return jsonResp({ error: 'email required' }, 400, req);

    const { data: row } = await sb.from('gmail_tokens')
      .select('refresh_token')
      .eq('gmail_email', email)
      .maybeSingle();

    // Best-effort revoke server-side; ignore failures since the row
    // delete is what protects us either way.
    if (row?.refresh_token) {
      try {
        await fetch(GOOGLE_REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: row.refresh_token }).toString(),
        });
      } catch {}
    }
    await sb.from('gmail_tokens').delete().eq('gmail_email', email);
    return jsonResp({ ok: true }, 200, req);
  } catch (e: any) {
    return jsonResp({ error: e?.message || String(e) }, 500, req);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';

  // GET-only flows are the OAuth redirects.
  if (req.method === 'GET') {
    if (action === 'start')    return handleStart(req);
    if (action === 'callback') return handleCallback(req, url);
    return jsonResp({ error: 'unknown action' }, 400, req);
  }

  if (req.method !== 'POST') {
    return jsonResp({ error: 'method not allowed' }, 405, req);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const postAction = action || body?.action || '';

  if (postAction === 'status')     return handleStatus(req);
  if (postAction === 'disconnect') return handleDisconnect(req, body);
  return jsonResp({ error: 'unknown action' }, 400, req);
});
