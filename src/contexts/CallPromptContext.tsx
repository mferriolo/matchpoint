import React, { createContext, useContext, useState, useEffect } from 'react';
import { Job, CallSession, CallMethod, CallNote, QuestionResponse, CallType } from '@/types/callprompt';
import { supabase } from '@/lib/supabase';

interface CallPromptContextType {
  jobs: Job[];
  currentJob: Job | null;
  currentCall: CallSession | null;
  lastCall: CallSession | null;
  isAnalyzing: boolean;
  setAnalyzing: (analyzing: boolean) => void;
  addJob: (job: Omit<Job, 'id' | 'createdAt'>) => Promise<void>;
  setCurrentJob: (job: Job | null) => void;
  startCall: (jobId: string, candidateName: string, callMethod: CallMethod, callType?: string, callCategory?: string, jobReferenceId?: string) => void;

  endCall: () => void;
  updateJobWisdom: (jobId: string, updates: Partial<Pick<Job, 'questions' | 'sellingPoints' | 'objections'>>) => void;
  renameJob: (jobId: string, newTitle: string) => void;
  duplicateJob: (jobId: string) => void;
  deleteJob: (jobId: string) => void;
  toggleJobActive: (jobId: string) => void;
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  reorderJobs: (reorderedJobs: Job[]) => void;
}

const CallPromptContext = createContext<CallPromptContextType | undefined>(undefined);

export const useCallPrompt = () => {
  const context = useContext(CallPromptContext);
  if (!context) {
    throw new Error('useCallPrompt must be used within CallPromptProvider');
  }
  return context;
};

const STORAGE_KEY = 'callprompt-jobs';

