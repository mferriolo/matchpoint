export type JobType = 'Physician' | 'Advanced Practitioner (NP/PA)' | 'Physician Executive' | 'Administrative Executive';

export type CallType = 'Initial Screening' | 'Interview' | 'Debriefing' | 'Briefing' | 'Closing';

export type CallMethod = 'zoom' | 'phone' | 'twilio';

export interface Job {
  id: string;
  title: string;
  company: string;
  jobDescription: string; // Renamed from 'description'
  description?: string; // New field (was 'summary')
  jobType: JobType;
  createdAt: Date;
  questions: string[]; // Legacy support
  categorizedQuestions?: {
    specificJobQuestions: string[];
    candidateNeeds: string[];
    candidateQualifications: string[];
  };
  sellingPoints: string[];
  objections: string[];
  summary?: string; // Keep for backward compatibility
  compensation?: string;
  startDate?: string;
  numberOfOpenings?: number;
  streetAddress?: string;
  city?: string;
  zipcode?: string;
  state?: string;
  location?: string;
  requirements?: string;
  salary?: string;
  isActive?: boolean;
  callNotes?: CallNote[];
  questionnaire?: any;
}

export interface CallNote {
  id: string;
  candidateName: string;
  jobTitle: string;
  callType: string;
  callMethod: CallMethod;
  date: Date;
  questionsAndResponses: QuestionResponse[];
  summary: string;
}

export interface QuestionResponse {
  question: string;
  response: string;
  timestamp: Date;
}

export interface CallSession {
  id: string;
  jobId: string;
  jobReferenceId?: string; // For candidate calls that reference a job for knockout questions
  databaseId?: string; // ID of the record in the call_recordings table
  candidateName: string;
  callType: CallType;
  callMethod: CallMethod;
  callCategory?: string; // Store whether this is a 'client' or 'candidate' call
  startTime: Date;
  endTime?: Date;
  transcript: string;
  prompts: CallPrompt[];
  checklist: ChecklistItem[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  score?: number;
  questionsAndResponses?: QuestionResponse[];
  questions?: string[]; // Add questions array to store fetched questions
  jobType?: string; // Add jobType for reference
}

export interface CallPrompt {
  id: string;
  timestamp: Date;
  message: string;
  type: 'question' | 'reminder' | 'objection' | 'selling_point';
  acknowledged: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  category: 'screening' | 'selling' | 'logistics' | 'next_steps';
}

export interface FollowUpAction {
  id: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: Date;
}