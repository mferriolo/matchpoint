import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, RefreshCw, Save, Sparkles, Trash2, Edit, Copy, ExternalLink } from 'lucide-react';
import { Job } from '@/types/callprompt';
import { useChatGPT } from '@/hooks/useChatGPT';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { JOB_ORDER_QUESTIONS } from '@/utils/jobOrderQuestions';
import SmartJobUpdate from '@/components/SmartJobUpdate';


interface JobOrderProps {
  job: Job;
}

interface JobOrderData {
  timingQuestions: { [key: string]: string };
  jobQuestions: { [key: string]: string };
  companyQuestions: { [key: string]: string };
  hiringQuestions: { [key: string]: string };
  timingNotes: string;
  jobNotes: string;
  companyNotes: string;
  hiringNotes: string;
  unansweredQuestions: {
    timing: string[];
    job: string[];
    company: string[];
    hiring: string[];
    insightful: string[];
  };
}

const JobOrder: React.FC<JobOrderProps> = ({ job }) => {
  const { callChatGPT, loading, generateGapQuestions } = useChatGPT();
  const { toast } = useToast();
  const [hasGenerated, setHasGenerated] = useState(false);
  const [canGenerate, setCanGenerate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [googleDocUrl, setGoogleDocUrl] = useState<string>('');
  const [hasExported, setHasExported] = useState(false);

  const [jobOrderData, setJobOrderData] = useState<JobOrderData>({
    timingQuestions: {},
    jobQuestions: {},
    companyQuestions: {},
    hiringQuestions: {},
    timingNotes: '',
    jobNotes: '',
    companyNotes: '',
    hiringNotes: '',
    unansweredQuestions: {
      timing: [],
      job: [],
      company: [],
      hiring: [],
      insightful: []
    }
  });

  
  const [jobQuestionsList, setJobQuestionsList] = useState(() => {
    const baseQuestions = [
      'Is there mandatory overtime or \'On-Call\' Hours? If so, what does it look like?',
      'What is the title of the position?',
      'What are the primary responsibilities?',
      'What is the schedule for this role?',
      'Is this a remote, hybrid, or onsite position?',
      'What qualifications are preferred?',
      'What is the compensation structure?',
      'Are there travel requirements?',
      'How many direct reports (if any)?',
      // Requirement Questions
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
    ];
    
    // Add empty slots to reach 42 total questions
    const totalJobQuestions = 42;
    while (baseQuestions.length < totalJobQuestions - 1) { // -1 for NOTES
      baseQuestions.push('');
    }
    
    // Add job type specific questions before NOTES
    if (job.jobType && JOB_ORDER_QUESTIONS[job.jobType]) {
      const jobTypeQuestions = JOB_ORDER_QUESTIONS[job.jobType];
      // Replace empty slots with job type questions
      let emptyIndex = baseQuestions.findIndex(q => q === '');
      for (const question of jobTypeQuestions) {
        if (emptyIndex !== -1) {
          baseQuestions[emptyIndex] = question;
          emptyIndex = baseQuestions.findIndex(q => q === '');
        }
      }
    }
    
    baseQuestions.push('NOTES');
    return baseQuestions.filter(q => q !== ''); // Remove any remaining empty slots
  });

  const [timingQuestionsList, setTimingQuestionsList] = useState(() => {
    const baseQuestions = [
      'What is the target start date, and what happens if the hire is delayed?',
      'Where are you in the hiring process now, and what challenges have you faced so far?',
      'What is driving the urgency to fill this role?',
      'Who is covering the work currently, and how is that affecting the organization?',
      'What does your candidate pipeline look like (resources used, people interviewed, viability, and any declined offers)?'
    ];
    
    baseQuestions.push('NOTES');
    return baseQuestions;
  });



  const [companyQuestionsList, setCompanyQuestionsList] = useState(() => {
    const baseQuestions = [
      'What is the size and scope of the organization?',
      'What services or specialties does the organization provide?',
      'What is the company\'s mission or core values?',
      'What makes the organization unique or attractive to candidates?',
      'Are there any growth plans or recent milestones to share?'
    ];
    
    // Add empty slots to reach 10 total questions
    const totalCompanyQuestions = 10;
    while (baseQuestions.length < totalCompanyQuestions - 1) { // -1 for NOTES
      baseQuestions.push('');
    }
    
    baseQuestions.push('NOTES');
    return baseQuestions.filter(q => q !== ''); // Remove any remaining empty slots
  });

  const [hiringQuestionsList, setHiringQuestionsList] = useState(() => {
    const baseQuestions = [
      'What is the hiring timeline?',
      'What are the interview stages?',
      'Who will be involved in the interview process (names and titles)?',
      'How will interviews be conducted (e.g., phone, video, in-person)?',
      // Removed: 'What is the target start date?',
      'Who is the final decision maker?',
      // Removed: 'Is there a backup candidate process?'
    ];
    
    // Add empty slots to reach 12 total questions
    const totalHiringQuestions = 12;
    while (baseQuestions.length < totalHiringQuestions - 1) { // -1 for NOTES
      baseQuestions.push('');
    }
    
    baseQuestions.push('NOTES');
    return baseQuestions.filter(q => q !== ''); // Remove any remaining empty slots
  });

  useEffect(() => {
    // Load from localStorage first, then from database
    const loadData = async () => {
      console.log('JobOrder: Loading data for job', job.id);
      
      // First check if generation is in progress
      const generationInProgress = localStorage.getItem(`jobOrderGenerating_${job.id}`);
      if (generationInProgress) {
        console.log('JobOrder: Generation is in progress, waiting...');
        setHasGenerated(false); // Don't allow regeneration while generating
        setCanGenerate(false);
        
        // Poll for completion
        let pollCount = 0;
        const maxPolls = 60; // Poll for up to 60 seconds
        const pollInterval = setInterval(() => {
          const checkData = localStorage.getItem(`jobOrder_${job.id}`);
          const stillGenerating = localStorage.getItem(`jobOrderGenerating_${job.id}`);
          
          pollCount++;
          
          if (checkData && !stillGenerating) {
            console.log('JobOrder: Generation completed, loading data');
            clearInterval(pollInterval);
            try {
              const parsed = JSON.parse(checkData);
              setJobOrderData(parsed);
              
              // Load question lists if they exist in localStorage
              if (parsed.timingQuestionsList) setTimingQuestionsList(parsed.timingQuestionsList);
              if (parsed.jobQuestionsList) setJobQuestionsList(parsed.jobQuestionsList);
              if (parsed.companyQuestionsList) setCompanyQuestionsList(parsed.companyQuestionsList);
              if (parsed.hiringQuestionsList) setHiringQuestionsList(parsed.hiringQuestionsList);
              
              setHasGenerated(true);
              setCanGenerate(true);
            } catch (error) {
              console.error('Error parsing job order data:', error);
              setCanGenerate(true);
            }
          } else if (pollCount >= maxPolls) {
            console.log('JobOrder: Polling timeout, generation may have failed');
            clearInterval(pollInterval);
            localStorage.removeItem(`jobOrderGenerating_${job.id}`);
            setCanGenerate(true);
            // Don't auto-generate here, let user manually trigger if needed
          }
        }, 1000);
        
        return; // Exit early while polling
      }
      
      // Check localStorage for existing data
      const savedData = localStorage.getItem(`jobOrder_${job.id}`);
      let hasExistingData = false;
      
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          // Check if we have actual data (not just empty objects)
          const hasTimingData = parsed.timingQuestions && Object.keys(parsed.timingQuestions).length > 0;
          const hasJobData = parsed.jobQuestions && Object.keys(parsed.jobQuestions).length > 0;
          const hasCompanyData = parsed.companyQuestions && Object.keys(parsed.companyQuestions).length > 0;
          const hasHiringData = parsed.hiringQuestions && Object.keys(parsed.hiringQuestions).length > 0;
          
          // Even if we don't have answers, if we have the structure, it means generation was attempted
          if (hasTimingData || hasJobData || hasCompanyData || hasHiringData || 
              (parsed.timingQuestions !== undefined && parsed.jobQuestions !== undefined)) {
            setJobOrderData(parsed);
            
            // CRITICAL: Load question lists from localStorage to preserve deletions
            if (parsed.timingQuestionsList) {
              console.log('Loading timing questions list from localStorage:', parsed.timingQuestionsList);
              setTimingQuestionsList(parsed.timingQuestionsList);
            }
            if (parsed.jobQuestionsList) {
              console.log('Loading job questions list from localStorage:', parsed.jobQuestionsList);
              setJobQuestionsList(parsed.jobQuestionsList);
            }
            if (parsed.companyQuestionsList) {
              console.log('Loading company questions list from localStorage:', parsed.companyQuestionsList);
              setCompanyQuestionsList(parsed.companyQuestionsList);
            }
            if (parsed.hiringQuestionsList) {
              console.log('Loading hiring questions list from localStorage:', parsed.hiringQuestionsList);
              setHiringQuestionsList(parsed.hiringQuestionsList);
            }
            
            setHasGenerated(true);
            hasExistingData = true;
            console.log('JobOrder: Loaded existing data from localStorage');
            
            // Google Doc URL no longer stored - user can search in Drive

          }
        } catch (error) {
          console.error('Error loading from localStorage:', error);
        }
      }
      
      // Then check database if no localStorage data
      if (!hasExistingData) {
        console.log('JobOrder: No localStorage data, checking database...');
        try {
          const { data, error } = await supabase.functions.invoke('load-job-order', {
            body: { jobId: job.id },
          });

          if (!error && data?.success && data.data) {
            const savedData = data.data;
            const timingQuestions = savedData.timing_questions || {};
            const jobQuestions = savedData.job_questions || {};
            const companyQuestions = savedData.company_questions || {};
            const hiringQuestions = savedData.hiring_questions || {};
            
            // Check if we have actual data
            if (Object.keys(timingQuestions).length > 0 || 
                Object.keys(jobQuestions).length > 0 || 
                Object.keys(companyQuestions).length > 0 || 
                Object.keys(hiringQuestions).length > 0) {
              
              hasExistingData = true;
              setHasGenerated(true);
              console.log('JobOrder: Loaded data from database');
              
              const timingUnanswered = timingQuestionsList.filter(q => !timingQuestions[q] || (typeof timingQuestions[q] === 'string' && (timingQuestions[q].trim() === '' || timingQuestions[q] === 'Not Specified')));
              const jobUnanswered = jobQuestionsList.filter(q => !jobQuestions[q] || (typeof jobQuestions[q] === 'string' && (jobQuestions[q].trim() === '' || jobQuestions[q] === 'Not Specified')));
              const companyUnanswered = companyQuestionsList.filter(q => !companyQuestions[q] || (typeof companyQuestions[q] === 'string' && (companyQuestions[q].trim() === '' || companyQuestions[q] === 'Not Specified')));
              const hiringUnanswered = hiringQuestionsList.filter(q => !hiringQuestions[q] || (typeof hiringQuestions[q] === 'string' && (hiringQuestions[q].trim() === '' || hiringQuestions[q] === 'Not Specified')));
              
              const loadedData = {
                timingQuestions,
                jobQuestions,
                companyQuestions,
                hiringQuestions,
                timingNotes: savedData.timing_notes || '',
                jobNotes: savedData.job_notes || '',
                companyNotes: savedData.company_notes || '',
                hiringNotes: savedData.hiring_notes || '',
                unansweredQuestions: savedData.unanswered_questions || {
                  timing: timingUnanswered,
                  job: jobUnanswered,
                  company: companyUnanswered,
                  hiring: hiringUnanswered,
                  insightful: []
                },
                // Include question lists in the data structure
                timingQuestionsList: timingQuestionsList,
                jobQuestionsList: jobQuestionsList,
                companyQuestionsList: companyQuestionsList,
                hiringQuestionsList: hiringQuestionsList
              };
              
              setJobOrderData(loadedData);
              
              // Save to localStorage for faster access next time
              localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(loadedData));
              
              // Google Doc URL no longer stored - user can search in Drive

            }
          }
        } catch (error) {
          console.error('Error loading job order from database:', error);
        }
      }
      
      // If still no data, show message that generation is needed
      if (!hasExistingData) {
        console.log('JobOrder: No existing data found');
        setHasGenerated(false);
        setCanGenerate(true);
      }
    };
    
    loadData();
  }, [job.id]);



  const generateJobOrder = async () => {

    // Remove the check that prevents regeneration
    
    setHasGenerated(true);
    toast({
      description: "Analyzing job data with ChatGPT...",
    });

    try {
      const prompt = `Analyze this job and provide structured answers in JSON format. 

Job Title: ${job.title}
Company: ${job.company}
Description: ${job.description || 'Not provided'}
Location: ${job.location || 'Not specified'}

Please analyze this job information and provide answers to the following questions in JSON format:

{
  "jobQuestions": {
    "Is there mandatory overtime or 'On-Call' Hours? If so, what does it look like?": "answer here or Not Specified",
    "What is the title of the position?": "${job.title || 'Not Specified'}",
    "What are the primary responsibilities?": "answer here or Not Specified",
    "What is the schedule for this role?": "answer here or Not Specified",
    "Is this a remote, hybrid, or onsite position?": "answer here or Not Specified",
    "What qualifications are preferred?": "answer here or Not Specified",
    "What is the compensation structure?": "answer here or Not Specified",
    "Are there travel requirements?": "answer here or Not Specified",
    "How many direct reports (if any)?": "answer here or Not Specified",
    "What state license(s) are required, and will you consider candidates with licenses in process?": "answer here or Not Specified",
    "Is board certification required or preferred, and in which specialty?": "answer here or Not Specified",
    "Are DEA, CSR, or other controlled-substance registrations required?": "answer here or Not Specified",
    "What is the minimum education level needed for this role?": "answer here or Not Specified",
    "Are there required or preferred training pathways (residency, fellowship, specialty program)?": "answer here or Not Specified",
    "How many years of relevant experience are required or preferred?": "answer here or Not Specified",
    "Which clinical settings must candidates have experience in (hospital, clinic, SNF, home health, private practice, etc.)?": "answer here or Not Specified",
    "Is experience with any specific patient population required (pediatric, geriatric, medically complex, behavioral health, etc.)?": "answer here or Not Specified",
    "Is supervisory or leadership experience required or preferred?": "answer here or Not Specified",
    "Are there required EMR/EHR systems candidates must know?": "answer here or Not Specified",
    "Are there specific clinical skills or procedures candidates must be able to perform?": "answer here or Not Specified",
    "What background checks are required (state, FBI, OIG, references)?": "answer here or Not Specified",
    "Are there immunization or health screening requirements (vaccines, TB, titers)?": "answer here or Not Specified",
    "What malpractice history is acceptable for this role?": "answer here or Not Specified",
    "NOTES": "any additional relevant notes"
  },
  "timingQuestions": {
    "What is the target start date, and what happens if the hire is delayed?": "Not Specified",
    "Where are you in the hiring process now, and what challenges have you faced so far?": "Not Specified",
    "What is driving the urgency to fill this role?": "Not Specified",
    "Who is covering the work currently, and how is that affecting the organization?": "Not Specified",
    "What does your candidate pipeline look like (resources used, people interviewed, viability, and any declined offers)?": "Not Specified",
    "NOTES": ""
  },

  "companyQuestions": {
    "What is the size and scope of the organization?": "answer here or Not Specified",
    "What services or specialties does the organization provide?": "answer here or Not Specified",
    "What is the company's mission or core values?": "answer here or Not Specified",
    "What makes the organization unique or attractive to candidates?": "answer here or Not Specified",
    "Are there any growth plans or recent milestones to share?": "answer here or Not Specified",
    "NOTES": "any additional relevant notes"
  },
  "hiringQuestions": {
    "What is the hiring timeline?": "Not Specified",
    "What are the interview stages?": "Not Specified",
    "Who will be involved in the interview process (names and titles)?": "Not Specified",
    "How will interviews be conducted (e.g., phone, video, in-person)?": "Not Specified",
    "Who is the final decision maker?": "Not Specified",
    "NOTES": "any additional relevant notes"
  },
  "timingNotes": "",
  "jobNotes": "Additional notes about the job",
  "companyNotes": "Additional notes about the company", 
  "hiringNotes": "Additional notes about the hiring process"
}

Provide only the JSON response with actual answers based on the job information provided. Use "Not Specified" for questions that cannot be answered from the available information.`;



      const result = await callChatGPT('analyze_job', { prompt });
      
      if (result?.content) {
        let cleanContent = result.content.trim();
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        const jsonStart = cleanContent.indexOf('{');
        const jsonEnd = cleanContent.lastIndexOf('}') + 1;
        
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          cleanContent = cleanContent.substring(jsonStart, jsonEnd);
        }
        
        const parsed = JSON.parse(cleanContent);
        
        const jobUnanswered = jobQuestionsList.filter(q => !parsed.jobQuestions?.[q] || (typeof parsed.jobQuestions[q] === 'string' && (parsed.jobQuestions[q].trim() === '' || parsed.jobQuestions[q].trim() === 'Not Specified')));
        const companyUnanswered = companyQuestionsList.filter(q => !parsed.companyQuestions?.[q] || (typeof parsed.companyQuestions[q] === 'string' && (parsed.companyQuestions[q].trim() === '' || parsed.companyQuestions[q].trim() === 'Not Specified')));
        const hiringUnanswered = hiringQuestionsList.filter(q => !parsed.hiringQuestions?.[q] || (typeof parsed.hiringQuestions[q] === 'string' && (parsed.hiringQuestions[q].trim() === '' || parsed.hiringQuestions[q].trim() === 'Not Specified')));
        
        const newJobOrderData = {
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
            insightful: jobOrderData.unansweredQuestions.insightful
          }
        };
        setJobOrderData(newJobOrderData);
        
        // Save to localStorage for persistence across tab switches
        localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(newJobOrderData));
        
        toast({
          title: "Job Order Generated",
          description: `Successfully analyzed job data.`,
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error generating job order:', error);
      toast({
        title: "Error Generating Job Order",
        description: "Failed to analyze job data. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRegenerate = async () => {
    // Clear the hasGenerated flag to allow regeneration
    setHasGenerated(false);
    setCanGenerate(true);
    
    // Clear existing data
    const clearedData = {
      timingQuestions: {},
      jobQuestions: {},
      companyQuestions: {},
      hiringQuestions: {},
      timingNotes: '',
      jobNotes: '',
      companyNotes: '',
      hiringNotes: '',
      unansweredQuestions: {
        timing: [],
        job: [],
        company: [],
        hiring: [],
        insightful: []
      }
    };
    
    setJobOrderData(clearedData);
    localStorage.removeItem(`jobOrder_${job.id}`);
    
    // Now generate fresh data
    await generateJobOrder();
  };

  // New comprehensive save function for the Save Job Order button
  const handleSaveJobOrder = async () => {
    try {
      setIsSaving(true);
      
      console.log('=== STARTING JOB ORDER SAVE ===');
      console.log('Job ID:', job.id);
      
      // IMPORTANT: Declare all variables at the top before using them
      // Collect timing questions
      const timingQuestionsData = timingQuestionsList || [];
      
      // Collect job questions  
      const jobQuestionsData = jobQuestionsList || [];
      
      // Collect company questions
      const companyQuestionsData = companyQuestionsList || [];
      
      // Collect hiring questions
      const hiringQuestionsData = hiringQuestionsList || [];
      
      console.log('Number of timing questions:', timingQuestionsData.length);
      console.log('Number of job questions:', jobQuestionsData.length);
      console.log('Number of company questions:', companyQuestionsData.length);
      console.log('Number of hiring questions:', hiringQuestionsData.length);
      
      // Now create the job order data object
      const saveData = {
        questions: [
          // Timing questions
          ...timingQuestionsData.map((q, index) => ({
            id: `timing_${index}`,
            text: q,
            answer: jobOrderData.timingQuestions[q] || '',
            section: 'timing',
            order: index
          })),
          // Job questions
          ...jobQuestionsData.map((q, index) => ({
            id: `job_${index}`,
            text: q,
            answer: jobOrderData.jobQuestions[q] || '',
            section: 'job',
            order: index
          })),
          // Company questions
          ...companyQuestionsData.map((q, index) => ({
            id: `company_${index}`,
            text: q,
            answer: jobOrderData.companyQuestions[q] || '',
            section: 'company',
            order: index
          })),
          // Hiring questions
          ...hiringQuestionsData.map((q, index) => ({
            id: `hiring_${index}`,
            text: q,
            answer: jobOrderData.hiringQuestions[q] || '',
            section: 'hiring',
            order: index
          }))
        ],
        savedAt: new Date().toISOString()
      };
      
      console.log('Job order data prepared');
      console.log('Total questions to save:', saveData.questions.length);
      
      console.log('Attempting to update job_orders table with id:', job.id);
      
      // Save to job_orders table
      const { data, error } = await supabase
        .from('job_orders')
        .update({ 
          job_questions: saveData,
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)
        .select();
      
      console.log('Update response - data:', data);
      console.log('Update response - error:', error);
      
      if (error) {
        console.error('Database error:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        throw new Error('No record was updated');
      }
      
      console.log('=== SAVE SUCCESSFUL ===');
      
      // Also save to localStorage
      saveToLocalStorage(jobOrderData);
      
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      
      toast({
        title: "✓ Job Order Saved",
        description: "All questions and answers have been saved successfully.",
      });
      
    } catch (error) {
      console.error('=== SAVE FAILED ===');
      console.error('Error:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      // Show a detailed error message
      const errorMsg = error?.message || 'Unknown error';
      toast({
        title: "Save Failed",
        description: `Failed to save: ${errorMsg}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const dataToSave = {
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        timingQuestions: jobOrderData.timingQuestions,
        jobQuestions: jobOrderData.jobQuestions,
        companyQuestions: jobOrderData.companyQuestions,
        hiringQuestions: jobOrderData.hiringQuestions,
        timingNotes: jobOrderData.timingNotes,
        jobNotes: jobOrderData.jobNotes,
        companyNotes: jobOrderData.companyNotes,
        hiringNotes: jobOrderData.hiringNotes,
        unansweredQuestions: jobOrderData.unansweredQuestions,
        summary: job.summary || '',
        activeQuestions: [
          ...timingQuestionsList,
          ...jobQuestionsList,
          ...companyQuestionsList,
          ...hiringQuestionsList
        ],
        googleDocUrl: googleDocUrl || ''
      };

      const { data, error } = await supabase.functions.invoke('save-job-order', {
        body: dataToSave,
      });

      if (error) throw error;

      if (data?.success) {
        // Also save to localStorage with question lists
        saveToLocalStorage(jobOrderData);
        
        toast({
          title: "Changes Saved Successfully",
          description: "Job Order changes have been saved to database.",
        });
      } else {
        throw new Error(data?.error || 'Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving job order:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };



  const handleExportJobOrder = async () => {
    console.log('=== EXPORTING JOB ORDER TO GOOGLE DOC ===');
    console.log('Job ID:', job.id);
    
    setIsExporting(true);
    try {
      // Prepare the job order data for export with field format
      const exportData = {
        jobTitle: job.title,
        company: job.company,
        jobId: job.id,
        clientContactFirstName: job.clientContactFirstName || '',
        clientContactLastName: job.clientContactLastName || '',
      };

      // Section 1: Timing Questions
      timingQuestionsList.forEach((question, index) => {
        if (question !== 'NOTES') {
          const questionIndex = index + 1;
          exportData[`S1Q${questionIndex}`] = question;
          const answer = jobOrderData.timingQuestions[question];
          exportData[`s1a${questionIndex}`] = (answer === 'Not Specified' || !answer) ? '' : answer;
        }
      });

      // Section 2: Job Questions  
      jobQuestionsList.forEach((question, index) => {
        if (question !== 'NOTES') {
          const questionIndex = index + 1;
          exportData[`S2Q${questionIndex}`] = question;
          const answer = jobOrderData.jobQuestions[question];
          exportData[`s2a${questionIndex}`] = (answer === 'Not Specified' || !answer) ? '' : answer;
        }
      });

      // Section 3: Company Questions
      companyQuestionsList.forEach((question, index) => {
        if (question !== 'NOTES') {
          const questionIndex = index + 1;
          exportData[`S3Q${questionIndex}`] = question;
          const answer = jobOrderData.companyQuestions[question];
          exportData[`s3a${questionIndex}`] = (answer === 'Not Specified' || !answer) ? '' : answer;
        }
      });

      // Section 4: Hiring Questions
      hiringQuestionsList.forEach((question, index) => {
        if (question !== 'NOTES') {
          const questionIndex = index + 1;
          exportData[`S4Q${questionIndex}`] = question;
          const answer = jobOrderData.hiringQuestions[question];
          exportData[`s4a${questionIndex}`] = (answer === 'Not Specified' || !answer) ? '' : answer;
        }
      });

      // Add notes for each section
      exportData['S1_NOTES'] = jobOrderData.timingNotes || '';
      exportData['S2_NOTES'] = jobOrderData.jobNotes || '';
      exportData['S3_NOTES'] = jobOrderData.companyNotes || '';
      exportData['S4_NOTES'] = jobOrderData.hiringNotes || '';

      console.log('Sending job order data to Zapier:', exportData);

      // Send to Zapier webhook for Google Doc creation
      const response = await fetch('https://hooks.zapier.com/hooks/catch/9770/udc5oye/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData),
        mode: 'no-cors', // Add this to handle CORS issues
      });

      console.log('Zapier webhook sent successfully');

      // Save the job order to database first
      await supabase.functions.invoke('save-job-order', {
        body: {
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          timingQuestions: jobOrderData.timingQuestions,
          jobQuestions: jobOrderData.jobQuestions,
          companyQuestions: jobOrderData.companyQuestions,
          hiringQuestions: jobOrderData.hiringQuestions,
          timingNotes: jobOrderData.timingNotes,
          jobNotes: jobOrderData.jobNotes,
          companyNotes: jobOrderData.companyNotes,
          hiringNotes: jobOrderData.hiringNotes,
          unansweredQuestions: jobOrderData.unansweredQuestions,
        },
      });

      toast({
        title: "Job Order Exported",
        description: "Job order has been sent to Google Docs. Fetching document URL...",
        duration: 3000,
      });

      // Wait 5 seconds for Zapier to create the doc
      console.log('Waiting for Google Doc to be created...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Now fetch the Google Doc URL using the new edge function
      console.log('Fetching doc URL from Google Drive...');
      
      try {
        const { data: docData, error: docError } = await supabase.functions.invoke('get-google-doc-url', {
          body: {
            jobTitle: job.title,
            company: job.company,
            jobId: job.id
          }
        });

        console.log('get-google-doc-url response:', docData, docError);

        if (!docError && docData?.url) {
          console.log('✅ Google Doc URL captured:', docData.url);
          setGoogleDocUrl(docData.url);
          setHasExported(true);
          
          // Update localStorage
          const currentLocalStorageData = localStorage.getItem(`jobOrder_${job.id}`);
          let updatedData = jobOrderData;
          if (currentLocalStorageData) {
            try {
              updatedData = JSON.parse(currentLocalStorageData);
            } catch (e) {
              console.error('Error parsing localStorage data:', e);
            }
          }
          updatedData.googleDocUrl = docData.url;
          localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
          
          toast({
            title: "✅ Document Ready",
            description: "Google Doc has been created and is ready to view!",
            duration: 5000,
          });
        } else {
          // If the edge function didn't find it, fall back to polling
          console.log('Edge function did not return URL, falling back to polling...');
          startPollingForUrl();
        }
      } catch (error) {
        console.error('Error calling get-google-doc-url:', error);
        // Fall back to polling
        startPollingForUrl();
      }

    } catch (error) {
      console.error('Error exporting job order:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export job order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Separate polling function for fallback
  const startPollingForUrl = () => {
    console.log('Starting polling for Google Doc URL...');
    let pollCount = 0;
    const maxPolls = 20; // Poll for up to 60 seconds (3 seconds * 20)
    
    const pollForUrl = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('load-job-order', {
          body: { jobId: job.id },
        });

        if (!error && data?.success && data.data) {
          const docUrl = data.data.google_doc_url || data.data.website || data.data.googleDocUrl;
          if (docUrl && docUrl.trim() !== '') {
            console.log('Found Google Doc URL from polling:', docUrl);
            
            // Save the URL to the database
            const { error: updateError } = await supabase
              .from('job_orders')
              .update({ 
                google_doc_url: docUrl 
              })
              .eq('id', job.id);
            
            if (updateError) {
              console.error('Failed to save Google Doc URL:', updateError);
            } else {
              console.log('✅ Google Doc URL saved to database');
            }
            
            setGoogleDocUrl(docUrl);
            setHasExported(true);
            
            // Update localStorage
            const currentLocalStorageData = localStorage.getItem(`jobOrder_${job.id}`);
            let updatedData = jobOrderData;
            if (currentLocalStorageData) {
              try {
                updatedData = JSON.parse(currentLocalStorageData);
              } catch (e) {
                console.error('Error parsing localStorage data:', e);
              }
            }
            updatedData.googleDocUrl = docUrl;
            localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
            
            toast({
              title: "Document Ready",
              description: "Google Doc has been created and is ready to view.",
              duration: 3000,
            });
            return;
          }
        }

        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(pollForUrl, 3000); // Poll every 3 seconds
        } else {
          console.log('Polling timeout - Google Doc URL not found');
          toast({
            title: "Document Processing",
            description: "Document is still being processed. Please check back in a few minutes.",
            duration: 5000,
          });
        }
      } catch (error) {
        console.error('Error polling for Google Doc URL:', error);
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(pollForUrl, 3000);
        }
      }
    };

    // Start polling
    pollForUrl();
  };


  const handleGenerateGapQuestions = async () => {
    setIsGeneratingInsight(true);
    try {
      const result = await generateGapQuestions(job);
      
      if (result) {
        const questions = result.split('\n')
          .filter(line => line.trim() && /^\d+\./.test(line.trim()))
          .map(line => line.replace(/^\d+\.\s*/, '').trim())
        
        if (questions.length > 0) {
          // Add gap questions to the job questions section with "Not Specified" answers
          const updatedJobQuestions = { ...jobOrderData.jobQuestions };
          questions.forEach(question => {
            updatedJobQuestions[question] = 'Not Specified';
          });

          // Update the job questions list to include the new questions
          const updatedJobQuestionsList = [...jobQuestionsList];
          questions.forEach(question => {
            if (!updatedJobQuestionsList.includes(question)) {
              updatedJobQuestionsList.splice(-1, 0, question); // Insert before NOTES
            }
          });

          setJobQuestionsList(updatedJobQuestionsList);

          const updatedData = {
            ...jobOrderData,
            jobQuestions: updatedJobQuestions,
            unansweredQuestions: {
              ...jobOrderData.unansweredQuestions,
              insightful: questions,
              job: [...jobOrderData.unansweredQuestions.job, ...questions]
            }
          };

          setJobOrderData(updatedData);
          
          // Save to localStorage to persist across tab switches
          localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
          toast({
            title: "Insight Questions Added",
            description: `Added ${questions.length} insightful questions to the job section.`,
          });
        }
      }
    } catch (error) {
      console.error('Error generating gap questions:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate insight questions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const saveToLocalStorage = (data: any) => {
    // Always include the current question lists when saving
    const dataWithLists = {
      ...data,
      timingQuestionsList,
      jobQuestionsList,
      companyQuestionsList,
      hiringQuestionsList
    };
    localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(dataWithLists));
    
    // Dispatch custom event to notify other components of the change
    console.log('JobOrder - Dispatching jobOrderUpdated event');
    window.dispatchEvent(new Event('jobOrderUpdated'));
  };

  // Handler for Smart Job Update - merges AI-analyzed updates into existing data
  const handleSmartUpdate = (updates: any) => {
    const updatedData = { ...jobOrderData };
    
    // Merge timing questions
    if (updates.timingQuestions) {
      Object.entries(updates.timingQuestions).forEach(([question, answer]) => {
        const existingAnswer = updatedData.timingQuestions[question];
        if (existingAnswer && existingAnswer !== 'Not Specified' && existingAnswer.trim() !== '') {
          updatedData.timingQuestions[question] = `${existingAnswer} | Additional: ${answer}`;
        } else {
          updatedData.timingQuestions[question] = answer as string;
        }
      });
    }
    
    // Merge job questions
    if (updates.jobQuestions) {
      Object.entries(updates.jobQuestions).forEach(([question, answer]) => {
        const existingAnswer = updatedData.jobQuestions[question];
        if (existingAnswer && existingAnswer !== 'Not Specified' && existingAnswer.trim() !== '') {
          updatedData.jobQuestions[question] = `${existingAnswer} | Additional: ${answer}`;
        } else {
          updatedData.jobQuestions[question] = answer as string;
        }
      });
    }
    
    // Merge company questions
    if (updates.companyQuestions) {
      Object.entries(updates.companyQuestions).forEach(([question, answer]) => {
        const existingAnswer = updatedData.companyQuestions[question];
        if (existingAnswer && existingAnswer !== 'Not Specified' && existingAnswer.trim() !== '') {
          updatedData.companyQuestions[question] = `${existingAnswer} | Additional: ${answer}`;
        } else {
          updatedData.companyQuestions[question] = answer as string;
        }
      });
    }
    
    // Merge hiring questions
    if (updates.hiringQuestions) {
      Object.entries(updates.hiringQuestions).forEach(([question, answer]) => {
        const existingAnswer = updatedData.hiringQuestions[question];
        if (existingAnswer && existingAnswer !== 'Not Specified' && existingAnswer.trim() !== '') {
          updatedData.hiringQuestions[question] = `${existingAnswer} | Additional: ${answer}`;
        } else {
          updatedData.hiringQuestions[question] = answer as string;
        }
      });
    }
    
    setJobOrderData(updatedData);
    saveToLocalStorage(updatedData);
    setHasUnsavedChanges(true);
  };



  const handleDeleteQuestion = (question: string, section: 'timing' | 'job' | 'company' | 'hiring') => {
    const updatedData = { ...jobOrderData };
    let updatedQuestionsList: string[] = [];
    
    // Remove from answers and update question lists
    switch (section) {
      case 'timing':
        delete updatedData.timingQuestions[question];
        updatedQuestionsList = timingQuestionsList.filter(q => q !== question);
        setTimingQuestionsList(updatedQuestionsList);
        break;
      case 'job':
        delete updatedData.jobQuestions[question];
        // If it's an insightful question, remove from insightful list too
        if (updatedData.unansweredQuestions.insightful.includes(question)) {
          updatedData.unansweredQuestions.insightful = updatedData.unansweredQuestions.insightful.filter(q => q !== question);
        }
        // Update job questions list
        updatedQuestionsList = jobQuestionsList.filter(q => q !== question);
        setJobQuestionsList(updatedQuestionsList);
        break;
      case 'company':
        delete updatedData.companyQuestions[question];
        updatedQuestionsList = companyQuestionsList.filter(q => q !== question);
        setCompanyQuestionsList(updatedQuestionsList);
        break;
      case 'hiring':
        delete updatedData.hiringQuestions[question];
        updatedQuestionsList = hiringQuestionsList.filter(q => q !== question);
        setHiringQuestionsList(updatedQuestionsList);
        break;
    }
    
    // Remove from unanswered questions
    updatedData.unansweredQuestions[section] = updatedData.unansweredQuestions[section].filter(q => q !== question);
    
    setJobOrderData(updatedData);
    
    // Save with updated question lists
    saveToLocalStorage(updatedData);
    
    toast({
      title: "Question Deleted",
      description: "Question has been removed from the job order.",
    });
  };

  const handleEditQuestion = (question: string, section: 'timing' | 'job' | 'company' | 'hiring') => {
    setEditingQuestion(question);
    setEditingValue(question); // Set to the question text instead of the answer
  };

  const handleSaveEdit = (question: string, section: 'timing' | 'job' | 'company' | 'hiring') => {
    const updatedData = { ...jobOrderData };
    
    // Update the question lists with the new question text
    switch (section) {
      case 'timing':
        const updatedTimingList = [...timingQuestionsList];
        const timingIndex = updatedTimingList.indexOf(question);
        if (timingIndex !== -1) {
          // Store the old answer if it exists
          const oldAnswer = updatedData.timingQuestions[question];
          // Remove the old question
          delete updatedData.timingQuestions[question];
          // Add the new question with the old answer
          updatedData.timingQuestions[editingValue] = oldAnswer || 'Not Specified';
          // Update the questions list
          updatedTimingList[timingIndex] = editingValue;
          setTimingQuestionsList(updatedTimingList);
        }
        break;
      case 'job':
        const updatedJobList = [...jobQuestionsList];
        const jobIndex = updatedJobList.indexOf(question);
        if (jobIndex !== -1) {
          // Store the old answer if it exists
          const oldAnswer = updatedData.jobQuestions[question];
          // Remove the old question
          delete updatedData.jobQuestions[question];
          // Add the new question with the old answer
          updatedData.jobQuestions[editingValue] = oldAnswer || 'Not Specified';
          // Update the questions list
          updatedJobList[jobIndex] = editingValue;
          setJobQuestionsList(updatedJobList);
        }
        break;
      case 'company':
        const updatedCompanyList = [...companyQuestionsList];
        const companyIndex = updatedCompanyList.indexOf(question);
        if (companyIndex !== -1) {
          // Store the old answer if it exists
          const oldAnswer = updatedData.companyQuestions[question];
          // Remove the old question
          delete updatedData.companyQuestions[question];
          // Add the new question with the old answer
          updatedData.companyQuestions[editingValue] = oldAnswer || 'Not Specified';
          // Update the questions list
          updatedCompanyList[companyIndex] = editingValue;
          setCompanyQuestionsList(updatedCompanyList);
        }
        break;
      case 'hiring':
        const updatedHiringList = [...hiringQuestionsList];
        const hiringIndex = updatedHiringList.indexOf(question);
        if (hiringIndex !== -1) {
          // Store the old answer if it exists
          const oldAnswer = updatedData.hiringQuestions[question];
          // Remove the old question
          delete updatedData.hiringQuestions[question];
          // Add the new question with the old answer
          updatedData.hiringQuestions[editingValue] = oldAnswer || 'Not Specified';
          // Update the questions list
          updatedHiringList[hiringIndex] = editingValue;
          setHiringQuestionsList(updatedHiringList);
        }
        break;
    }
    
    setJobOrderData(updatedData);
    saveToLocalStorage(updatedData);
    setEditingQuestion(null);
    setEditingValue('');
    
    toast({
      title: "Question Updated",
      description: "Question has been updated successfully.",
    });
  };


  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setEditingValue('');
  };

  const handleDuplicateQuestion = (question: string, section: 'timing' | 'job' | 'company' | 'hiring') => {
    const duplicatedQuestion = `${question} (Copy)`;
    const currentAnswer = getAnswerBySection(question, section);
    
    const updatedData = { ...jobOrderData };
    
    switch (section) {
      case 'timing':
        updatedData.timingQuestions[duplicatedQuestion] = currentAnswer || 'Not Specified';
        const updatedTimingList = [...timingQuestionsList];
        const timingIndex = updatedTimingList.indexOf(question);
        if (timingIndex !== -1) {
          updatedTimingList.splice(timingIndex + 1, 0, duplicatedQuestion);
          setTimingQuestionsList(updatedTimingList);
        }
        break;
      case 'job':
        updatedData.jobQuestions[duplicatedQuestion] = currentAnswer || 'Not Specified';
        const updatedJobQuestionsList = [...jobQuestionsList];
        const originalIndex = updatedJobQuestionsList.indexOf(question);
        if (originalIndex !== -1) {
          updatedJobQuestionsList.splice(originalIndex + 1, 0, duplicatedQuestion);
          setJobQuestionsList(updatedJobQuestionsList);
        }
        break;
      case 'company':
        updatedData.companyQuestions[duplicatedQuestion] = currentAnswer || 'Not Specified';
        const updatedCompanyList = [...companyQuestionsList];
        const companyIndex = updatedCompanyList.indexOf(question);
        if (companyIndex !== -1) {
          updatedCompanyList.splice(companyIndex + 1, 0, duplicatedQuestion);
          setCompanyQuestionsList(updatedCompanyList);
        }
        break;
      case 'hiring':
        updatedData.hiringQuestions[duplicatedQuestion] = currentAnswer || 'Not Specified';
        const updatedHiringList = [...hiringQuestionsList];
        const hiringIndex = updatedHiringList.indexOf(question);
        if (hiringIndex !== -1) {
          updatedHiringList.splice(hiringIndex + 1, 0, duplicatedQuestion);
          setHiringQuestionsList(updatedHiringList);
        }
        break;
    }
    
    setJobOrderData(updatedData);
    localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
    
    toast({
      title: "Question Duplicated",
      description: "Question has been duplicated successfully.",
    });
  };

  const handleMoveQuestion = (question: string, section: 'timing' | 'job' | 'company' | 'hiring', direction: 'up' | 'down') => {
    let questionsList: string[];
    let setQuestionsList: (questions: string[]) => void;
    
    switch (section) {
      case 'timing':
        questionsList = [...timingQuestionsList];
        setQuestionsList = setTimingQuestionsList;
        break;
      case 'job':
        questionsList = [...jobQuestionsList];
        setQuestionsList = setJobQuestionsList;
        break;
      case 'company':
        questionsList = [...companyQuestionsList];
        setQuestionsList = setCompanyQuestionsList;
        break;
      case 'hiring':
        questionsList = [...hiringQuestionsList];
        setQuestionsList = setHiringQuestionsList;
        break;
      default:
        return;
    }
    
    const currentIndex = questionsList.indexOf(question);
    if (currentIndex === -1) return;
    
    let newIndex: number;
    if (direction === 'up') {
      if (currentIndex === 0) return; // Already at top
      newIndex = currentIndex - 1;
    } else {
      if (currentIndex === questionsList.length - 1) return; // Already at bottom
      newIndex = currentIndex + 1;
    }
    
    // Don't allow moving past NOTES
    if (questionsList[newIndex] === 'NOTES' || question === 'NOTES') return;
    
    // Swap questions
    [questionsList[currentIndex], questionsList[newIndex]] = [questionsList[newIndex], questionsList[currentIndex]];
    
    setQuestionsList(questionsList);
    
    // Update localStorage
    const updatedData = { ...jobOrderData };
    setJobOrderData(updatedData);
    localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
    
    toast({
      title: "Question Reordered",
      description: `Question moved ${direction}.`,
    });
  };

  const getAnswerBySection = (question: string, section: 'timing' | 'job' | 'company' | 'hiring') => {
    switch (section) {
      case 'timing':
        return jobOrderData.timingQuestions[question];
      case 'job':
        return jobOrderData.jobQuestions[question];
      case 'company':
        return jobOrderData.companyQuestions[question];
      case 'hiring':
        return jobOrderData.hiringQuestions[question];
      default:
        return '';
    }
  };

  const isJobTypeSpecificQuestion = (question: string) => {
    return job.jobType && JOB_ORDER_QUESTIONS[job.jobType] && JOB_ORDER_QUESTIONS[job.jobType].includes(question);
  };

  const renderQuestionTableWithNotes = (title: string, questions: string[], answers: { [key: string]: string }, notes: string, onAnswerChange: (question: string, value: string) => void, section: 'timing' | 'job' | 'company' | 'hiring') => {
    const questionCount = questions.filter(q => q !== 'NOTES').length;
    return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-800 flex items-center justify-between">
          {title}
          <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">{questionCount}</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 p-3 text-left font-semibold">Question</th>
                <th className="border border-gray-300 p-3 text-left font-semibold">Answer</th>
              </tr>
            </thead>
            <tbody>
               {questions.map((question, index) => {
                const isJobTypeQuestion = isJobTypeSpecificQuestion(question);
                const isInsightfulQuestion = jobOrderData.unansweredQuestions.insightful.includes(question);
                const isFirstJobTypeQuestion = isJobTypeQuestion && index > 0 && !isJobTypeSpecificQuestion(questions[index - 1]);
                const isFirstInsightfulQuestion = isInsightfulQuestion && index > 0 && !jobOrderData.unansweredQuestions.insightful.includes(questions[index - 1]);
                const isNotesQuestion = question === 'NOTES';
                // Don't number NOTES questions
                const questionNumber = isNotesQuestion ? '' : `${index + 1 - questions.slice(0, index + 1).filter(q => q === 'NOTES').length}.`;
                const canDelete = question !== 'NOTES';
                const canEdit = question !== 'NOTES';
                const canDuplicate = question !== 'NOTES';
                return (
                  <React.Fragment key={index}>
                    {isFirstJobTypeQuestion && (
                      <tr>
                        <td colSpan={2} className="border border-gray-300 p-2 bg-yellow-50">
                          <div className="flex items-center text-sm text-gray-600">
                            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                              ℹ️ The following questions are specific to the {job.jobType} job type
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isFirstInsightfulQuestion && (
                      <tr>
                        <td colSpan={2} className="border border-gray-300 p-2 bg-orange-50">
                          <div className="flex items-center text-sm text-gray-600">
                            <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-medium">
                              🤖 The following questions are added by AI after analyzing the details we have to help you gain a deeper understanding of the job
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr className={index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}>
                       <td className={`border border-gray-300 p-3 font-medium w-1/2 ${
                         isInsightfulQuestion 
                           ? 'text-orange-700 bg-orange-50' 
                           : isJobTypeQuestion 
                           ? 'text-red-700' 
                           : 'text-gray-700'
                       }`} title={
                         isInsightfulQuestion 
                           ? 'Insightful Question' 
                           : isJobTypeQuestion 
                           ? 'Job Type Specific Question' 
                           : ''
                       }>
                         <div className="flex items-center gap-2">
                             {(canDelete || canEdit || canDuplicate) && (
                               <div className="flex gap-1">
                                 {canDelete && (
                                   <Button
                                     onClick={() => handleDeleteQuestion(question, section)}
                                     variant="ghost"
                                     size="sm"
                                     className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                     title="Delete Question"
                                   >
                                     <Trash2 className="h-3 w-3" />
                                   </Button>
                                 )}
                                 {canEdit && (
                                   <Button
                                     onClick={() => handleEditQuestion(question, section)}
                                     variant="ghost"
                                     size="sm"
                                     className="h-6 w-6 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                                     title="Edit Question"
                                   >
                                     <Edit className="h-3 w-3" />
                                   </Button>
                                 )}
                                 {canDuplicate && (
                                   <Button
                                     onClick={() => handleDuplicateQuestion(question, section)}
                                     variant="ghost"
                                     size="sm"
                                     className="h-6 w-6 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                                     title="Duplicate Question"
                                   >
                                     <Copy className="h-3 w-3" />
                                   </Button>
                                 )}
                               </div>
                               )}
                            <div>
                              {!isNotesQuestion && <span className="font-semibold mr-2">{questionNumber}</span>}
                             {editingQuestion === question ? (
                               <div className="flex items-center gap-2 mt-1">
                                   <textarea
                                     value={editingValue}
                                     onChange={(e) => setEditingValue(e.target.value)}
                                     className="flex-1 p-2 border border-gray-300 rounded text-sm min-w-[400px] w-full min-h-[120px] resize-y"
                                   onKeyPress={(e) => {
                                     if (e.key === 'Enter') {
                                       handleSaveEdit(question, section);
                                     } else if (e.key === 'Escape') {
                                       handleCancelEdit();
                                     }
                                   }}
                                   autoFocus
                                 />
                                 <Button
                                   onClick={() => handleSaveEdit(question, section)}
                                   variant="ghost"
                                   size="sm"
                                   className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                                   title="Save"
                                 >
                                   <Save className="h-3 w-3" />
                                 </Button>
                                 <Button
                                   onClick={handleCancelEdit}
                                   variant="ghost"
                                   size="sm"
                                   className="h-6 w-6 p-0 text-gray-500 hover:text-gray-700"
                                   title="Cancel"
                                 >
                                   ✕
                                 </Button>
                               </div>
                             ) : (
                               <span>{question}</span>
                             )}
                             {isInsightfulQuestion && (
                               <span className="ml-2 px-2 py-1 bg-orange-200 text-orange-800 text-xs rounded font-medium">
                                 Insightful
                               </span>
                             )}
                           </div>
                          </div>
                        </td>
                        <td className="border border-gray-300 p-3 text-gray-600">
                          {loading && hasGenerated ? (
                            'Thinking...'
                          ) : hasGenerated ? (
                             <textarea
                               value={answers[question] || 'Not Specified'}
                               onChange={(e) => onAnswerChange(question, e.target.value)}
                               className="w-full min-h-[120px] p-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                             />
                          ) : (
                            ''
                          )}
                         </td>
                     </tr>
                   </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <FileText className="mr-2 h-6 w-6" />
          Job Order
        </h2>
        <div className="flex gap-2">
          <Button 
            onClick={hasGenerated ? handleRegenerate : generateJobOrder} 
            disabled={loading}
            className={`flex items-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Generating...' : (hasGenerated ? 'Regenerate' : 'Generate')}
          </Button>
          <Button
            onClick={handleGenerateGapQuestions}
            disabled={isGeneratingInsight || !hasGenerated || loading}
            className={`flex items-center ${(!hasGenerated || loading) ? 'bg-gray-400 text-gray-600 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}
          >
            {isGeneratingInsight ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isGeneratingInsight ? 'Generating...' : 'Add Insight'}
          </Button>
          <Button 
            onClick={handleSaveJobOrder}
            disabled={isSaving || !hasGenerated}
            className={`flex items-center ${
              isSaving 
                ? 'bg-gray-400 cursor-not-allowed' 
                : hasGenerated
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-300 cursor-not-allowed text-gray-500'
            }`}
          >
            <Save className={`mr-2 h-4 w-4 ${isSaving ? 'animate-pulse' : ''}`} />
            {isSaving ? 'Saving...' : 'Save Job Order'}
          </Button>
        </div>
      </div>

      {renderQuestionTableWithNotes('1. Questions About Timing and Urgency', timingQuestionsList, jobOrderData.timingQuestions, jobOrderData.timingNotes, (question, value) => {
        const updatedData = {
          ...jobOrderData,
          timingQuestions: { ...jobOrderData.timingQuestions, [question]: value }
        };
        // Update unanswered questions list
        if (value && value.trim() !== '' && value.trim() !== 'Not Specified') {
          // Remove from unanswered if answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            timing: updatedData.unansweredQuestions.timing.filter(q => q !== question)
          };
        } else if (!updatedData.unansweredQuestions.timing.includes(question) && question !== 'NOTES') {
          // Add to unanswered if not answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            timing: [...updatedData.unansweredQuestions.timing, question]
          };
        }
        setJobOrderData(updatedData);
        localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
      }, 'timing')}

      {renderQuestionTableWithNotes('2. Questions About the Job', jobQuestionsList, jobOrderData.jobQuestions, jobOrderData.jobNotes, (question, value) => {
        const updatedData = {
          ...jobOrderData,
          jobQuestions: { ...jobOrderData.jobQuestions, [question]: value }
        };
        // Update unanswered questions list
        if (value && value.trim() !== '' && value.trim() !== 'Not Specified') {
          // Remove from unanswered if answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            job: updatedData.unansweredQuestions.job.filter(q => q !== question),
            // Also check if it's an insightful question and keep it in insightful list but mark as answered
            insightful: updatedData.unansweredQuestions.insightful.filter(q => q !== question)
          };
        } else if (!updatedData.unansweredQuestions.job.includes(question) && question !== 'NOTES') {
          // Add to unanswered if not answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            job: [...updatedData.unansweredQuestions.job, question]
          };
        }
        setJobOrderData(updatedData);
        localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
      }, 'job')}
      
      {renderQuestionTableWithNotes('3. Questions About the Company', companyQuestionsList, jobOrderData.companyQuestions, jobOrderData.companyNotes, (question, value) => {
        const updatedData = {
          ...jobOrderData,
          companyQuestions: { ...jobOrderData.companyQuestions, [question]: value }
        };
        // Update unanswered questions list
        if (value && value.trim() !== '' && value.trim() !== 'Not Specified') {
          // Remove from unanswered if answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            company: updatedData.unansweredQuestions.company.filter(q => q !== question)
          };
        } else if (!updatedData.unansweredQuestions.company.includes(question) && question !== 'NOTES') {
          // Add to unanswered if not answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            company: [...updatedData.unansweredQuestions.company, question]
          };
        }
        setJobOrderData(updatedData);
        localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
      }, 'company')}
      
      {renderQuestionTableWithNotes('4. Questions About the Hiring Process', hiringQuestionsList, jobOrderData.hiringQuestions, jobOrderData.hiringNotes, (question, value) => {
        const updatedData = {
          ...jobOrderData,
          hiringQuestions: { ...jobOrderData.hiringQuestions, [question]: value }
        };
        // Update unanswered questions list
        if (value && value.trim() !== '' && value.trim() !== 'Not Specified') {
          // Remove from unanswered if answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            hiring: updatedData.unansweredQuestions.hiring.filter(q => q !== question)
          };
        } else if (!updatedData.unansweredQuestions.hiring.includes(question) && question !== 'NOTES') {
          // Add to unanswered if not answered
          updatedData.unansweredQuestions = {
            ...updatedData.unansweredQuestions,
            hiring: [...updatedData.unansweredQuestions.hiring, question]
          };
        }
        setJobOrderData(updatedData);
        localStorage.setItem(`jobOrder_${job.id}`, JSON.stringify(updatedData));
      }, 'hiring')}

      {/* Smart Job Update Section */}
      <SmartJobUpdate
        jobId={job.id}
        questionLists={{
          timing: timingQuestionsList,
          job: jobQuestionsList,
          company: companyQuestionsList,
          hiring: hiringQuestionsList
        }}
        existingData={{
          timingQuestions: jobOrderData.timingQuestions,
          jobQuestions: jobOrderData.jobQuestions,
          companyQuestions: jobOrderData.companyQuestions,
          hiringQuestions: jobOrderData.hiringQuestions
        }}
        onUpdate={handleSmartUpdate}
      />

      {/* Bottom Export and View Buttons */}
      <div className="space-y-4">


        
        {/* Last Saved Indicator */}
        {lastSaved && (
          <div className="text-center text-sm text-gray-600">
            Last saved: {lastSaved.toLocaleTimeString()} on {lastSaved.toLocaleDateString()}
          </div>
        )}
        
        {/* Export and View Buttons */}
        <div className="flex justify-center gap-4 pt-4 border-t border-gray-200">
          <Button 
            onClick={handleExportJobOrder}
            disabled={isExporting}
            className="flex items-center bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-2 shadow-lg transform transition-transform hover:scale-105"
          >
            <Sparkles className={`mr-2 h-4 w-4 ${isExporting ? 'animate-spin' : 'animate-pulse'}`} />
            {isExporting ? 'Exporting...' : 'Export to Google Doc'}
          </Button>

          <Button 
            onClick={() => {
              // Open Google Drive with search for this job
              const searchQuery = encodeURIComponent(`${job.title} ${job.company}`);
              window.open(`https://drive.google.com/drive/search?q=${searchQuery}`, '_blank');
            }}
            className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 shadow-lg transform transition-transform hover:scale-105"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            🔍 Find in Google Drive
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JobOrder;
