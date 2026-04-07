export interface Candidate {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  location?: string;
  specialty?: string;
  experience?: string;
  skills?: string[];
  status: 'new' | 'screening' | 'interviewed' | 'offered' | 'hired' | 'rejected';
  score?: number;
  notes?: string;
  resumeUrl?: string;
  resume_url?: string; // Alternative field name for database compatibility
  createdAt?: string;
  created_at?: string; // Alternative field name for database compatibility
  updatedAt?: string;
  currentJobTitle?: string; // Current job title from resume
  current_job_title?: string; // Alternative field name for database compatibility
  currentCompany?: string; // Current company from resume
  
  // New clinical fields
  first_name?: string;
  last_name?: string;
  job_type?: string;
  state_licenses?: string[];
  clinical_specialty?: string[];
  clinical_subspecialty?: string[];
  metadata?: Record<string, any>;
  
  // Legacy fields for compatibility
  firstName?: string;
  lastName?: string;
  title?: string;
  education?: Education[];
  workHistory?: WorkHistory[];
  resumeText?: string;
  linkedinUrl?: string;
  aiScore?: number;
  aiAnalysis?: AIAnalysis;
  tags?: string[];
  appliedJobs?: string[];
}




export interface Education {
  degree: string;
  field: string;
  institution: string;
  graduationYear: number;
}

export interface WorkHistory {
  title: string;
  company: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
  achievements?: string[];
}

export interface AIAnalysis {
  overallScore: number;
  skillsMatch: number;
  experienceMatch: number;
  educationMatch: number;
  cultureFit: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string;
  redFlags?: string[];
  keyHighlights: string[];
}