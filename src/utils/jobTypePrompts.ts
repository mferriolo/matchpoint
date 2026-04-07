import { JobType, CallType } from '@/types/callprompt';
import { pharmacistsQuestions } from './pharmacistsQuestions';
import { physicianSpecialistQuestions } from './physicianSpecialistQuestions';
import { audiologistsQuestions } from './audiologistsQuestions';
import { behavioralHealthTechniciansQuestions } from './behavioralHealthTechniciansQuestions';
import { careCoordinatorsQuestions } from './careCoordinatorsQuestions';
import { clinicManagersQuestions } from './clinicManagersQuestions';
import { clinicalSystemsAnalystsQuestions } from './clinicalSystemsAnalystsQuestions';
import { communityHealthWorkersQuestions } from './communityHealthWorkersQuestions';
import { dietitiansNutritionistsQuestions } from './dietitiansNutritionistsQuestions';
import { emrSpecialistsQuestions } from './emrSpecialistsQuestions';
import { epidemiologistsQuestions } from './epidemiologistsQuestions';
import { geneticCounselorsQuestions } from './geneticCounselorsQuestions';
import { healthEducatorsQuestions } from './healthEducatorsQuestions';
import { healthInformaticsSpecialistsQuestions } from './healthInformaticsSpecialistsQuestions';
import { healthInformationTechniciansQuestions } from './healthInformationTechniciansQuestions';
import { hospitalAdministratorsQuestions } from './hospitalAdministratorsQuestions';
import { infectionControlSpecialistsQuestions } from './infectionControlSpecialistsQuestions';
import { physicalTherapistsQuestions } from './physicalTherapistsQuestions';
import { occupationalTherapistsQuestions } from './occupationalTherapistsQuestions';
import { speechLanguagePathologistsQuestions } from './speechLanguagePathologistsQuestions';
import { respiratoryTherapistsQuestions } from './respiratoryTherapistsQuestions';
import { radiologicTechnologistsQuestions } from './radiologicTechnologistsQuestions';
import { ultrasoundTechnologistsQuestions } from './ultrasoundTechnologistsQuestions';
import { medicalLaboratoryTechnologistsQuestions } from './medicalLaboratoryTechnologistsQuestions';
import { socialWorkersQuestions } from './socialWorkersQuestions';
import { psychiatristsQuestions } from './psychiatristsQuestions';
import { psychologistsQuestions } from './psychologistsQuestions';
import { licensedClinicalSocialWorkersQuestions } from './licensedClinicalSocialWorkersQuestions';
import { marriageFamilyTherapistsQuestions } from './marriageFamilyTherapistsQuestions';
import { licensedProfessionalCounselorsQuestions } from './licensedProfessionalCounselorsQuestions';
import { substanceAbuseCounselorsQuestions } from './substanceAbuseCounselorsQuestions';
import { medicalReceptionistsQuestions } from './medicalReceptionistsQuestions';
import { medicalCodersAndBillersQuestions } from './medicalCodersAndBillersQuestions';
import { medicalRecordsClerksQuestions } from './medicalRecordsClerksQuestions';
import { patientServiceRepresentativesQuestions } from './patientServiceRepresentativesQuestions';
import { medicalTranscriptionistsQuestions } from './medicalTranscriptionistsQuestions';
import { practiceAdministratorsQuestions } from './practiceAdministratorsQuestions';
import { programDirectorsQuestions } from './programDirectorsQuestions';
import { qualityImprovementManagersQuestions } from './qualityImprovementManagersQuestions';
import { publicHealthNursesQuestions } from './publicHealthNursesQuestions';
import { telehealthCoordinatorsQuestions } from './telehealthCoordinatorsQuestions';
import { medicalDeviceTechniciansQuestions } from './medicalDeviceTechniciansQuestions';

interface JobTypePrompts {
  questions: string[];
  sellingPoints: string[];
  objections: string[];
}

interface CallTypePrompts {
  questions: string[];
  checklist: string[];
}

