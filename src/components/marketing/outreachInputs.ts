// Shared option lists, types, and defaults for the script-generator
// form. Used by both OutreachWorkspace (per-job customization panel)
// and BatchOutreachFlow (per-row Customize dialog in the queue).
// Lives in its own file so the two components share one source of
// truth for the option enums — keeps the dropdowns from drifting.

export const AUDIENCE_OPTIONS = [
  'CEO / Founder',
  'COO / Chief of Operations',
  'Chief Medical Officer',
  'VP of Clinical Operations',
  'Head of Talent Acquisition',
  'Recruiting Manager',
  'Practice Administrator',
  'Regional Medical Director',
  'Private Equity Operating Partner',
  'Other',
];

export const PROBLEM_OPTIONS = [
  'Role has likely been open too long',
  'Internal recruiting team may be overwhelmed',
  'Hard-to-find passive candidate market',
  'Growth may be delayed by this open role',
  'Clinical leadership gap',
  'Bad hire risk is high',
  'Geographic market is difficult',
  'Specialty or model-specific experience is hard to find',
  'Other',
];

export const SERVICE_OPTIONS = [
  'Direct hire contingency search',
  'Retained executive search',
  'RPO / embedded recruiting support',
  'Market mapping',
  'Hard-to-fill provider search',
  'Clinical leadership search',
  'Other',
];

export const URGENCY_OPTIONS = ['Low urgency', 'Moderate urgency', 'High urgency', 'Very high urgency', 'Unknown'];

export const TONE_OPTIONS = [
  'Direct and bold',
  'Warm and consultative',
  'Executive and polished',
  'Scrappy and entrepreneurial',
  'Mission-driven healthcare',
  'MedCentric-branded professional tone',
];

export const PROOF_OPTIONS = [
  'Experience recruiting clinicians and clinical leaders',
  'Experience with value-based care organizations',
  'Experience with PACE / frail elderly care',
  'Experience helping startups build clinical teams',
  'Ability to access passive candidates',
  'Ability to support hard-to-fill searches',
  'Speed and focus compared with internal recruiting teams',
  'Other',
];

export const CTA_OPTIONS = [
  'Schedule a 15-minute introductory call',
  'Set up a job intake conversation',
  'Discuss the open role',
  'Review our search process',
  'Explore a recruiting partnership',
  'Permission to send qualified candidates',
  'Other',
];

export const OBJECTION_OPTIONS = [
  'We already have an internal recruiting team',
  'We are not using agencies right now',
  'We already have vendors',
  'Send me information',
  'We are not hiring right now',
  'Your fee is too high',
  'We tried recruiters before and it did not work',
  'We only work retained',
  'We only work contingency',
  'Budget is tight',
];

/** The shape sent as the `inputs` payload to the generate-job-script
 *  edge function. Mirrors FormInputs inside the edge function (kept
 *  in lockstep manually — refactor candidate for a shared types
 *  package). */
export interface OutreachFormInputs {
  audience: string;
  audienceOther: string;
  problem: string;
  problemOther: string;
  service: string;
  serviceOther: string;
  companyType: string;
  roleCategory: string;
  urgency: string;
  tone: string;
  proof: string;
  proofOther: string;
  cta: string;
  ctaOther: string;
  objections: string[];
  customOpener: string;
  specificPain: string;
  companyInsight: string;
  hiringManagerName: string;
  caseStudy: string;
  notes: string;
  avoidLanguage: string;
}

/** Defaults used by the batch flow when no per-row Customize has been
 *  applied. companyType / roleCategory are filled in by the caller
 *  from the job record. */
export function defaultOutreachInputs(): OutreachFormInputs {
  return {
    audience: 'Hiring decision-maker',
    audienceOther: '',
    problem: 'Role has likely been open too long',
    problemOther: '',
    service: 'Direct hire contingency search',
    serviceOther: '',
    companyType: '',
    roleCategory: '',
    urgency: 'High urgency',
    tone: 'MedCentric-branded professional tone',
    proof: 'Experience recruiting clinicians and clinical leaders',
    proofOther: '',
    cta: 'Schedule a 15-minute introductory call',
    ctaOther: '',
    objections: [],
    customOpener: '',
    specificPain: '',
    companyInsight: '',
    hiringManagerName: '',
    caseStudy: '',
    notes: '',
    avoidLanguage: '',
  };
}
