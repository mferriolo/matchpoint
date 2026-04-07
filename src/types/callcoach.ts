export interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  createdAt: Date;
  questions: string[];
  sellingPoints: string[];
  objections: string[];
}

export interface CallSession {
  id: string;
  jobId: string;
  candidateName: string;
  startTime: Date;
  endTime?: Date;
  transcript: string;
  prompts: CallPrompt[];
  checklist: ChecklistItem[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  score?: number;
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