import { QuestionSection } from './types';

export const COMPANY_SECTION: QuestionSection = {
  key: 'company',
  title: '3. Questions About the Company',
  description: 'Questions about the organization and culture',
  questions: [
    'What is the size and scope of the organization?',
    'What services or specialties does the organization provide?',
    "What is the company's mission or core values?",
    'What makes the organization unique or attractive to candidates?',
    'Are there any growth plans or recent milestones to share?'
  ]
};

export const HIRING_SECTION: QuestionSection = {
  key: 'hiring',
  title: '4. Questions About the Hiring Process',
  description: 'Questions about the interview and decision-making process',
  questions: [
    'What is the hiring timeline?',
    'What are the interview stages?',
    'Who will be involved in the interview process (names and titles)?',
    'How will interviews be conducted (e.g., phone, video, in-person)?',
    'Who is the final decision maker?'
  ]
};
