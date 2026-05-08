// Send an outreach email via the Gmail API on behalf of the
// connected account. Reads tokens stored by gmail-oauth, refreshes
// the access_token if it's near expiry, builds a multipart/alternative
// MIME message (text/plain + text/html), base64url-encodes it, and
// POSTs to users.messages.send.
//
// Required Supabase secrets (shared with gmail-oauth):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL   = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getServiceClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
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

// base64url with no padding — Gmail's send endpoint requires it.
function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2047 encoded-word for header values that may contain non-ASCII
// characters (display names, subjects). Always safe to apply.
function encodeRfc2047(s: string): string {
  // ASCII-only fast path keeps headers readable.
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

// Pull a fresh access_token if the cached one is within 60s of expiry
// or missing. Saves the new value back so subsequent sends in the
// session can reuse it.
async function refreshAccessToken(sb: any, row: any): Promise<string> {
  const now = Date.now();
  const cached = row.access_token as string | null;
  const cachedExp = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  if (cached && cachedExp > now + 60_000) return cached;

  const clientId = getEnv('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = getEnv('GOOGLE_OAUTH_CLIENT_SECRET');

  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`refresh failed: ${r.status} ${txt.slice(0, 200)}`);
  }
  const j = await r.json();
  const accessToken = j.access_token as string;
  const expiresIn = Number(j.expires_in || 3600);
  const expiresAt = new Date(Date.now() + (expiresIn * 1000) - 60_000).toISOString();

  await sb.from('gmail_tokens')
    .update({ access_token: accessToken, access_token_expires_at: expiresAt })
    .eq('gmail_email', row.gmail_email);

  return accessToken;
}

// Build a multipart/alternative MIME message. Gmail's compose UI shows
// HTML in HTML-capable clients and plain text everywhere else.
function buildMime(args: {
  fromEmail: string;
  fromName?: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  replyTo?: string;
}): string {
  const boundary = 'b' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const fromHeader = args.fromName
    ? `${encodeRfc2047(args.fromName)} <${args.fromEmail}>`
    : args.fromEmail;
  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${args.to}`,
    `Subject: ${encodeRfc2047(args.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (args.replyTo) headers.push(`Reply-To: ${args.replyTo}`);

  const lines: string[] = [
    headers.join('\r\n'),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    args.textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    args.htmlBody,
    '',
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST')    return jsonResp({ error: 'method not allowed' }, 405, req);

  let body: any = {};
  try { body = await req.json(); } catch {
    return jsonResp({ error: 'invalid JSON body' }, 400, req);
  }

  const to       = String(body.to || '').trim();
  const subject  = String(body.subject || '').trim();
  const textBody = String(body.text || body.body || '').trim();
  const htmlBody = String(body.html || '').trim();
  const fromName = body.from_name ? String(body.from_name).trim() : '';
  const replyTo  = body.reply_to  ? String(body.reply_to).trim()  : '';
  const requestedEmail = body.gmail_email ? String(body.gmail_email).toLowerCase().trim() : '';

  if (!to)       return jsonResp({ error: 'to is required' }, 400, req);
  if (!subject)  return jsonResp({ error: 'subject is required' }, 400, req);
  if (!htmlBody && !textBody) return jsonResp({ error: 'html or text body is required' }, 400, req);

  try {
    const sb = getServiceClient();
    let q = sb.from('gmail_tokens')
      .select('gmail_email, refresh_token, access_token, access_token_expires_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (requestedEmail) q = q.eq('gmail_email', requestedEmail).limit(1) as any;
    const { data: row, error: rowErr } = await q.maybeSingle();
    if (rowErr) return jsonResp({ error: `token lookup failed: ${rowErr.message}` }, 500, req);
    if (!row)   return jsonResp({ error: 'No Gmail account connected. Connect Gmail in Settings first.' }, 400, req);

    const accessToken = await refreshAccessToken(sb, row);

    // Plain-text fallback: derive from html if caller didn't supply
    // one explicitly. Strip tags + decode the most common entities.
    const textFinal = textBody || htmlBody
      .replace(/<br\s*\/?>(?=\s|$)/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // If the caller didn't pass html, wrap the text body with the
    // same minimal HTML envelope our preview uses so the recipient
    // still gets a styled view if their client renders HTML.
    const htmlFinal = htmlBody || `<div style="font-family:system-ui,Arial,sans-serif;line-height:1.5;white-space:pre-wrap;">${textFinal}</div>`;

    const mime = buildMime({
      fromEmail: row.gmail_email,
      fromName,
      to,
      subject,
      textBody: textFinal,
      htmlBody: htmlFinal,
      replyTo,
    });

    const raw = base64UrlEncode(mime);

    const sendResp = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
    if (!sendResp.ok) {
      const txt = await sendResp.text();
      console.error('Gmail send failed:', sendResp.status, txt);
      return jsonResp({ error: `Gmail send ${sendResp.status}: ${txt.slice(0, 500)}` }, 502, req);
    }
    const sent = await sendResp.json();
    return jsonResp({
      ok: true,
      message_id: sent.id,
      thread_id: sent.threadId,
      from: row.gmail_email,
      to,
    }, 200, req);
  } catch (e: any) {
    console.error('gmail-send fatal:', e);
    return jsonResp({ error: e?.message || String(e) }, 500, req);
  }
});
