// Job Order Functions - Part 2
export const processJobOrder = async (
  showToast: boolean,
  job: any,
  callChatGPT: any,
  toast: any,
  jobQuestionsList: string[],
  companyQuestionsList: string[],
  hiringQuestionsList: string[],
  setJobOrderData: any,
  supabase: any,
  jobOrderData: any
) => {
  if (showToast) {
    toast({
      title: "Regenerating Job Order",
      description: "Analyzing job data with ChatGPT...",
    });
  }

  let answeredQuestionsData = '';
  if (job.callNotes && job.callNotes.length > 0) {
    const allQuestionsAndResponses = job.callNotes.flatMap(note => note.questionsAndResponses || []);
    if (allQuestionsAndResponses.length > 0) {
      answeredQuestionsData = '\n\nAnswered Questions from Calls:\n' + 
        allQuestionsAndResponses.map(qa => `Q: ${qa.question}\nA: ${qa.response}`).join('\n\n');
    }
  }

  try {
    const result = await callChatGPT('analyze_job', { 
      prompt: `Analyze this job and provide structured answers. Job: ${job.title} at ${job.company}. Description: ${job.description || ''}${answeredQuestionsData}` 
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
      
      try {
        await supabase.functions.invoke('save-job-order', {
          body: {
            jobId: job.id,
            jobTitle: job.title,
            company: job.company,
            jobQuestions: newJobOrderData.jobQuestions,
            companyQuestions: newJobOrderData.companyQuestions,
            hiringQuestions: newJobOrderData.hiringQuestions,
            jobNotes: newJobOrderData.jobNotes,
            companyNotes: newJobOrderData.companyNotes,
            hiringNotes: newJobOrderData.hiringNotes
          },
        });
      } catch (saveError) {
        console.error('Error auto-saving job order:', saveError);
      }
      
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