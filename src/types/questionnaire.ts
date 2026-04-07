export interface Questionnaire {
  id: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  callType: string;
  jobType: string;
  isFullInterview: boolean;
  questions: string[];
  createdAt: Date;
  responses?: QuestionnaireResponse[];
}

export interface QuestionnaireResponse {
  questionIndex: number;
  question: string;
  response: string;
  timestamp: Date;
  notes?: string;
}

export interface QuestionnaireGenerationRequest {
  callType: string;
  jobType: string;
  jobSpecificQuestions?: string[];
  isFullInterview: boolean;
  candidateName: string;
  jobId: string;
  jobTitle: string;
}