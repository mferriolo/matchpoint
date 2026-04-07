import { useState } from 'react';
import { Questionnaire, QuestionnaireGenerationRequest } from '@/types/questionnaire';
import { getCallTypePrompts } from '@/utils/jobTypePrompts';
import { PREDEFINED_QUESTIONS } from '@/utils/jobTypePrompts';

export const useQuestionnaire = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQuestionnaire = async (request: QuestionnaireGenerationRequest): Promise<Questionnaire | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      // Get call type questions
      const callTypePrompts = getCallTypePrompts(request.callType as any);
      const callTypeQuestions = callTypePrompts.questions;

      // Get job-specific questions
      let jobSpecificQuestions: string[] = [];
      
      if (request.jobSpecificQuestions && request.jobSpecificQuestions.length > 0) {
        jobSpecificQuestions = request.jobSpecificQuestions;
      } else if (PREDEFINED_QUESTIONS[request.jobType]) {
        jobSpecificQuestions = PREDEFINED_QUESTIONS[request.jobType];
      }

      // Combine questions
      let allQuestions = [...callTypeQuestions];
      
      // Add job-specific questions if it's a full interview
      if (request.isFullInterview && jobSpecificQuestions.length > 0) {
        allQuestions = [...allQuestions, ...jobSpecificQuestions];
      }

      // Create questionnaire object
      const questionnaire: Questionnaire = {
        id: crypto.randomUUID(),
        candidateName: request.candidateName,
        jobId: request.jobId,
        jobTitle: request.jobTitle,
        callType: request.callType,
        jobType: request.jobType,
        isFullInterview: request.isFullInterview,
        questions: allQuestions,
        createdAt: new Date(),
        responses: []
      };

      return questionnaire;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate questionnaire';
      setError(errorMessage);
      console.error('Questionnaire generation error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateQuestionnaire,
    isGenerating,
    error
  };
};