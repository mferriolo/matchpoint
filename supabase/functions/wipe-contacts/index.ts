// wipe-contacts — deletes EVERY row in marketing_contacts and zeros out
// marketing_companies.contact_count. One-shot admin nuke, invoked from
// the "Wipe all contacts" button in the Contacts tab.
//
//   Request body: { confirm: "WIPE_ALL_CONTACTS" }
//
// The token is a safety latch so accidental invocations can't wipe the
// table — the UI sends it with the button click.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ['https://matchpoint-nu-dun.vercel.app', 'http://localhost:8080', 'http://localhost:5173'];
function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'WIPE_ALL_CONTACTS') {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid confirm token' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
      );
    }

    const { count: before } = await supabase
      .from('marketing_contacts')
      .select('id', { count: 'exact', head: true });

    // Supabase-JS requires a filter on delete/update; `not.id.is.null`
    // is the canonical "match every row" shape.
    const { error: delErr } = await supabase
      .from('marketing_contacts')
      .delete()
      .not('id', 'is', null);
    if (delErr) {
      return new Response(
        JSON.stringify({ success: false, error: delErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
      );
    }

    const { error: zeroErr } = await supabase
      .from('marketing_companies')
      .update({ contact_count: 0, updated_at: new Date().toISOString() })
      .not('id', 'is', null);
    if (zeroErr) {
      console.warn('Failed to zero contact_count:', zeroErr.message);
    }

    return new Response(
      JSON.stringify({ success: true, deleted: before || 0 }),
      { headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...getCorsHeaders(req) } }
    );
  }
});