export const CallPromptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [lastCall, setLastCall] = useState<CallSession | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Load jobs from database on mount
  useEffect(() => {
    const loadJobs = async () => {
      console.log('=== LOADING JOBS FROM DATABASE ===');
      try {
        const { data, error } = await supabase
          .from('job_orders')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error loading jobs from database:', error);
          return;
        }
        
        console.log('Jobs loaded from database:', data?.length);
        
        // Convert database format to Job format
        // Convert database format to Job format
        const jobsWithDates = (data || []).map((job: any) => ({
          id: job.id,
          title: job.title || job.job_title,
          company: job.company,
          location: job.location || '',
          jobType: job.job_type || undefined,
          description: job.description || '',
          summary: job.summary || '',
          compensation: job.salary_range || '',
          startDate: '', // start_date column doesn't exist in database - using empty string as default
          numberOfOpenings: 1, // Default value - number_of_openings column doesn't exist in database
          streetAddress: job.street_address || '',
          city: job.city || '',
          state: job.state || '',
          zipcode: job.zipcode || '',
          requirements: job.requirements || '',
          questions: job.questions || [],
          sellingPoints: job.selling_points || [],
          objections: job.objections || [],
          categorizedQuestions: {
            specificJobQuestions: [],
            candidateNeeds: [],
            candidateQualifications: []
          },

          createdAt: new Date(job.created_at),
          isActive: job.is_active !== false,
          callNotes: []
        }));

        
        setJobs(jobsWithDates);
        console.log('Jobs state updated with', jobsWithDates.length, 'jobs');
      } catch (error) {
        console.error('Failed to load jobs from database:', error);
      }
    };
    
    loadJobs();
  }, []);

  const addJob = async (jobData: Omit<Job, 'id' | 'createdAt'>): Promise<void> => {
    console.log('=== CREATING JOB - FULL DEBUG ===');
    console.log('Raw job data received:', JSON.stringify(jobData, null, 2));
    console.log('Job type value:', jobData.jobType);
    
    // CRITICAL: Check for existing job with same title and company to prevent duplicates
    try {
      console.log('Checking for existing job...');
      
      // Escape the title for PostgREST query - values with commas need to be quoted
      // Also escape any double quotes within the title
      const escapedTitle = jobData.title.replace(/"/g, '\\"');
      
      // Check both title and job_title fields since some records might have one or the other
      const { data: existingJobs, error: checkError } = await supabase
        .from('job_orders')
        .select('id, title, job_title, company')
        .eq('company', jobData.company)
        .or(`title.eq."${escapedTitle}",job_title.eq."${escapedTitle}"`);

      
      if (checkError) {
        console.error('Error checking for existing jobs:', checkError);
      }
      
      console.log('Existing jobs found:', existingJobs?.length || 0);

      
      if (existingJobs && existingJobs.length > 0) {
        console.log('⚠️ Job already exists:', existingJobs[0].id);
        console.log('Existing job:', existingJobs[0]);
        
        // Job already exists - don't create duplicate
        // Just load the existing job into state if not already there
        const existingJobInState = jobs.find(j => j.id === existingJobs[0].id);
        if (!existingJobInState) {
          // Load the full job data from database
          const { data: fullJobData } = await supabase
            .from('job_orders')
            .select('*')
            .eq('id', existingJobs[0].id)
            .single();
          
          if (fullJobData) {
            const existingJob: Job = {
              id: fullJobData.id,
              title: fullJobData.title || fullJobData.job_title,
              company: fullJobData.company,
              location: fullJobData.location || '',
              jobType: fullJobData.job_type || undefined,
              description: fullJobData.description || '',
              questions: fullJobData.questions || [],
              sellingPoints: fullJobData.selling_points || [],
              objections: fullJobData.objections || [],
              categorizedQuestions: {
                specificJobQuestions: [],
                candidateNeeds: [],
                candidateQualifications: []
              },
              createdAt: new Date(fullJobData.created_at),
              isActive: fullJobData.is_active !== false,
              callNotes: []
            };
            
            setJobs(prev => [...prev, existingJob]);
          }
        }
        
        console.log('Duplicate job creation prevented');
        return; // Exit early - don't create duplicate
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
    }
    
    // Save to database first to get the database-generated ID
    try {
      console.log('No duplicate found, creating new job...');
      console.log('Saving job to database...');
      const dbData = {
        title: jobData.title,
        job_title: jobData.title,
        company: jobData.company,
        location: jobData.location || '',
        job_type: jobData.jobType || null,
        description: jobData.description || '',
        requirements: jobData.requirements || '',
        salary_range: jobData.salary || jobData.compensation || '',
        status: 'active',
        is_active: true,
        created_at: new Date().toISOString(),
        knockout_questions: [],
        selling_points: '',
        objections: '',
        summary: ''
      };
      
      console.log('Data being sent to database:', JSON.stringify(dbData, null, 2));
      
      const { data, error } = await supabase
        .from('job_orders')
        .insert([dbData])
        .select()
        .single();

      console.log('=== DATABASE RESPONSE ===');
      console.log('Error:', error);
      console.log('Returned data:', JSON.stringify(data, null, 2));

      if (error) {
        console.error('Database error saving job:', error);

        // C5 fix: On duplicate key (race condition), fetch the existing job instead of failing silently
        if (error.code === '23505') {
          console.log('Duplicate key - fetching existing job');
          const { data: existing } = await supabase
            .from('job_orders')
            .select('*')
            .eq('company', jobData.company)
            .or(`title.eq."${jobData.title.replace(/"/g, '\\"')}",job_title.eq."${jobData.title.replace(/"/g, '\\"')}"`)
            .limit(1)
            .single();
          if (existing) {
            const existingJob: Job = {
              id: existing.id,
              title: existing.title || existing.job_title,
              company: existing.company,
              location: existing.location || '',
              jobType: existing.job_type || undefined,
              description: existing.description || '',
              questions: existing.questions || [],
              sellingPoints: existing.selling_points || [],
              objections: existing.objections || [],
              categorizedQuestions: { specificJobQuestions: [], candidateNeeds: [], candidateQualifications: [] },
              createdAt: new Date(existing.created_at),
              isActive: existing.is_active !== false,
              callNotes: []
            };
            setJobs(prev => prev.some(j => j.id === existingJob.id) ? prev : [...prev, existingJob]);
          }
        }
        return;
      }
      
      console.log('✅ Job saved to database successfully');
      console.log('  - Database ID:', data.id);
      console.log('  - job_type returned:', data.job_type);
      
      // Create job object with database-generated ID
      const newJob: Job = {
        ...jobData,
        id: data.id, // Use database-generated ID
        createdAt: new Date(data.created_at),
        isActive: true,
      };
      
      // Add job to state with database ID
      setJobs(prev => [...prev, newJob]);
      
      // Set analyzing flag
      setIsAnalyzing(true);
      
      try {
        // Auto-generate all content for all tabs automatically
        await generateAllJobContent(newJob);
      } finally {
        setIsAnalyzing(false);
      }
    } catch (error) {
      console.error('❌ Exception saving job to database:', error);
    }
  };






  const generateAllJobContent = async (job: Job) => {
    try {
      console.log('Generating all content for job:', job.title);
      
      // Set a flag to indicate generation is in progress
      localStorage.setItem(`jobOrderGenerating_${job.id}`, 'true');
      
      // We need to generate the job order using ChatGPT
      // Import the questions lists
      const { JOB_ORDER_QUESTIONS } = await import('@/utils/jobOrderQuestions');
      
      // Build the questions lists
      const timingQuestionsList = [
        'What is the timeline for filling this role? (Target start date?) What will happen if you are late?',
        'Please bring us up to speed ---  Where are you in the process of hiring someone for this role?  (How long has the search gone on so far?  What has happened to date?  )',
        'Pressure  Let\'s talk about the pressure you may be feeling to get this position filled…what\'s driving this need?',
        'Challenges  What has been the biggest challenge of filling the position to date?',
        'Current - Who is doing the job currently, and how is that affecting the organization?',
        'Deadline - When do you need to have someone new actually start in this role?  Why then?',
        'Pipeline - Tell me about your candidate pipeline currently.',
        'Resources - What resources are you currently using to generate candidates?',
        'How many have you interviewed?',
        'Of those interviewed are any still viable?',
        'Can you make a hiring decision from this group?  Why or why not?',
        'Have you made any offers that have been turned down?  If yes, do you know why?'
      ];
      
      const jobQuestionsList = [
        'Is there mandatory overtime or \'On-Call\' Hours? If so, what does it look like?',
        'What is the title of the position?',
        'What are the primary responsibilities?',
        'What is the schedule for this role?',
        'Is this a remote, hybrid, or onsite position?',
        'What qualifications are preferred?',
        'What is the compensation structure?',
        'Are there travel requirements?',
        'How many direct reports (if any)?'
      ];
      
      // Add job type specific questions
      if (job.jobType && JOB_ORDER_QUESTIONS[job.jobType]) {
        const jobTypeQuestions = JOB_ORDER_QUESTIONS[job.jobType];
        jobQuestionsList.push(...jobTypeQuestions);
      }
      
      const companyQuestionsList = [
        'What is the size and scope of the organization?',
        'What services or specialties does the organization provide?',
        'What is the company\'s mission or core values?',
        'What makes the organization unique or attractive to candidates?',
        'Are there any growth plans or recent milestones to share?'
      ];
      
      const hiringQuestionsList = [
        'What is the hiring timeline?',
        'What are the interview stages?',
        'Who will be involved in the interview process (names and titles)?',
        'How will interviews be conducted (e.g., phone, video, in-person)?',
        'Who is the final decision maker?'
      ];
      
      // Build the same JSON-shaped prompt that JobOrder.tsx uses for its manual "Generate"
      // button, then call the chatgpt-integration edge function directly (avoiding the
      // useChatGPT hook so this works from a non-component context).
      const prompt = `Analyze this job and provide structured answers in JSON format.

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description || 'Not provided'}
Location: ${job.location || 'Not specified'}

Please analyze this job information and provide answers to the following questions in JSON format:

{
  "jobQuestions": {
${jobQuestionsList.map(q => `    "${q.replace(/"/g, '\\"')}": "answer here or Not Specified"`).join(',\n')}
  },
  "timingQuestions": {
${timingQuestionsList.map(q => `    "${q.replace(/"/g, '\\"')}": "Not Specified"`).join(',\n')}
  },
  "companyQuestions": {
${companyQuestionsList.map(q => `    "${q.replace(/"/g, '\\"')}": "answer here or Not Specified"`).join(',\n')}
  },
  "hiringQuestions": {
${hiringQuestionsList.map(q => `    "${q.replace(/"/g, '\\"')}": "Not Specified"`).join(',\n')}
  },
  "timingNotes": "",
  "jobNotes": "Additional notes about the job",
  "companyNotes": "Additional notes about the company",
  "hiringNotes": "Additional notes about the hiring process"
}

