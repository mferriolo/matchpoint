// Import all question sets
import { nursingQuestions } from './nursingQuestions';
import { alliedHealthQuestions } from './alliedHealthQuestions';
import { behavioralHealthQuestions } from './behavioralHealthQuestions';
import { additionalBehavioralHealthQuestions } from './additionalBehavioralHealthQuestions';
import { administrativeQuestions } from './administrativeQuestions';
import { additionalAdministrativeQuestions } from './additionalAdministrativeQuestions';
import { managementQuestions } from './managementQuestions';
import { additionalManagementQuestions } from './additionalManagementQuestions';
import { publicHealthQuestions } from './publicHealthQuestions';
import { healthcareInformaticsQuestions } from './healthcareInformaticsQuestions';
import { corporateLeadershipQuestions } from './corporateLeadershipQuestions';
import { additionalCorporateLeadershipQuestions } from './additionalCorporateLeadershipQuestions';

// Combine all predefined questions
export const predefinedQuestions = {
  ...nursingQuestions,
  ...alliedHealthQuestions,
  ...behavioralHealthQuestions,
  ...additionalBehavioralHealthQuestions,
  ...administrativeQuestions,
  ...additionalAdministrativeQuestions,
  ...managementQuestions,
  ...additionalManagementQuestions,
  ...publicHealthQuestions,
  ...healthcareInformaticsQuestions,
  ...corporateLeadershipQuestions,
  ...additionalCorporateLeadershipQuestions,
  'Administrative Executive': [
    "How do you evaluate and align departmental performance metrics with broader strategic goals?",
    "Tell me about a time when you managed a crisis or significant disruption—what was your leadership approach?",
    "Describe how you led a cross-functional team through an operational transformation—what were the key outcomes?",
    "How do you tailor your leadership communication when working with clinical versus administrative stakeholders?",
    "What is your approach to maintaining mission alignment and financial discipline in resource-constrained environments?"
  ],
  'Advanced Practitioner (NP/PA)': [
    "Describe how you manage patient panels independently while collaborating with physicians for complex cases.",
    "Tell me about a time you identified a clinical red flag during a routine visit—what actions did you take and what was the outcome?",
    "How do you navigate scope-of-practice limitations across different states or within varied health systems?",
    "What's your approach to balancing clinical productivity with thorough patient education?",
    "How do you participate in interdisciplinary care planning, particularly for patients with multiple comorbidities?"
  ],
  'Physician': [
    "How have you used quality metrics such as HEDIS, STAR, or MIPS to inform and improve your practice?",
    "Tell me about a time you adjusted a treatment plan based on social determinants of health—what factors influenced your decision?",
    "How do you balance evidence-based protocols with patient preferences when they are in conflict?",
    "What is your philosophy on panel size management, and how does that affect your workflow and patient relationships?",
    "How do you coordinate care transitions for high-risk patients across multiple specialties or facilities?"
  ],
  'Physician Executive': [
    "What percentage of your current role is administrative versus clinical, and how do you balance both effectively?",
    "Describe how your clinical background informs your leadership decisions, especially during operational restructuring.",
    "Tell me about an initiative you led to improve physician engagement or reduce burnout—what impact did it have?",
    "How do you evaluate physician performance beyond productivity—what metrics matter most to you?",
    "Explain a time when you had to mediate between administrative goals and physician autonomy—how did you resolve it?"
  ]
};