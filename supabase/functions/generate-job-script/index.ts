// Generate a Problem/Solution outreach script for a marketing_jobs row.
// Calls OpenAI gpt-4o-mini with a Danny Cahill-inspired prompt and returns
// five formats: cold call, email, LinkedIn message, voicemail, objection
// response. The client persists the result via a separate insert into
// marketing_job_scripts (kept out of this function so a save failure
// doesn't cost a regeneration).

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

interface JobContext {
  company_name?: string;
  job_title?: string;
  city?: string;
  state?: string;
  job_url?: string;
  date_posted?: string | null;
  age_days?: number | null;
  company_type?: string | null;
  compensation?: string | null;
  priority_score?: number | null;
  company_description?: string | null;
  job_description?: string | null;
}

interface FormInputs {
  audience: string;            // A
  audienceOther?: string;
  problem: string;             // B
  problemOther?: string;
  service: string;             // C
  serviceOther?: string;
  companyType?: string;        // D
  roleCategory?: string;       // E
  urgency: string;             // F
  tone: string;                // G
  proof: string;               // H
  proofOther?: string;
  cta: string;                 // I
  ctaOther?: string;
  objections: string[];        // J — up to 3
  // Optional free-text
  customOpener?: string;
  specificPain?: string;
  companyInsight?: string;
  hiringManagerName?: string;
  caseStudy?: string;
  notes?: string;
  avoidLanguage?: string;
}

interface SenderIdentity {
  first_name?: string;
  last_name?: string;
  title?: string;
  company?: string;
}

interface ScriptOutputs {
  coldCall: string;
  email: { subject: string; body: string };
  linkedin: string;
  // Follow-Up Email is a separate message variant for the second
  // (or third) touch on the same contact. Frames as a polite nudge,
  // references the prior outreach, restates the value briefly, and
  // ends with the same CTA.
  followUpEmail: { subject: string; body: string };
}

function val(v?: string | null): string {
  return (v || '').trim();
}

