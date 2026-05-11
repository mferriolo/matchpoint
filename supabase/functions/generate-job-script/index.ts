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

interface RecipientIdentity {
  first_name?: string;
  last_name?: string;
  title?: string;
}

// Map a free-text recipient title to a normalized role bucket and a
// "what this person cares about" framing string. The classifier is
// substring-based and runs in priority order — if "Chief Medical"
// matches we stop there, even if the same title also contains
// "Director" or "Officer". Returns null when nothing matches; the
// prompt falls back to the generic audience framing in that case.
function classifyRecipient(rawTitle: string): { bucket: string; framing: string } | null {
  const t = rawTitle.toLowerCase();
  if (!t.trim()) return null;
  // Order matters — most specific first.
  const rules: Array<[RegExp, string, string]> = [
    [
      /chief\s+medical|cmo\b|medical\s+director|chief\s+physician/,
      'Chief Medical Officer / Medical Director',
      "clinical quality, physician retention, peer-to-peer recruitment, the credibility cost of a long vacancy on remaining clinical leadership, and the operational risk of clinical coverage gaps. Speak as a peer to a clinical leader — they don't care about HR metrics, they care about the team and the patients.",
    ],
    [
      /chief\s+nursing|cno\b|chief\s+clinical/,
      'Chief Nursing / Clinical Officer',
      "clinical staffing ratios, nurse retention, the impact of an unfilled clinical leadership role on bedside coverage, and quality/safety metrics. They live in clinical operations — frame the recruiting partner as someone who understands the difference between a nurse manager and a director of nursing.",
    ],
    [
      /chief\s+executive|\bceo\b|president\b/,
      'CEO / President',
      "strategic top-line risk: cost of vacancy on revenue, the signaling effect on remaining leadership, and the board-level perception of a long-open critical role. They want a partner who can close — not someone who'll send 30 résumés. Lead with the business impact of the gap, not the recruiting process.",
    ],
    [
      /chief\s+operating|\bcoo\b|chief\s+operations|vp\s+operations|vice\s+president\s+operations/,
      'COO / VP Operations',
      "operational throughput, productivity loss per day the role is unfilled, contract-labor burn rate, and the downstream effect on patient access / scheduling / billing. Quantify the daily cost of vacancy if you can. Frame the recruiter as a way to recover operational leverage.",
    ],
    [
      /chief\s+financial|\bcfo\b|vp\s+finance|controller\b/,
      'CFO / VP Finance',
      "the dollar cost of vacancy: contract labor premium, lost revenue, recruiter fee vs. continued vacancy spend, and ROI on a fast hire. They want numbers. If we have any kind of fee model that's outcome-based or capped, this is the persona to mention it to.",
    ],
    [
      /chief\s+human\s+resources|\bchro\b|vp\s+human\s+resources|svp\s+human\s+resources|vp\s+hr\b|head\s+of\s+(people|hr)/,
      'CHRO / VP HR',
      "time-to-fill benchmarks vs. industry, the strategic-vs-tactical mix of in-house TA work, and how a specialist partner reduces requisition-aging on the hardest roles. Speak as a strategic peer, not a vendor — they've been pitched a thousand times.",
    ],
    [
      /talent\s+acquisition|recruit(er|ing)|sourcing|head\s+of\s+talent/,
      'TA Lead / Recruiter',
      "fill rates on hard-to-fill clinical roles, no-poach safety, the partnership model (we work YOUR reqs, we don't compete for your candidates), and where specialist coverage actually moves the needle vs. their in-house team. Treat them as a peer — talk shop, not pitch.",
    ],
    [
      /chief\s+people|chief\s+of\s+staff|vp\s+people|head\s+of\s+people/,
      'Chief People Officer / Chief of Staff',
      "leadership pipeline health, retention of remaining executives during a vacancy, and the cultural cost of a prolonged search. They balance people strategy with operational execution — frame around both.",
    ],
    [
      /practice\s+administrator|director\s+of\s+operations|director\s+of\s+practice|administrator\b/,
      'Practice Administrator / Director of Operations',
      "schedule coverage, locum spend, RVU productivity, and the practical impact of an unfilled provider role on the day-to-day. They run the building — be concrete about what fixing the role unlocks.",
    ],
    [
      /director\s+of\s+(human\s+resources|hr|people|talent)/,
      'Director of HR / Talent',
      "requisition aging on niche roles, the in-house team's bandwidth, and what a specialist external partner adds without stepping on internal recruiters' lanes.",
    ],
    [
      /vp\s+clinical|vice\s+president\s+clinical|director\s+of\s+clinical/,
      'VP / Director Clinical',
      "clinical leadership pipeline, the scope/credentialing nuance of the open role, and the operational risk of leaving a clinical leadership seat empty under pressure.",
    ],
  ];
  for (const [re, bucket, framing] of rules) {
    if (re.test(t)) return { bucket, framing };
  }
  return null;
}