Provide only the JSON response with actual answers based on the job information provided. Use "Not Specified" for questions that cannot be answered from the available information.`;

      let jobOrderData: any = null;

      try {
        console.log('Calling chatgpt-integration to analyze job...');
        const { data: aiResult, error: aiError } = await supabase.functions.invoke('chatgpt-integration', {
          body: { action: 'analyze_job', prompt }
        });

        if (aiError) throw new Error(aiError.message || 'Edge function error');
        if (!aiResult?.success) throw new Error(aiResult?.error || 'AI generation failed');

        // Strip markdown fences and extract the JSON object
        let cleanContent = (aiResult.content || '').trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
        const jsonStart = cleanContent.indexOf('{');
        const jsonEnd = cleanContent.lastIndexOf('}') + 1;
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          cleanContent = cleanContent.substring(jsonStart, jsonEnd);
        }

        const parsed = JSON.parse(cleanContent);

        // Compute unanswered question lists the same way JobOrder.tsx does
        const isUnanswered = (val: any) =>
          !val || (typeof val === 'string' && (val.trim() === '' || val.trim() === 'Not Specified'));
        const jobUnanswered = jobQuestionsList.filter(q => isUnanswered(parsed.jobQuestions?.[q]));
        const companyUnanswered = companyQuestionsList.filter(q => isUnanswered(parsed.companyQuestions?.[q]));
        const hiringUnanswered = hiringQuestionsList.filter(q => isUnanswered(parsed.hiringQuestions?.[q]));

        jobOrderData = {
          timingQuestions: {},
          jobQuestions: parsed.jobQuestions || {},
          companyQuestions: parsed.companyQuestions || {},
          hiringQuestions: parsed.hiringQuestions || {},
          timingNotes: '',
          jobNotes: parsed.jobNotes || '',
          companyNotes: parsed.companyNotes || '',
          hiringNotes: parsed.hiringNotes || '',
          unansweredQuestions: {
            timing: timingQuestionsList,
            job: jobUnanswered,
            company: companyUnanswered,
            hiring: hiringUnanswered,
            insightful: []
          }
        };
        console.log('AI job order analysis complete');
      } catch (aiError) {
        // If the AI call fails for any reason, fall back to the empty structure so the
        // add-job flow never blocks. The user can still click "Generate" in the Job Order
        // tab to retry the analysis.
        console.error('AI job order analysis failed, falling back to empty structure:', aiError);
        jobOrderData = {
          timingQuestions: {},
          jobQuestions: {},
          companyQuestions: {},
          hiringQuestions: {},
          timingNotes: '',
          jobNotes: '',
          companyNotes: '',
          hiringNotes: '',
          unansweredQuestions: {
            timing: timingQuestionsList,
            job: jobQuestionsList,
            company: companyQuestionsList,
            hiring: hiringQuestionsList,
            insightful: []
          }
        };
        timingQuestionsList.forEach(q => { if (q !== 'NOTES') jobOrderData.timingQuestions[q] = 'Not Specified'; });
        jobQuestionsList.forEach(q => { if (q !== 'NOTES') jobOrderData.jobQuestions[q] = 'Not Specified'; });
        companyQuestionsList.forEach(q => { if (q !== 'NOTES') jobOrderData.companyQuestions[q] = 'Not Specified'; });
        hiringQuestionsList.forEach(q => { if (q !== 'NOTES') jobOrderData.hiringQuestions[q] = 'Not Specified'; });
      }

      localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(jobOrderData));
      console.log('Job order data saved to localStorage');

      // Remove the generation flag
      localStorage.removeItem(`jobOrderGenerating_${job.id}`);
      
    } catch (error) {
      console.error('Error generating job content:', error);
      // Remove the generation flag on error
      localStorage.removeItem(`jobOrderGenerating_${job.id}`);
    }
  };

  const setAnalyzing = (analyzing: boolean) => {
    setIsAnalyzing(analyzing);
  };
  const startCall = async (jobId: string, candidateName: string, callMethod: CallMethod, callType?: string, callCategory?: string, jobReferenceId?: string) => {
    console.log('=== START CALL DEBUG ===');
    console.log('Full config:', { jobId, candidateName, callMethod, callType, callCategory, jobReferenceId });
    console.log('Job ID from config:', jobId); // THIS SHOULD BE THE RIGHT ID
    
    // For candidate calls without a job, DON'T create a temporary job that appears in Jobs Dashboard
    let job = jobs.find(j => j.id === jobId);
    
    // If no job found and this is a candidate call, create a minimal job object for the call
    // but DON'T add it to the jobs state (which would make it appear in Jobs Dashboard)
    if (!job && !jobId) {
      job = {
        id: 'temp-' + crypto.randomUUID(), // Use temp prefix to identify temporary jobs
        title: `Candidate Call - ${candidateName}`,
        company: 'Candidate Interview',
        location: 'TBD',
        jobType: 'Nursing',
        description: `${callType} call with ${candidateName}`,
        questions: [],
        sellingPoints: [],
        objections: [],
        categorizedQuestions: { specificJobQuestions: [], candidateNeeds: [], candidateQualifications: [] },
        createdAt: new Date(),
        isActive: true
      } as Job;
      // IMPORTANT: Don't add temporary jobs to state - they shouldn't appear in Jobs Dashboard
      jobId = job.id;
    }
    
    if (!job) return;

    try {
      let allQuestions: string[] = [];
      
      // Check if this is a Job Order Call - DO NOT MODIFY THIS SECTION
      if (callType === 'Job Order Call') {
        console.log('Job Order Call detected');
        try {
          const { data: clientCallTypeData } = await supabase.from('client_call_types').select('id').eq('name', 'Job Order Call').single();
          if (clientCallTypeData) {
            const { data: questionsData } = await supabase.from('questions').select('question_text').eq('type_id', clientCallTypeData.id).eq('question_type', 'client_call_type').eq('is_active', true).order('sort_order');
            if (questionsData && questionsData.length > 0) {
              allQuestions = questionsData.map(q => q.question_text);
            }
          }
        } catch (error) {
          console.error('Error fetching Job Order Call questions:', error);
        }
        if (allQuestions.length === 0) {
          const storedQuestions = sessionStorage.getItem('jobOrderIntakeQuestions');
          if (storedQuestions) {
            try {
              const unansweredQuestions = JSON.parse(storedQuestions);
              if (Array.isArray(unansweredQuestions) && unansweredQuestions.length > 0) {
                allQuestions = unansweredQuestions;
                sessionStorage.removeItem('jobOrderIntakeQuestions');
              }
            } catch (error) {
              console.error('Failed to parse stored questions:', error);
            }
          }
        }
      }
      // For all other call types, fetch questions from database
      else if (callType && callType !== 'Job Order Call') {
        console.log('Non-Job Order call - fetching from database');
        try {
          const tableName = callCategory === 'candidate' ? 'call_types' : 'client_call_types';
          const questionType = callCategory === 'candidate' ? 'call_type' : 'client_call_type';
          const { data: callTypeData } = await supabase.from(tableName).select('*').eq('name', callType).eq('is_active', true).single();
          
          if (callTypeData) {
            const { data: questionsData } = await supabase.from('questions').select('*').eq('type_id', callTypeData.id).eq('question_type', questionType).eq('is_active', true).order('sort_order', { ascending: true });
            
            if (questionsData && questionsData.length > 0) {
              allQuestions = questionsData.map(q => q.question_text);
              sessionStorage.setItem(`callQuestions_${callType}`, JSON.stringify(allQuestions));
            }
          }
        } catch (error) {
          console.error('Exception in startCall:', error);
        }
      }
      
      // If no questions from database, use defaults
      if (allQuestions.length === 0) {
        const { getCallTypePrompts, PREDEFINED_QUESTIONS } = await import('@/utils/jobTypePrompts');
        const callTypePrompts = getCallTypePrompts(callType as any || 'Initial Screening');
        allQuestions = [...callTypePrompts.questions];
        
        if (callType === 'Interview' && PREDEFINED_QUESTIONS[job.jobType]) {
          allQuestions = [...allQuestions, ...PREDEFINED_QUESTIONS[job.jobType]];
        }
      }

      // REMOVED: Knockout questions should NOT be added to allQuestions
      // They are displayed in their own dedicated section in LiveCall.tsx
      // Adding them here causes them to appear in both "AI Prompts & Questions" 
      // and "Knockout Questions" sections, which is duplicate and confusing
      
      // The knockout questions are loaded separately in LiveCall.tsx from the 
      // job_orders.knockout_questions field and displayed in their own section


      const questionnaire = {
        id: crypto.randomUUID(),
        candidateName,
        jobId,
        jobTitle: job.title,
        callType: callType || 'Initial Screening',
        jobType: job.jobType,
        isFullInterview: callType === 'Interview',
        questions: allQuestions,
        createdAt: new Date(),
        responses: []
      };

      console.log('Starting call with', allQuestions.length, 'questions');
      console.log('=== END START CALL DEBUG ===');
      // CRITICAL FIX: Store jobReferenceId and callCategory in the call session
      const newCall: CallSession = {
        id: crypto.randomUUID(),
        jobId,
        jobReferenceId, // Store jobReferenceId for later use
        candidateName,
        callMethod,
        callType: (callType as CallType) || 'Initial Screening',
        callCategory, // Store the passed callCategory to use when ending the call
        startTime: new Date(),
        transcript: '',
        prompts: [],
        checklist: [],
        questions: allQuestions
      };
      
      console.log('Call data being created:', newCall);
      console.log('Job ID in call data:', newCall.jobId);
      console.log('Job Reference ID in call data:', newCall.jobReferenceId);
      console.log('Call Category:', newCall.callCategory);
      
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, questionnaire } : j));
      setCurrentCall(newCall);
      
      // CRITICAL FIX: Save call to database immediately when it starts
      // This ensures client calls appear in Live Calls feed right away
      const callCategoryValue = callCategory || (job?.company === 'Candidate Interview' ? 'Candidate' : 'Client');
      
      console.log('Saving new call to database with status: In Progress');
      const { data: insertedCall, error: insertError } = await supabase
        .from('calls')

        .insert({
          job_id: newCall.jobId,
          candidate_name: newCall.candidateName,
          call_type: newCall.callType,
          call_category: callCategoryValue,
          call_method: newCall.callMethod,
          start_time: newCall.startTime.toISOString(),
          end_time: newCall.startTime.toISOString(), // Set end_time same as start_time initially to satisfy NOT NULL constraint
          duration_minutes: 0, // Will be calculated when call ends
          status: 'In Progress', // Mark as in progress
          questions_and_responses: [],
          call_note: '' // Empty call_note instead of summary
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Error saving initial call record:', insertError);
      } else {
        console.log('✅ Call record created with ID:', insertedCall?.id);
        // Store the database ID in the call session for later update
        newCall.databaseId = insertedCall?.id;
        setCurrentCall(newCall);
      }
      
    } catch (error) {
      console.error('Failed to generate questionnaire:', error);
      const newCall: CallSession = {
        id: crypto.randomUUID(),
        jobId,
        jobReferenceId,
        candidateName,
        callMethod,
        callType: (callType as CallType) || 'Initial Screening',
        startTime: new Date(),
        transcript: '',
        prompts: [],
        checklist: [],
        questions: []
      };
      setCurrentCall(newCall);
    }
  };




  const endCall = async () => {

    if (currentCall) {
      console.log('=== ENDING CALL ===');
      console.log('Call ID:', currentCall.id);
      console.log('Database ID:', currentCall.databaseId);
      console.log('Candidate:', currentCall.candidateName);
      console.log('Call Type:', currentCall.callType);
      
      // CRITICAL FIX: Dispatch event to tell Zoom/Twilio to end the meeting
      // This allows the ZoomIntegration component to clean up the meeting
      console.log('Dispatching endZoomCall event...');
      window.dispatchEvent(new CustomEvent('endZoomCall', { 
        detail: { 
          callId: currentCall.id,
          callMethod: currentCall.callMethod 
        } 
      }));
      
      const endTime = new Date();
      const durationMinutes = Math.round((endTime.getTime() - currentCall.startTime.getTime()) / 60000);
      
      // Prepare questions and responses from the call
      const questionsAndResponses = currentCall.questionsAndResponses || [];
      
      // CRITICAL FIX: Use the callCategory stored in the session, not derived from company name
      // This ensures candidate calls stay as 'candidate' and client calls stay as 'client'
      const callCategory = currentCall.callCategory || 'candidate';
      console.log('Using stored call category:', callCategory);
      
      let callNote = '';
      
      // Get the job reference for generating call note
      const job = jobs.find(j => j.id === currentCall.jobId);
      
      // Only generate call note if there are questions and responses
      if (questionsAndResponses.length > 0) {
        try {
          // Generate call note using AI
          if (job) {
            const { data, error } = await supabase.functions.invoke('call-note-generator', {
              body: {
                candidateName: currentCall.candidateName,
                jobTitle: job.title,
                callType: currentCall.callType,
                questionsAndResponses: questionsAndResponses
              }
            });
            if (!error && data?.note) {
              callNote = data.note;
              
              // Create call note object
              const callNoteObj: CallNote = {
                id: crypto.randomUUID(),
                candidateName: currentCall.candidateName,
                jobTitle: job.title,
                callType: currentCall.callType,
                callMethod: currentCall.callMethod,
                date: new Date(),
                questionsAndResponses: questionsAndResponses,
                summary: data.note
              };

              // Add note to job
              setJobs(prev => prev.map(job => 
                job.id === currentCall.jobId 
                  ? { ...job, callNotes: [...(job.callNotes || []), callNoteObj] }
                  : job
              ));
            }
          }
        } catch (error) {
          console.error('Failed to generate call note:', error);
        }
      }
      
      // CRITICAL FIX: If we have a database ID, update the existing record instead of inserting
      if (currentCall.databaseId) {
        console.log('Updating existing call record in database...');
        try {
          // Add timeout handling
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
          
          const { data: updatedCall, error: updateError } = await supabase
            .from('calls')

            .update({
              end_time: endTime.toISOString(),
              duration_minutes: durationMinutes,
              status: 'Completed',
              questions_and_responses: questionsAndResponses,
              call_note: callNote
            })
            .eq('id', currentCall.databaseId)
            .select()
            .single()
            .abortSignal(controller.signal);
          
          clearTimeout(timeoutId);
          
          if (updateError) {
            if (updateError.message?.includes('aborted')) {
              console.error('Call update timed out after 15 seconds');
            } else {
              console.error('Error updating call in database:', updateError);
            }
          } else {
            console.log('✅ Call updated successfully with ID:', updatedCall?.id);
            
            // REMOVED: No longer saving to job_call_records table
            // REMOVED: No longer saving to job_call_records table
            // Calls should ONLY appear in Live Calls dashboard via call_recordings table
          }
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.error('Call update request timed out');
          } else {
            console.error('Exception updating call in database:', error);
          }
        }
      } else {
        // Fallback: If no database ID exists (shouldn't happen), insert as before
        console.log('No database ID found, inserting new call record...');
        
        // Check if this call already exists in the database
        const { data: existingCalls, error: checkError} = await supabase
          .from('calls')

          .select('id')
          .eq('job_id', currentCall.jobId)
          .eq('candidate_name', currentCall.candidateName)
          .eq('call_type', currentCall.callType)
          .eq('start_time', currentCall.startTime.toISOString());
        
        if (checkError) {
          console.error('Error checking for existing calls:', checkError);
        } else if (existingCalls && existingCalls.length > 0) {
          console.warn('⚠️ Call already exists in database, skipping insert');
          console.log('Existing call IDs:', existingCalls.map(c => c.id));
          setLastCall(currentCall);
          setCurrentCall(null);
          return;
        }
        
        try {
          const { data: insertedCall, error: insertError } = await supabase
            .from('calls')

            .insert({
              job_id: currentCall.jobId,
              candidate_name: currentCall.candidateName,
              call_type: currentCall.callType,
              call_category: callCategory,
              call_method: currentCall.callMethod,
              start_time: currentCall.startTime.toISOString(),
              end_time: endTime.toISOString(),
              duration_minutes: durationMinutes,
              status: 'Completed',
              questions_and_responses: questionsAndResponses,
              call_note: callNote
            })
            .select()
            .single();
          
          if (insertError) {
            console.error('Error saving call to database:', insertError);
          } else {
            console.log('✅ Call saved successfully with ID:', insertedCall?.id);
          }
        } catch (error) {
          console.error('Exception saving call to database:', error);
        }
      }

      
      console.log('=== END CALL COMPLETE ===');
      setLastCall(currentCall);
    }
    setCurrentCall(null);
  };






  const updateJobWisdom = async (jobId: string, updates: Partial<Job>) => {
    // Update state
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, ...updates } : job
    ));
    
    // Save to database
    try {
      const dbUpdates: any = {};
      
      // Map frontend fields to database fields
      if (updates.title) dbUpdates.job_title = updates.title;
      if (updates.company) dbUpdates.company = updates.company;
      if (updates.description) dbUpdates.description = updates.description;
      if (updates.summary) dbUpdates.summary = updates.summary;
      if (updates.compensation) dbUpdates.salary_range = updates.compensation;
      // start_date column removed - doesn't exist in database
      // number_of_openings column removed - doesn't exist in database
      if (updates.streetAddress) dbUpdates.street_address = updates.streetAddress;
      if (updates.city) dbUpdates.city = updates.city;
      if (updates.state) dbUpdates.state = updates.state;
      if (updates.zipcode) dbUpdates.zipcode = updates.zipcode;
      if (updates.location) dbUpdates.location = updates.location;
      if (updates.jobType) dbUpdates.job_type = updates.jobType;
      if (updates.requirements) dbUpdates.requirements = updates.requirements;
      if (updates.sellingPoints) dbUpdates.selling_points = updates.sellingPoints;
      if (updates.objections) dbUpdates.objections = updates.objections;
      if (updates.questions) dbUpdates.questions = updates.questions;
      // categorized_questions column removed - doesn't exist in database

      
      // Only update if we have fields to update
      if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase
          .from('job_orders')
          .update(dbUpdates)
          .eq('id', jobId);
        
        if (error) {
          console.error('Error updating job in database:', error);
        } else {
          console.log('✅ Job updated successfully in database');
        }
      }
    } catch (error) {
      console.error('Exception updating job in database:', error);
    }
  };



  const renameJob = async (jobId: string, newTitle: string) => {
    // Note: job_orders table only stores job order questions/notes, not job details
    // Only update title if it exists in the table
    try {
      await supabase
        .from('job_orders')
        .update({ job_title: newTitle })
        .eq('id', jobId);
    } catch (error) {
      console.error('Error renaming job in database:', error);
    }
    
    // Update in state
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, title: newTitle } : job
    ));
  };

  
  const duplicateJob = async (jobId: string) => {
    const jobToDuplicate = jobs.find(job => job.id === jobId);
    if (jobToDuplicate) {
      const duplicatedJob: Job = {
        ...jobToDuplicate,
        id: crypto.randomUUID(),
        title: `${jobToDuplicate.title} (Copy)`,
        createdAt: new Date(),
      };
      
      // Note: job_orders table only stores job order questions/notes, not job details
      // Job details are stored in memory/localStorage only
      
      // Update state
      setJobs(prev => [...prev, duplicatedJob]);
    }
  };


  const deleteJob = async (jobId: string) => {
    // Delete from database
    try {
      await supabase
        .from('job_orders')
        .delete()
        .eq('id', jobId);
    } catch (error) {
      console.error('Error deleting job from database:', error);
    }
    
    // Update state
    setJobs(prev => prev.filter(job => job.id !== jobId));
    
    // If the deleted job was the current job, clear it
    if (currentJob?.id === jobId) {
      setCurrentJob(null);
    }
  };

  const toggleJobActive = async (jobId: string) => {
    // Note: job_orders table doesn't have is_active column
    // Only update state
    const job = jobs.find(j => j.id === jobId);
    const newActiveState = !(job?.isActive ?? true);
    
    // Update state
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, isActive: newActiveState } : job
    ));
  };


  const updateJob = async (jobId: string, updates: Partial<Job>) => {
    // Note: job_orders table only stores job order questions/notes, not job details
    // Job details are stored in memory/localStorage only
    // Only update title/company if they exist in the table
    try {
      const dbUpdates: any = {};
      if (updates.title) {
        dbUpdates.job_title = updates.title;
      }
      if (updates.company) {
        dbUpdates.company = updates.company;
      }
      
      // Only update if we have fields to update
      if (Object.keys(dbUpdates).length > 0) {
        await supabase
          .from('job_orders')
          .update(dbUpdates)
          .eq('id', jobId);
      }
    } catch (error) {
      console.error('Error updating job in database:', error);
    }
    
    // Update state with all fields
    setJobs(prev => prev.map(job => 
      job.id === jobId ? { ...job, ...updates } : job
    ));
  };

  const reorderJobs = (reorderedJobs: Job[]) => {
    // Update the jobs state with the new order
    setJobs(reorderedJobs);
    
    // Optionally, you could save the order to localStorage or database
    // For now, just updating the state will maintain the order during the session
    console.log('Jobs reordered successfully');
  };


  return (
    <CallPromptContext.Provider value={{
      jobs,
      currentJob,
      currentCall,
      lastCall,
      isAnalyzing,
      setAnalyzing,
      addJob,
      setCurrentJob,
      startCall,
      endCall,
      updateJobWisdom,
      renameJob,
      duplicateJob,
      deleteJob,
      toggleJobActive,
      updateJob,
      reorderJobs,
    }}>
      {children}
    </CallPromptContext.Provider>
  );
};