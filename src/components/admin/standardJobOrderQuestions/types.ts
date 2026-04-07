export interface QuestionSection {
  key: string;
  title: string;
  description: string;
  questions: string[];
}

export const DEFAULT_SECTIONS: QuestionSection[] = [
  {
    key: 'timing',
    title: '1. Questions About Timing and Urgency',
    description: 'Questions to understand the hiring timeline and urgency',
    questions: [
      'What is the target start date, and what happens if the hire is delayed?',
      'Where are you in the hiring process now, and what challenges have you faced so far?',
      'What is driving the urgency to fill this role?',
      'Who is covering the work currently, and how is that affecting the organization?',
      'What does your candidate pipeline look like (resources used, people interviewed, viability, and any declined offers)?'
    ]
  },
  {
    key: 'job',
    title: '2. Questions About the Job',
    description: 'Questions about job responsibilities, requirements, and qualifications',
    questions: [
      "Is there mandatory overtime or 'On-Call' Hours? If so, what does it look like?",
      'What is the title of the position?',
      'What are the primary responsibilities?',
      'What is the schedule for this role?',
      'Is this a remote, hybrid, or onsite position?',
      'What qualifications are preferred?',
      'What is the compensation structure?',
      'Are there travel requirements?',
      'How many direct reports (if any)?',
      'What state license(s) are required, and will you consider candidates with licenses in process?',
      'Is board certification required or preferred, and in which specialty?',
      'Are DEA, CSR, or other controlled-substance registrations required?',
      'What is the minimum education level needed for this role?',
      'Are there required or preferred training pathways (residency, fellowship, specialty program)?',
      'How many years of relevant experience are required or preferred?',
      'Which clinical settings must candidates have experience in (hospital, clinic, SNF, home health, private practice, etc.)?',
      'Is experience with any specific patient population required (pediatric, geriatric, medically complex, behavioral health, etc.)?',
      'Is supervisory or leadership experience required or preferred?',
      'Are there required EMR/EHR systems candidates must know?',
      'Are there specific clinical skills or procedures candidates must be able to perform?',
      'What background checks are required (state, FBI, OIG, references)?',
      'Are there immunization or health screening requirements (vaccines, TB, titers)?',
      'What malpractice history is acceptable for this role?'
    ]
  }
];