// Classify the OPEN ROLE (the job being filled) into a tier so the
// prompt can pick the right "what problem does this vacancy create?"
// framing. The model's default lean — drawn from generic recruiting
// prose — is to talk about leadership stability, board confidence,
// and team morale, which is wrong for a staff Hospice NP or a
// hospitalist line. This is a separate axis from the recipient
// classifier (which targets the person we're WRITING TO).
//
// Tiers:
//   - leadership   → C-suite, VP, Director-of-X, Chief-of-X, Medical
//                    Director, Practice Administrator, Manager,
//                    Supervisor, Head of X. Leadership-stability
//                    framing is appropriate.
//   - physician_staff → MD/DO / Hospitalist / Attending / "Physician"
//                       with no leadership prefix. Frame around
//                       patient panel coverage, RVU/productivity loss,
//                       schedule gaps.
//   - clinical_staff  → NP, PA, RN, LPN, CRNA, CNM. Frame around
//                       patient access, timely visits, panel coverage,
//                       coverage gaps for the existing team.
//   - allied_staff    → Therapists, technologists, MAs, pharmacists,
//                       social workers, etc. Frame around
//                       operational throughput in the relevant
//                       service line.
//   - other        → couldn't classify; fall back to a generic
//                    operational framing (no leadership-stability).
function classifyJobRoleTier(rawTitle: string): 'leadership' | 'physician_staff' | 'clinical_staff' | 'allied_staff' | 'other' {
  const t = rawTitle.toLowerCase();
  if (!t.trim()) return 'other';
  // ORDER MATTERS: leadership patterns first so a "Director of Nursing"
  // doesn't slip through into clinical_staff via the "nurse" trigger.
  // C-suite + executive credentials.
  if (/\b(cmo|cmio|ceo|cfo|coo|chro|cno|cio|cto|cco)\b/.test(t)) return 'leadership';
  if (/chief\s+(medical|nursing|operating|executive|financial|human|people|clinical|information|technology|marketing|legal|compliance|growth|strategy|administrative|of\s+staff)/.test(t)) return 'leadership';
  if (/\bv\.?\s?p\.?\b|\bsvp\b|\bevp\b|vice\s+president/.test(t)) return 'leadership';
  if (/(senior\s+)?vice\s+president/.test(t)) return 'leadership';
  // Director / Head / Chief titles.
  if (/medical\s+director|clinical\s+director|nursing\s+director|executive\s+director/.test(t)) return 'leadership';
  if (/director\s+of\b/.test(t)) return 'leadership';
  if (/\bdirector,\s+\w+/.test(t)) return 'leadership';
  if (/head\s+of\b/.test(t)) return 'leadership';
  if (/chair(person|man|woman)?\s+of\b|department\s+chair/.test(t)) return 'leadership';
  if (/chief\s+of\s+(staff|medicine|surgery|pediatrics|cardiology|oncology|psychiatry|radiology|anesthesiology|emergency)/.test(t)) return 'leadership';
  // Mid-tier leadership / operations.
  if (/\bpresident\b/.test(t)) return 'leadership';
  if (/practice\s+(administrator|manager)|\badministrator\b/.test(t)) return 'leadership';
  if (/\bmanager\b/.test(t)) return 'leadership';
  if (/\bsupervisor\b/.test(t)) return 'leadership';
  // "Lead Nurse" / "Lead NP" are clinical, not leadership. Use a
  // negative lookahead so plain "Lead" still trips leadership tier.
  if (/\blead\b(?!\s*(nurse|np|pa|physician|technician|technologist|therapist|coordinator))/.test(t)) return 'leadership';

  // Physician staff — MD/DO line clinicians (hospitalist, attending,
  // generalist physician roles). Catches "Family Medicine Physician",
  // "Internal Medicine Physician", "Hospitalist", "Attending",
  // explicit MD/DO credentials.
  if (/\b(hospitalist|attending|intensivist|laborist|nocturnist|proceduralist|anesthesiologist|radiologist|pathologist|pediatrician|geriatrician|psychiatrist|cardiologist|oncologist|surgeon)\b/.test(t)) return 'physician_staff';
  if (/\b(physician|m\.?d\.?|d\.?o\.?)\b/.test(t) && !/assistant/.test(t)) return 'physician_staff';

  // Advanced-practice + RN-line clinical staff.
  if (/nurse\s+practitioner|\bnp\b|np\/pa|\bcrna\b|\bcnm\b|\bcns\b/.test(t)) return 'clinical_staff';
  if (/physician\s+assistant|\bpa-?c\b|\bpa\b(?!\w)/.test(t)) return 'clinical_staff';
  if (/registered\s+nurse|\brn\b(?!\w)|\blpn\b|\bcma\b|\bcna\b/.test(t)) return 'clinical_staff';

  // Allied health staff.
  if (/therap(ist|y)|technologist|technician|medical\s+assistant|\bma\b(?!\w)|pharmacist|dietitian|nutritionist|psychologist|social\s+worker|\bswcm\b|case\s+manager|care\s+manager|navigator/.test(t)) return 'allied_staff';

  return 'other';
}