// Predefined questions mapping - ensure exact key matching with JobTypeManagement
export const PREDEFINED_QUESTIONS: Record<string, string[]> = {
  'Pharmacists': pharmacistsQuestions,
  'Physician (Specialists)': physicianSpecialistQuestions,
  'Audiologists': audiologistsQuestions,
  'Behavioral Health Technicians': behavioralHealthTechniciansQuestions,
  'Care Coordinators': careCoordinatorsQuestions,
  'Clinic Managers': clinicManagersQuestions,
  'Clinical Systems Analysts': clinicalSystemsAnalystsQuestions,
  'Community Health Workers': communityHealthWorkersQuestions,
  'Dietitians/Nutritionists': dietitiansNutritionistsQuestions,
  'Electronic Medical Records (EMR) Specialists': emrSpecialistsQuestions,
  'Epidemiologists': epidemiologistsQuestions,
  'Genetic Counselors': geneticCounselorsQuestions,
  'Health Educators': healthEducatorsQuestions,
  'Health Informatics Specialists': healthInformaticsSpecialistsQuestions,
  'Health Information Technicians': healthInformationTechniciansQuestions,
  'Hospital Administrators': hospitalAdministratorsQuestions,
  'Infection Control Specialists': infectionControlSpecialistsQuestions,
  'Physical Therapists (PTs)': physicalTherapistsQuestions,
  'Occupational Therapists (OTs)': occupationalTherapistsQuestions,
  'Speech-Language Pathologists (SLPs)': speechLanguagePathologistsQuestions,
  'Respiratory Therapists': respiratoryTherapistsQuestions,
  'Radiologic Technologists': radiologicTechnologistsQuestions,
  'Ultrasound Technologists': ultrasoundTechnologistsQuestions,
  'Medical Laboratory Technologists': medicalLaboratoryTechnologistsQuestions,
  'Social Workers (LCSW, MSW)': socialWorkersQuestions,
  'Psychiatrists': psychiatristsQuestions,
  'Psychologists': psychologistsQuestions,
  'Licensed Clinical Social Workers (LCSWs)': licensedClinicalSocialWorkersQuestions,
  'Marriage and Family Therapists (MFTs)': marriageFamilyTherapistsQuestions,
  'Licensed Professional Counselors (LPCs)': licensedProfessionalCounselorsQuestions,
  'Substance Abuse Counselors': substanceAbuseCounselorsQuestions,
  'Medical Receptionists': medicalReceptionistsQuestions,
  'Medical Coders and Billers': medicalCodersAndBillersQuestions,
  'Medical Records Clerks': medicalRecordsClerksQuestions,
  'Patient Service Representatives': patientServiceRepresentativesQuestions,
  'Medical Transcriptionists': medicalTranscriptionistsQuestions,
  'Practice Administrators': practiceAdministratorsQuestions,
  'Program Directors': programDirectorsQuestions,
  'Quality Improvement Managers': qualityImprovementManagersQuestions,
  'Public Health Nurses': publicHealthNursesQuestions,
  'Telehealth Coordinators': telehealthCoordinatorsQuestions,
  'Medical Device Technicians': medicalDeviceTechniciansQuestions,
};