function buildPrompt(job: JobContext, f: FormInputs, sender: SenderIdentity): string {
  const audience = f.audience === 'Other' ? val(f.audienceOther) || 'a senior decision-maker' : f.audience;
  const problem = f.problem === 'Other' ? val(f.problemOther) || 'an unfilled critical role' : f.problem;
  const service = f.service === 'Other' ? val(f.serviceOther) || 'specialized healthcare recruiting' : f.service;
  const proof = f.proof === 'Other' ? val(f.proofOther) || 'specialized healthcare recruiting expertise' : f.proof;
  const cta = f.cta === 'Other' ? val(f.ctaOther) || 'a brief intro call' : f.cta;
  const objection = (f.objections || []).filter(o => o && o !== 'No objection selected').slice(0, 3).join('; ');
  const location = [val(job.city), val(job.state)].filter(Boolean).join(', ');

  const known: string[] = [];
  if (val(job.company_name)) known.push(`Company: ${val(job.company_name)}`);
  if (val(job.job_title)) known.push(`Open role: ${val(job.job_title)}`);
  if (location) known.push(`Location: ${location}`);
  if (val(job.company_type)) known.push(`Company type: ${val(job.company_type)}`);
  if (val(f.companyType) && val(f.companyType) !== val(job.company_type)) known.push(`User-confirmed company type: ${val(f.companyType)}`);
  if (val(f.roleCategory)) known.push(`Role category: ${val(f.roleCategory)}`);
  if (job.age_days != null) known.push(`Posting age: ${job.age_days} days`);
  if (val(job.date_posted)) known.push(`Date posted: ${val(job.date_posted)}`);
  if (val(job.compensation)) known.push(`Compensation: ${val(job.compensation)}`);
  if (job.priority_score != null) known.push(`Priority score: ${job.priority_score}`);
  if (val(job.job_url)) known.push(`Posting URL: ${val(job.job_url)}`);
  if (val(job.company_description)) known.push(`Company description: ${val(job.company_description).slice(0, 600)}`);
  if (val(job.job_description)) known.push(`Job description: ${val(job.job_description).slice(0, 1000)}`);
  if (val(f.hiringManagerName)) known.push(`Hiring manager (if relevant to greeting): ${val(f.hiringManagerName)}`);
  if (val(f.companyInsight)) known.push(`Company insight to weave in: ${val(f.companyInsight)}`);
  if (val(f.specificPain)) known.push(`Specific pain to mention: ${val(f.specificPain)}`);
  if (val(f.notes)) known.push(`Researcher notes: ${val(f.notes)}`);

  const jobTitle = val(job.job_title);
  const companyName = val(job.company_name);
  const jobUrl = val(job.job_url);

  const constraints: string[] = [
    'Reference the company and the open role specifically — no mass-email language.',
    `Target the actual needs of a ${audience}; a clinical leader has different priorities than HR or TA.`,
    'Identify the likely business problem the open role creates, and explain why it matters now.',
    'Position MedCentric as a specialized healthcare recruiting partner — not a generic staffing agency.',
    `Emphasize this proof point: ${proof}.`,
    `End with this call to action, kept low-friction: ${cta}.`,
    'Keep tone human, confident, and practical. No buzzwords, no fluff.',
    'If a detail is unknown, do not invent it — leave it out.',
  ];

  // Job-specific opener + posting URL. The user wants every outreach
  // to name the role verbatim near the start, and to surface the
  // source URL in the written channels (email, LinkedIn) so the
  // recipient can confirm we're talking about a real, current
  // posting. Cold call never carries the URL — it's read aloud and
  // a URL would be noise.
  if (jobTitle) {
    const opener = companyName
      ? `I am contacting you about the role you have advertised for a ${jobTitle} at ${companyName}.`
      : `I am contacting you about the role you have advertised for a ${jobTitle}.`;
    constraints.push(
      `JOB-SPECIFIC OPENER: every output must reference "${jobTitle}" by name in the FIRST one or two sentences. Use a phrasing close to: "${opener}" — paraphrasing is fine, but the role title must appear verbatim and the open-role context must be explicit.`
    );
  }
  if (jobUrl) {
    constraints.push(
      `POSTING URL: include the posting URL ${jobUrl} in the email body, the follow-up email body, and the LinkedIn message — render it on its own line or right after the opener so the recipient can confirm the listing. Do NOT include it in the cold call (spoken). Do NOT use markdown/HTML link syntax; just the raw URL.`
    );
  }

  if (val(f.customOpener)) constraints.push(`Use this opening line verbatim: "${val(f.customOpener)}"`);
  if (val(f.avoidLanguage)) constraints.push(`Avoid this language: ${val(f.avoidLanguage)}`);
  if (val(f.caseStudy)) constraints.push(`Reference this proof point or case study where it fits: ${val(f.caseStudy)}`);

  const senderName = [val(sender.first_name), val(sender.last_name)].filter(Boolean).join(' ');
  const senderTitle = val(sender.title);
  const senderCompany = val(sender.company) || 'MedCentric';
  const signoffLines: string[] = [];
  if (senderName)    signoffLines.push(`Sender name: ${senderName}`);
  if (senderTitle)   signoffLines.push(`Sender title: ${senderTitle}`);
  if (senderCompany) signoffLines.push(`Sender company: ${senderCompany}`);

  return `You are writing a Problem/Solution outreach script for ${senderCompany}, a specialized healthcare recruiting firm. The recipient is a ${audience}. The service being pitched is ${service}. The primary business problem to lead with is: ${problem}. Tone: ${f.tone}. Urgency: ${f.urgency}. Likely objection to address (if any): ${objection || 'none'}.

${signoffLines.length > 0 ? `SENDER IDENTITY — use these exact strings, do not paraphrase, do not invent placeholders:
${signoffLines.map(s => `  - ${s}`).join('\n')}
HARD RULES for sender identity (every output must satisfy these):
  1. Output must NOT contain any bracketed placeholder string. The literal substrings "[Your Name]", "[Your name]", "[your name]", "[Your Title]", "[Your title]", "[Your Company]", "[Your company]", "[Name]", "[Title]", "[Company]", "[name]", "[title]", "[company]" are FORBIDDEN.
  2. The cold call MUST open with "Hi, this is ${senderName}${senderTitle ? `, ${senderTitle}` : ''} from ${senderCompany}." (or a near-paraphrase that still names ${senderName} and ${senderCompany} verbatim).
  3. The voicemail MUST identify the caller as ${senderName} from ${senderCompany} in the first sentence.
  4. The email body MUST end with the sender block on its own lines: "${senderName}${senderTitle ? `\\n${senderTitle}` : ''}${senderCompany ? `\\n${senderCompany}` : ''}".
  5. The LinkedIn message MUST be signed "— ${senderName}" or sign off with "${senderName}, ${senderCompany}".
` : ''}

Use a Danny Cahill-inspired recruiting style: lead with a specific, likely business pain, make it feel urgent and concrete, then position MedCentric as the practical solution. Be commercial — every line should earn its place.

Known facts (use only what is relevant; never invent missing details):
${known.map(k => `  - ${k}`).join('\n')}

Constraints:
${constraints.map(c => `  - ${c}`).join('\n')}
${senderName ? `  - Sign every script (cold call close, email signature, voicemail, LinkedIn) as ${senderName}${senderTitle ? `, ${senderTitle}` : ''}${senderCompany ? `, ${senderCompany}` : ''}. Do not use [Your Name] / [Your Title] / [Your Company] placeholders.` : ''}

Return STRICT JSON matching this exact shape, no prose outside the JSON:
{
  "coldCall": "string — under 90 seconds spoken, conversational. First sentence must name the open role verbatim. Then the hook, the likely problem, and the CTA. NEVER include a URL in the spoken cold call.",
  "email": {
    "subject": "string — short, specific, no clickbait, ideally references the role or company",
    "body": "string — 5-9 short lines. First line MUST reference the open role verbatim ('I am contacting you about the role you have advertised for a {Role}…' or close paraphrase). Then problem statement, why-it-matters, solution + proof point, CTA. If a posting URL was provided, include it on its own line right after the opener — raw URL, no markdown. Plain prose, no greeting like 'Dear' unless a hiring manager name is provided."
  },
  "linkedin": "string — 4-7 short lines, more casual than the email. Same job-title-in-first-sentence + posting-URL-on-its-own-line rules apply.",
  "followUpEmail": {
    "subject": "string — short, references that this is a follow-up. Examples: 'Following up on the {role} search', 'Re: {Company} {role}'. Avoid 'Just checking in'.",
    "body": "string — 4-6 short lines: a one-line bump referencing the prior message and naming the role verbatim, one line restating the specific problem the open role likely creates, one line reaffirming the proof point, and the same CTA. If a posting URL was provided, include it on its own line near the top so the recipient can re-locate the listing. Tone is patient, not pushy. No greeting if no hiring manager name is provided."
  }
}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(req) });

  try {
    const body = await req.json();
    const job: JobContext = body.job || {};
    const inputs: FormInputs = body.inputs || {};
    const sender: SenderIdentity = body.sender || {};

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(job, inputs, sender);

    // Hard wall-clock cap per OpenAI call. Without this, a slow
    // upstream response can stretch into minutes — and a retry on
    // failure compounds the wait. v2: bumped 30s→45s after observing
    // gpt-4o-mini occasionally taking ~25-30s on prompts with long
    // company_description + job_description payloads. The earlier 30s
    // ceiling caused HTTP 502 "Generation failed" toasts on perfectly
    // valid jobs. Client guard in OutreachWorkspace was raised to 55s
    // in lockstep so the function can return its clean 502 before the
    // browser bails.
    // v3: bumped 45s → 50s and max_tokens 1500 → 2500 after the wild
    // showed two regressions: (1) gpt-4o-mini still occasionally
    // crossing 45s on heavy prompts; (2) verbose runs filling the
    // 1500-token budget mid-generation under response_format=json_object,
    // which closes the JSON cleanly but with one or more output fields
    // as empty strings — the user sees a blank message instead of an
    // error. Client guard in OutreachWorkspace bumped to 65s in lockstep.
    const OPENAI_TIMEOUT_MS = 50_000;
    const callOpenAI = async (): Promise<
      | { ok: true; parsed: ScriptOutputs }
      | { ok: false; status: number; error: string; raw?: string; transient: boolean }
    > => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), OPENAI_TIMEOUT_MS);
      let r: Response;
      try {
        r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: ac.signal,
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            // 2500. The 4-output JSON envelope lands at ~600 tokens
            // in practice but a verbose run can push past 1500 mid-
            // generation, and json_object mode closes the brace with
            // empty strings for any keys not yet emitted. 2500 keeps
            // generation comfortably under the 50s timeout while
            // giving enough headroom that "blank message" can't be
            // explained by truncation.
            max_tokens: 2500,
            temperature: 0.7,
            response_format: { type: 'json_object' },
          }),
        });
      } catch (e: any) {
        clearTimeout(timer);
        const aborted = e?.name === 'AbortError';
        return {
          ok: false, status: 0,
          error: aborted ? `OpenAI request timed out after ${Math.round(OPENAI_TIMEOUT_MS / 1000)}s` : `Fetch error: ${e?.message || String(e)}`,
          // Do NOT retry timeouts — if the upstream is slow, the
          // retry will just blow another full timeout.
          transient: !aborted && false,
        };
      }
      clearTimeout(timer);
      const status = r.status;
      let bodyText = '';
      try { bodyText = await r.text(); } catch {}
      if (!r.ok) {
        // 5xx and rate-limit (429) are worth one retry; auth and
        // bad-request usually aren't.
        const transient = status >= 500 || status === 429;
        return { ok: false, status, error: `OpenAI ${status}: ${bodyText.slice(0, 500)}`, transient };
      }
      let data: any;
      try { data = JSON.parse(bodyText); } catch {
        return { ok: false, status, error: 'OpenAI returned non-JSON envelope', raw: bodyText.slice(0, 500), transient: true };
      }
      const choice = data?.choices?.[0];
      const finishReason = choice?.finish_reason;
      const content = (choice?.message?.content || '').trim();
      if (!content) {
        return { ok: false, status, error: `OpenAI returned empty content (finish_reason=${finishReason || 'unknown'})`, transient: true };
      }
      let parsed: ScriptOutputs;
      try {
        parsed = JSON.parse(content) as ScriptOutputs;
      } catch {
        return { ok: false, status, error: `OpenAI returned non-JSON content (finish_reason=${finishReason || 'unknown'})`, raw: content.slice(0, 500), transient: true };
      }
      // Field-level shape check. Previously a JSON object with one or
      // more fields blank (truncation, finish_reason='length',
      // low-effort response) was returned as success; the client
      // wrote a blank message into state, overwriting the prior
      // good draft. Treat empties as transient so the retry-once
      // path covers them, and surface a clear error if both attempts
      // came back empty.
      const empties: string[] = [];
      if (!parsed?.coldCall || !String(parsed.coldCall).trim()) empties.push('coldCall');
      if (!parsed?.email?.body || !String(parsed.email.body).trim()) empties.push('email.body');
      if (!parsed?.email?.subject || !String(parsed.email.subject).trim()) empties.push('email.subject');
      if (!parsed?.linkedin || !String(parsed.linkedin).trim()) empties.push('linkedin');
      if (!parsed?.followUpEmail?.body || !String(parsed.followUpEmail.body).trim()) empties.push('followUpEmail.body');
      if (!parsed?.followUpEmail?.subject || !String(parsed.followUpEmail.subject).trim()) empties.push('followUpEmail.subject');
      if (empties.length > 0) {
        return {
          ok: false,
          status,
          error: `OpenAI returned an envelope with empty fields: ${empties.join(', ')} (finish_reason=${finishReason || 'unknown'})`,
          raw: content.slice(0, 500),
          transient: true,
        };
      }
      return { ok: true, parsed };
    };

    let attempt = await callOpenAI();
    // Only retry on transient failures (5xx, 429, empty content,
    // truncated JSON). NEVER retry timeouts or 4xx — that path turns a
    // 30s wait into a 60s wait.
    if (!attempt.ok && attempt.transient) {
      attempt = await callOpenAI();
    }

    if (!attempt.ok) {
      return new Response(JSON.stringify({ error: attempt.error, raw: attempt.raw }), {
        status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ outputs: attempt.parsed, prompt }), {
      status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