// True when the recipient's title indicates an MD / DO physician,
// who should be addressed as "Dr. {last_name}" rather than by first
// name. Healthcare-specific: a Chief Medical Officer / Medical
// Director almost always holds an MD; an RN, NP, or PharmD does
// not, by convention.
function isPhysicianTitle(rawTitle: string): boolean {
  const t = rawTitle.toLowerCase();
  if (!t.trim()) return false;
  // Explicit credentials.
  if (/\b(m\.?\s?d\.?|d\.?\s?o\.?)\b/.test(t)) return true;
  if (/\bphysician\b/.test(t)) return true;
  if (/\b(dr\.?|doctor)\b/.test(t)) return true;
  // Clinical-leadership titles that almost always require MD/DO.
  if (/chief\s+medical\s+(officer|information\s+officer)/.test(t)) return true;
  if (/\bcmo\b|\bcmio\b/.test(t)) return true;
  if (/medical\s+director/.test(t)) return true;
  if (/\bhospitalist\b/.test(t)) return true;
  if (/\battending\b/.test(t)) return true;
  if (/(chair(person)?|chairman|chief)\s+of\s+(medicine|surgery|pediatrics|cardiology|oncology|psychiatry|radiology|anesthesiology|neurology|emergency\s+medicine|family\s+medicine|internal\s+medicine|obstetrics|gynecology)/.test(t)) return true;
  if (/director\s+of\s+(medicine|surgery|pediatrics|cardiology|oncology|psychiatry|radiology|anesthesiology|neurology|emergency\s+medicine)/.test(t)) return true;
  return false;
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

function buildPrompt(job: JobContext, f: FormInputs, sender: SenderIdentity, recipient: RecipientIdentity): string {
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

  // Classify the OPEN ROLE so the framing matches its tier. A staff
  // Hospice NP doesn't generate "board confidence" or "leadership
  // stability" problems — it generates patient-access and panel-
  // coverage problems. Without this, the model defaults to executive-
  // search prose for every role.
  const roleTier = jobTitle ? classifyJobRoleTier(jobTitle) : 'other';
  const roleTierFraming: Record<typeof roleTier, string> = {
    leadership:
      'OPEN ROLE TIER: this is a LEADERSHIP / executive role. Leadership-stability framing is appropriate. Lead with the strategic / continuity problem the vacancy creates — credibility with the board and remaining executives, signaling to the broader team, retention risk among reports, cultural cost of a prolonged search, and the operational risk of leaving a leadership seat empty under pressure. Use language like "leadership stability", "executive continuity", "succession", "board-level visibility" as appropriate to the title.',
    physician_staff:
      'OPEN ROLE TIER: this is a STAFF PHYSICIAN role (NOT leadership). Frame the unfilled-role problem in OPERATIONAL / clinical-production terms: patient panel coverage, RVU and productivity loss per day of vacancy, schedule gaps, locum/contract-labor burn while the role sits open, access-to-care impact for patients, and the load redistributed onto remaining clinicians. Concrete daily-cost language wins.',
    clinical_staff:
      'OPEN ROLE TIER: this is a STAFF CLINICAL role — NP, PA, RN, etc. (NOT leadership). Frame the unfilled-role problem in OPERATIONAL / patient-access terms: making sure patients get seen in a timely way, panel coverage for the existing physicians, visit volume and throughput, the load redistributed onto the rest of the clinical team, and missed visits or longer wait times when the role is empty. For hospice / home-health / SNF contexts, emphasize timely patient visits and continuity of care.',
    allied_staff:
      'OPEN ROLE TIER: this is an ALLIED-HEALTH STAFF role — therapist, technologist, MA, social worker, case manager, etc. (NOT leadership). Frame the unfilled-role problem in OPERATIONAL / throughput terms specific to the service line: scheduling bottlenecks, throughput in the relevant department, the impact on the clinicians whose work depends on this role, and the daily cost of leaving the position vacant.',
    other:
      'OPEN ROLE TIER: unclassified. Default to OPERATIONAL framing — what daily work is not getting done while this role is vacant, and what that costs the organization. Avoid leadership-stability language unless the title itself is clearly executive.',
  };

  const constraints: string[] = [
    'Reference the company and the open role specifically — no mass-email language.',
    `Target the actual needs of a ${audience}; a clinical leader has different priorities than HR or TA.`,
    'Identify the likely business problem the open role creates, and explain why it matters now.',
    roleTierFraming[roleTier],
    // Negative constraint: keep leadership-stability prose contained
    // to actual leadership roles. The model's default lean is to
    // sprinkle "board confidence", "team morale", "remaining leaders"
    // across every script regardless of the role's tier.
    roleTier === 'leadership'
      ? 'Leadership-stability language is allowed for this role.'
      : 'DO NOT write about "leadership stability", "board confidence", "team morale", "remaining leadership", "executive continuity", "credibility with the board", or similar leadership-framing phrases. This is NOT a leadership role. Speculating about board dynamics or team morale you cannot know about will come across as out-of-touch. Stay in operational/clinical-production territory.',
    'Position MedCentric as a specialized healthcare recruiting partner — not a generic staffing agency.',
    `Emphasize this proof point: ${proof}.`,
    `End with this call to action, kept low-friction: ${cta}.`,
    // Graceful-redirect ask — cold outreach hits the wrong person
    // routinely, and giving them an easy "not me, but here's who"
    // path tends to produce a referral instead of a non-reply. ONE
    // short line, after the CTA, before the signoff. Phrasing must
    // be deferential, not transactional ("grateful", "appreciate",
    // never "please forward this").
    'GRACEFUL REDIRECT: the cold call, email body, AND LinkedIn message must each include one short, polite line offering an out for the wrong-person case — e.g. "If you\'re not the right person to speak with about this, I\'d be grateful if you could point me in the right direction." Apply per format: cold call → one spoken sentence after the CTA; email body → one line above the signature; LinkedIn message → one short line after the CTA. Vary the wording across the three so it doesn\'t feel boilerplate. Never use language that suggests we\'ll forward to them again or follow up on the referral chain — the ask ends with them naming someone. DO NOT include the redirect line in the follow-up email body — by the second touch the recipient has already had the chance to redirect us; repeating the ask there reads as templated.',
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
      `POSTING URL: the posting URL is ${jobUrl}. The email body and the follow-up email body MUST NOT contain the URL — the email is rendered as HTML and the recipient's client will turn the role title (${jobTitle || 'the role'}) into a clickable hyperlink to this URL. Just write the title in plain prose. Include the raw URL in the LinkedIn message body on its own line near the opener (LinkedIn doesn't render HTML links). Never include the URL in the cold call (spoken).`
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

  // Recipient role-specific framing. The substring classifier maps a
  // raw title (e.g. "Chief Medical Officer", "VP, Talent Acquisition")
  // to a "what this persona cares about" cue so each output speaks
  // directly to the priorities of the role on the other end. Falls
  // back to the generic audience bucket when nothing matches.
  const recipientFirst = val(recipient.first_name);
  const recipientLast  = val(recipient.last_name);
  const recipientName  = [recipientFirst, recipientLast].filter(Boolean).join(' ');
  const recipientTitle = val(recipient.title);
  const recipientClass = recipientTitle ? classifyRecipient(recipientTitle) : null;
  // Detect MD/DO physicians by title so we can address them
  // formally ("Dr. Smith") instead of by first name. Falls back to
  // first-name when the contact has no last name on file (rare,
  // but the alternative — "Dr." with nothing after — would look
  // broken).
  const recipientIsPhysician = recipientTitle ? isPhysicianTitle(recipientTitle) : false;
  const useDoctor = recipientIsPhysician && !!recipientLast;
  const greeting = useDoctor
    ? `Dr. ${recipientLast}`
    : (recipientFirst || '');
  const recipientBlock = (recipientTitle || recipientFirst)
    ? `RECIPIENT FRAMING — every output is for ONE specific person, not a generic audience.
  - Recipient: ${recipientName || '(name not on file)'}${recipientTitle ? ` — ${recipientTitle}` : ''}
${recipientClass
        ? `  - Persona bucket: ${recipientClass.bucket}
  - What they care about: ${recipientClass.framing}
  - The problem statement, the proof point, and the CTA must all be framed around the recipient's perspective. A ${recipientClass.bucket} hears a different argument than a recruiter — write the version this specific recipient would respond to.`
        : recipientTitle
          ? `  - This title didn't match any pre-built persona. Infer the recipient's likely priorities from the title alone and tailor the problem statement / proof point / CTA accordingly.`
          : `  - No title on file — keep the framing generic but address the recipient by name and write to one person, not a group.`}

HARD RULES for addressing the recipient (every output must satisfy):
${greeting && useDoctor
        ? `  R1. The cold call MUST open by addressing the recipient as a physician: "Hi ${greeting}, this is ${senderName}${senderTitle ? `, ${senderTitle}` : ''} from ${senderCompany}." Use "${greeting}" verbatim — never the first name, never "Mr."/"Ms.".
  R2. The email body MUST start with "${greeting}," on its own line, then a blank line, then the role-reference opener. No "Dear", no first-name greeting, no group salutations.
  R3. The follow-up email body MUST start with "${greeting}," on its own line, then a blank line, then the follow-up bump.
  R4. The LinkedIn message MUST start with "${greeting}," and read like a 1:1 note to a physician peer, not a broadcast.
  R5. Throughout the body, when re-addressing or referring to the recipient by name, use "${greeting}" — never their first name. Use second-person singular ("you", "your team"), never "you all" or group phrasing.
  R6. Recognize that the recipient is a physician — adjust tone to match (peer-to-peer, clinical respect, never overly familiar).`
        : greeting
          ? `  R1. The cold call MUST open by addressing the recipient: "${greeting}, this is ${senderName}${senderTitle ? `, ${senderTitle}` : ''} from ${senderCompany}." — use the first name directly, NO "Hi"/"Hello"/"Hey" prefix. Combine with the sender-identity rule above.
  R2. The email body MUST start with "${greeting}," on its own line (the first name alone, NO "Hi"/"Hello"/"Hey"/"Dear" prefix), then a blank line, then the role-reference opener. No group salutations.
  R3. The follow-up email body MUST start with "${greeting}," on its own line (the first name alone, NO "Hi"/"Hello"/"Hey" prefix), then a blank line, then the follow-up bump.
  R4. The LinkedIn message MUST start with "${greeting}," (the first name alone, NO "Hi"/"Hello"/"Hey" prefix) and read like a 1:1 note, not a broadcast.
  R5. Use second-person singular throughout ("you", "your team") — never "you all", "your team(s)", or anything that implies a group recipient.`
          : `  R1. With no name on file, open every output with "Hi there," (singular, not "Hi all").
  R2. Use second-person singular throughout — never "you all" or anything that implies a group recipient.
  R3. The cold-call sender-identity rule still applies.`}
`
    : '';

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
${recipientBlock}
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
    "body": "string — 5-9 short lines. First line MUST be the recipient greeting per the RECIPIENT FRAMING rules above (for non-physicians: '{first_name},' on its own line — first name alone, NO 'Hi'/'Hello'/'Dear' prefix; for physicians: 'Dr. {last_name},'). Blank line, then the role-reference opener. Then problem statement, why-it-matters, solution + proof point, CTA. Do NOT include the posting URL anywhere in the body — the client will hyperlink the role title to it."
  },
  "linkedin": "string — 4-7 short lines, more casual than the email. Open per the RECIPIENT FRAMING rules (non-physicians: '{first_name},' — first name alone, NO 'Hi' prefix; physicians: 'Dr. {last_name},'). Name the role verbatim in the first or second sentence. If a posting URL was provided, include it on its own line near the opener (LinkedIn doesn't render HTML hyperlinks).",
  "followUpEmail": {
    "subject": "string — short, references that this is a follow-up. Examples: 'Following up on the {role} search', 'Re: {Company} {role}'. Avoid 'Just checking in'.",
    "body": "string — 4-6 short lines. First line MUST be the recipient greeting per the RECIPIENT FRAMING rules (non-physicians: '{first_name},' on its own line — first name alone, NO 'Hi' prefix; physicians: 'Dr. {last_name},'). Blank line, then the follow-up bump that names the role verbatim. Then one line restating the specific problem the open role likely creates, one line reaffirming the proof point, and the same CTA. Do NOT include the posting URL — the client will hyperlink the role title to it. Tone is patient, not pushy."
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
    const recipient: RecipientIdentity = body.recipient || {};

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildPrompt(job, inputs, sender, recipient);

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
            // v4: bumped 2500 → 3500 after the prompt grew with
            // recipient persona framing + posting URL rules; the model
            // was finishing the coldCall and stopping early under
            // json_object mode (finish_reason='stop' with linkedin /
            // followUpEmail still empty). Strict json_schema below
            // forces all four keys to be populated, which fixes the
            // structural failure; the bigger token budget keeps
            // generation comfortable.
            max_tokens: 3500,
            temperature: 0.7,
            // Strict structured output. The schema lists all four
            // top-level keys as required and the model is required to
            // emit each one with non-empty content. Replaces the
            // softer json_object mode that let the model close the
            // brace with empty strings.
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'outreach_script',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['coldCall', 'email', 'linkedin', 'followUpEmail'],
                  properties: {
                    coldCall: { type: 'string' },
                    email: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['subject', 'body'],
                      properties: {
                        subject: { type: 'string' },
                        body:    { type: 'string' },
                      },
                    },
                    linkedin: { type: 'string' },
                    followUpEmail: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['subject', 'body'],
                      properties: {
                        subject: { type: 'string' },
                        body:    { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
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
