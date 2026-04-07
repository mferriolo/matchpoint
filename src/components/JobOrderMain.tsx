import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, RefreshCw, Save } from 'lucide-react';
import { Job } from '@/types/callprompt';
import { useChatGPT } from '@/hooks/useChatGPT';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface JobOrderProps {
  job: Job;
}

interface JobOrderData {
  jobQuestions: { [key: string]: string };
  companyQuestions: { [key: string]: string };
  hiringQuestions: { [key: string]: string };
  jobNotes: string;
  companyNotes: string;
  hiringNotes: string;
  unansweredQuestions: {
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
  const [isSaving, setIsSaving] = useState(false);
  const [jobOrderData, setJobOrderData] = useState<JobOrderData>({
    jobQuestions: {},
    companyQuestions: {},
    hiringQuestions: {},
    jobNotes: '',
    companyNotes: '',
    hiringNotes: '',
    unansweredQuestions: {
      job: [],
      company: [],
      hiring: [],
      insightful: []
    }
  });
  
  const [jobQuestionsList, setJobQuestionsList] = useState([
    'What is the title of the position?',
    'What are the primary responsibilities?',
    'What is the schedule for this role?',
    'Is there mandatory overtime or \'On-Call\' Hours? If so, what does it look like?',
    'Is this a remote, hybrid, or onsite position?',
    'What qualifications are required?',
    'What qualifications are preferred?',
    'What is the compensation structure?',
    'Are there any bonuses or incentives?',
    'What benefits are offered?',
    'What is the expected start date?',
    'What is the reporting structure?',
    'Are there travel requirements?',
    'How many direct reports (if any)?',
    'NOTES'
  ]);

  const companyQuestionsList = [
    'What is the size and scope of the organization?',
    'What services or specialties does the organization provide?',
    'What is the company\'s mission or core values?',
    'What makes the organization unique or attractive to candidates?',
    'Are there any growth plans or recent milestones to share?',
    'NOTES'
  ];

  const hiringQuestionsList = [
    'What is the hiring timeline?',
    'What are the interview stages?',
    'Who will be involved in the interview process (names and titles)?',
    'How will interviews be conducted (e.g., phone, video, in-person)?',
    'What is the target start date?',
    'Who is the final decision maker?',
    'Is there a backup candidate process?',
    'NOTES'
  ];

  useEffect(() => {
    loadJobOrder();
    
    const savedInsightfulQuestions = localStorage.getItem('insightfulQuestions');
    if (savedInsightfulQuestions) {
      try {
        const questions = JSON.parse(savedInsightfulQuestions);
        setJobOrderData(prev => ({
          ...prev,
          unansweredQuestions: {
            ...prev.unansweredQuestions,
            insightful: questions
          }
        }));
      } catch (error) {
        console.error('Error parsing saved insightful questions:', error);
      }
    }
  }, [job.id]);

  const loadJobOrder = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('load-job-order', {
        body: { jobId: job.id },
      });

      if (error) {
        console.error('Error loading job order:', error);
        generateJobOrderInitial();
        return;
      }

      if (data?.success && data.data) {
        const savedData = data.data;
        const jobQuestions = savedData.job_questions || {};
        const companyQuestions = savedData.company_questions || {};
        const hiringQuestions = savedData.hiring_questions || {};
        
        if (Object.keys(jobQuestions).length > 0 || Object.keys(companyQuestions).length > 0 || Object.keys(hiringQuestions).length > 0) {
          setHasGenerated(true);
          const jobUnanswered = jobQuestionsList.filter(q => !jobQuestions[q] || (jobQuestions[q].trim() === '' && jobQuestions[q] !== 'NOT SPECIFIED'));
          const companyUnanswered = companyQuestionsList.filter(q => !companyQuestions[q] || (companyQuestions[q].trim() === '' && companyQuestions[q] !== 'NOT SPECIFIED'));
          const hiringUnanswered = hiringQuestionsList.filter(q => !hiringQuestions[q] || (hiringQuestions[q].trim() === '' && hiringQuestions[q] !== 'NOT SPECIFIED'));
          
          setJobOrderData({
            jobQuestions,
            companyQuestions,
            hiringQuestions,
            jobNotes: savedData.job_notes || '',
            companyNotes: savedData.company_notes || '',
            hiringNotes: savedData.hiring_notes || '',
            unansweredQuestions: {
              job: jobUnanswered,
  const generateJobOrder = async () => {
    setHasGenerated(true);
    await processJobOrder(true);
  };

  const processJobOrder = async (showToast: boolean = false) => {
    if (showToast) {
      toast({
        title: "Regenerating Job Order",
        description: "Analyzing job data with ChatGPT...",
      });
    }

    try {
      const result = await callChatGPT('analyze_job', { 
        prompt: `Analyze this job and provide structured answers. Job: ${job.title} at ${job.company}. Description: ${job.description || ''}` 
      });
      
      if (result?.content) {
        let cleanContent = result.content.trim();
        cleanContent = cleanContent.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        
        const jsonStart = cleanContent.indexOf('{');
        const jsonEnd = cleanContent.lastIndexOf('}') + 1;
        
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          cleanContent = cleanContent.substring(jsonStart, jsonEnd);
        }
        
        const parsed = JSON.parse(cleanContent);
        
        const jobUnanswered = jobQuestionsList.filter(q => !parsed.jobQuestions?.[q] || parsed.jobQuestions[q].trim() === '' || parsed.jobQuestions[q].trim() === 'Not Specified');
        const companyUnanswered = companyQuestionsList.filter(q => !parsed.companyQuestions?.[q] || parsed.companyQuestions[q].trim() === '' || parsed.companyQuestions[q].trim() === 'Not Specified');
        const hiringUnanswered = hiringQuestionsList.filter(q => !parsed.hiringQuestions?.[q] || parsed.hiringQuestions[q].trim() === '' || parsed.hiringQuestions[q].trim() === 'Not Specified');
        
        const newJobOrderData = {
          jobQuestions: parsed.jobQuestions || {},
          companyQuestions: parsed.companyQuestions || {},
          hiringQuestions: parsed.hiringQuestions || {},
          jobNotes: parsed.jobNotes || '',
          companyNotes: parsed.companyNotes || '',
          hiringNotes: parsed.hiringNotes || '',
          unansweredQuestions: {
            job: jobUnanswered,
            company: companyUnanswered,
            hiring: hiringUnanswered,
            insightful: jobOrderData.unansweredQuestions.insightful
          }
        };
        
        setJobOrderData(newJobOrderData);
        
        if (showToast) {
          toast({
            title: "Job Order Generated",
            description: `Successfully analyzed job data.`,
            duration: 3000,
          });
      }
    } catch (error) {
      console.error('Error generating job order:', error);
      if (showToast) {
        toast({
          title: "Error Generating Job Order",
          description: "Failed to analyze job data. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-job-order', {
        body: {
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          jobQuestions: jobOrderData.jobQuestions,
          companyQuestions: jobOrderData.companyQuestions,
          hiringQuestions: jobOrderData.hiringQuestions,
          jobNotes: jobOrderData.jobNotes,
          companyNotes: jobOrderData.companyNotes,
          hiringNotes: jobOrderData.hiringNotes
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Changes Saved Successfully",
          description: "Job Order changes have been saved.",
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

  const handleGenerateGapQuestions = async () => {
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

          setJobOrderData(prev => ({
            ...prev,
            jobQuestions: updatedJobQuestions,
            unansweredQuestions: {
              ...prev.unansweredQuestions,
              insightful: questions,
              job: [...prev.unansweredQuestions.job, ...questions]
            }
          }));
          
          localStorage.setItem('insightfulQuestions', JSON.stringify(questions));
          
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
    }
  };
          setHasGenerated(false);
        }
      } else {
        setHasGenerated(false);
      }
    } catch (error) {
      console.error('Error loading job order:', error);
      setHasGenerated(false);
    }
  };

  const generateJobOrderInitial = async () => {
    await processJobOrder(false);
  };

  const generateJobOrder = async () => {
    setHasGenerated(true);
    await processJobOrder(true);
  };