// Universal questions asked for ALL job types
export const getJobTypePrompts = (jobType: JobType): JobTypePrompts => {
  // Only return prompts for active job types
  const activeJobTypes = ['Physician', 'Advanced Practitioner (NP/PA)', 'Physician Executive', 'Administrative Executive'];
  
  if (!activeJobTypes.includes(jobType)) {
    return {
      questions: ['Tell me about your background and experience'],
      sellingPoints: ['Great opportunity for career growth'],
      objections: ['Address any concerns you may have']
    };
  }

  switch (jobType) {
    case 'Physician':
      return {
        questions: [
          'Why did you become a Physician?',
          'What is your medical specialty, and are you fellowship-trained?',
          'In which states are you currently licensed, and are you willing to obtain additional licenses?',
          'How many patients do you typically see per day/week?',
          'Do you have experience with hospital-based care, outpatient practice, or both?',
          'Are you comfortable participating in call rotation? If yes, how often?',
          'What EMR systems have you used?',
          'Do you have experience with teaching, research, or clinical trials?',
          'Are you board-certified or board-eligible?',
          'Have you ever held leadership or committee roles within a healthcare organization?',
          'What is your preferred practice setting (academic, private, hospital-employed, etc.)?'
        ],
        sellingPoints: [
          'Competitive compensation with productivity bonuses',
          'Excellent work-life balance with flexible scheduling',
          'State-of-the-art medical facilities and equipment',
          'Strong support staff and collaborative environment',
          'Continuing education and conference allowances'
        ],
        objections: [
          'Concerned about call schedule → We offer flexible call rotations',
          'Worried about patient volume → We maintain reasonable patient loads',
          'EMR concerns → We provide comprehensive training and support',
          'Location concerns → Highlight community benefits and lifestyle'
        ]
      };

    case 'Advanced Practitioner (NP/PA)':
      return {
        questions: [
          'Why did you become an Advanced Practitioner (NP/PA)?',
          'In which states are you licensed to practice, and do you have DEA registration?',
          'What is your average patient load per day?',
          'Do you have experience working autonomously, or under physician supervision?',
          'Have you worked in primary care, urgent care, or specialty practice settings?',
          'Are you experienced in prescribing controlled substances?',
          'What procedures are you trained and credentialed to perform?',
          'What EMR systems have you used?',
          'Have you precepted NP students or participated in training programs?',
          'Are you open to working evenings, weekends, or on-call?'
        ],
        sellingPoints: [
          'Autonomy in clinical decision-making',
          'Competitive salary with excellent benefits',
          'Collaborative physician relationships',
          'Professional development opportunities',
          'Flexible scheduling options'
        ],
        objections: [
          'Scope of practice concerns → Explain state regulations and support',
          'Salary expectations → Highlight total compensation package',
          'Autonomy concerns → Describe collaborative but independent model'
        ]
      };

    case 'Physician Executive':
      return {
        questions: [
          'Why did you become a Physician Executive?',
          'What is your current role and scope of responsibility?',
          'What percentage of your time is currently spent on administrative vs. clinical duties?',
          'Do you prefer to maintain a clinical component in your next role? If yes, what percentage?',
          'What leadership initiatives or programs have you implemented successfully?',
          'What is your experience managing budgets, staffing, and strategic planning?',
          'Have you led clinical quality improvement or patient safety programs?',
          'How do you approach physician engagement and retention?',
          'What is your experience with value-based care or population health management?',
          'Are you involved in community outreach or advocacy initiatives?',
          'Have you managed multi-site or multi-specialty service lines?'
        ],
        sellingPoints: [
          'Executive compensation package with equity options',
          'Opportunity to shape healthcare delivery',
          'Access to C-suite and board interactions',
          'Professional development and executive mentoring',
          'Significant decision-making authority'
        ],
        objections: [
          'Compensation concerns → Highlight total executive package',
          'Work-life balance → Discuss executive support and delegation',
          'Clinical time → Explain balance of clinical and administrative duties'
        ]
      };

    case 'Administrative Executive':
      return {
        questions: [
          'Why did you become an Administrative Executive?',
          'What is your current role and scope of responsibility?',
          'What size budget have you managed, and for how many years?',
          'How many direct reports and total staff do you oversee?',
          'What measurable results have you achieved in your leadership role?',
          'What is your experience with strategic planning and organizational growth?',
          'Have you worked in a healthcare-specific executive role, and if so, in what capacity?',
          'What is your experience with regulatory compliance and accreditation processes?',
          'How do you approach stakeholder communication and engagement?',
          'Have you led large-scale change management or transformation initiatives?',
          'What is your experience with mergers, acquisitions, or partnerships?'
        ],
        sellingPoints: [
          'Executive-level compensation and benefits',
          'Opportunity to drive organizational transformation',
          'Access to senior leadership team',
          'Professional development opportunities',
          'Significant impact on patient care delivery'
        ],
        objections: [
          'Regulatory complexity → Highlight compliance support team',
          'Change management challenges → Discuss organizational support',
          'Work demands → Explain executive support structure'
        ]
      };

    default:
      return {
        questions: ['Tell me about your background and experience'],
        sellingPoints: ['Great opportunity for career growth'],
        objections: ['Address any concerns you may have']
      };
  }
};
export const getCallTypePrompts = (callType: CallType): CallTypePrompts => {
  switch (callType) {
    case 'Initial Screening':
      return {
        questions: [
          'What do you do now?',
          'How long have you been doing it?',
          'Where are you working?',
          'Why are you considering making a change?',
          'What kind of opportunity would make you consider a change?',
          'Describe an opportunity that would make you consider a change.',
          'Would you change for: closer to home, better opportunity for advancement, better boss, larger or more prestigious organization, or more money?',
          'What is your current salary?',
          'What is your salary expectation?',
          'When are you looking to leave?',
          'What is your time frame?',
          'What is the maximum distance from home you would commute?',
          'Would you relocate? If so, where?',
          'What other jobs have you applied to recently?',
          'What other jobs have you interviewed for recently?',
          'Are you working with other recruiters?',
          'Is there anywhere you cannot or are unwilling to work?',
          'If I could get you the right job, in the right location, for the right money, how soon could you start?'
        ],
        checklist: [
          'Confirm candidate interest level',
          'Verify basic qualifications',
          'Discuss compensation range',
          'Schedule next interview',
          'Send follow-up materials'
        ]
      };
    case 'Interview':
      return {
        questions: [
          'Provide an overview of your career',
          'Describe your leadership experience',
          'Describe your clinical experience',
          'Most recent or current job: title, start and end date',
          'Duties in your most recent role',
          'Achievements in your most recent role',
          'Salary and benefits in your most recent role',
          'Are you still in this role? If not, when did you leave?',
          'Reason for leaving or considering leaving',
          'Supervisor reference: name and phone',
          'Next most recent job: title and approximate dates',
          'Duties in that role',
          'Achievements in that role',
          'Salary and benefits in that role',
          'Reason for leaving that role',
          'Supervisor reference: name and phone',
          'Third most recent job: title, location, and approximate dates',
          'Duties in that role',
          'Achievements in that role',
          'Salary and benefits in that role',
          'Reason for leaving that role',
          'Supervisor reference: name and phone',
          'Why are you looking to make a change?',
          'What is the most important thing to you in your next job? (at least three quantifiable things)',
          'If you have multiple offers, what factors will help you choose between them?',
          'How much do you need to make in order to consider a change?',
          'What is your maximum acceptable commute?',
          'Are you willing to travel?',
          'Are there any red flags or concerns in your background we should be aware of?',
          'Date you are available to start',
          'What other opportunities are you currently considering?',
          'How do those opportunities compare to this one?',
          'Have you ever applied for a job on your own or through another recruiter?',
          'Is this a good fit for you? Why or why not?',
          'When are you available for a phone interview?',
          'When are you available for an in-person interview?'
        ],
        checklist: [
          'Assess technical competencies',
          'Evaluate cultural fit',
          'Discuss role expectations',
          'Present selling points',
          'Address any concerns'
        ]
      };

    case 'Debriefing':
      return {
        questions: [
          'How did it go?',
          'Who did you meet with?',
          'Was this a phone, in-person, or video interview?',
          'What kinds of questions did they ask you?',
          'What do you like most about the opportunity, as it was explained to you?',
          'What are your concerns about this opportunity?',
          'How does this job compare with your current position?',
          'How does this job compare with other jobs you are considering?',
          'On a scale of 1–10, how would you rate this job?',
          'What would make this job a 10?',
          'Did you tell the interviewer that you were interested in the job? How did they respond?',
          'Did the interviewer(s) express any concerns about hiring you during the interview?',
          'How did the interview end?',
          'If we get positive feedback tomorrow and this employer offered you the job at X$ per year, what would you do?',
          'If we can help you get the money you need for this job, and the questions answered, when could you start?',
          'Availability for another interview if necessary'
        ],
        checklist: [
          'Gather candidate feedback',
          'Address any concerns',
          'Confirm continued interest',
          'Discuss timeline',
          'Plan follow-up actions'
        ]
      };

    case 'Reference Check':
      return {
        questions: [
          'What is your relationship to the candidate?',
          'How long have you worked with them?',
          'What was their role and responsibilities?',
          'How would you describe their work performance?',
          'What are their greatest strengths?',
          'What areas could they improve in?',
          'How did they handle difficult situations or challenges?',
          'Would you rehire them if given the opportunity?',
          'How did they work with colleagues and supervisors?',
          'What kind of work environment do they thrive in?',
          'Is there anything else you think we should know about this candidate?'
        ],
        checklist: [
          'Verify employment dates and role',
          'Assess performance and reliability',
          'Evaluate interpersonal skills',
          'Identify any concerns',
          'Confirm rehire eligibility'
        ]
      };

    default:
      return {
        questions: ['How can I help you today?'],
        checklist: ['Complete the call objectives']
      };
  }
};