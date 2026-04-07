import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, MessageSquare, HelpCircle } from 'lucide-react';
import { Job } from '@/types/callprompt';

interface CallQATableProps {
  job: Job;
}

const CallQATable: React.FC<CallQATableProps> = ({ job }) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [unansweredQuestions, setUnansweredQuestions] = useState<Record<string, string[]>>({
    timing: [],
    job: [],
    company: [],
    hiring: []
  });

  useEffect(() => {
    // Force a fresh load every time the component mounts or job changes
    loadUnansweredQuestions();
  }, [job.id]);

  const loadUnansweredQuestions = () => {
    try {
      const savedJobOrder = localStorage.getItem(`jobOrder_${job.id}`);
      console.log('CallQATable - Loading from localStorage for job:', job.id);
      console.log('CallQATable - Raw localStorage data:', savedJobOrder);
      
      if (savedJobOrder) {
        const parsed = JSON.parse(savedJobOrder);
        console.log('CallQATable - Full parsed data:', parsed);
        
        const unanswered: Record<string, string[]> = {
          timing: [],
          job: [],
          company: [],
          hiring: []
        };

        // Get all questions from the job order data structure - EXACTLY as stored
        const timingQuestions = parsed.timingQuestions || {};
        const jobQuestions = parsed.jobQuestions || {};
        const companyQuestions = parsed.companyQuestions || {};
        const hiringQuestions = parsed.hiringQuestions || {};

        console.log('CallQATable - Timing questions object:', timingQuestions);
        console.log('CallQATable - Job questions object:', jobQuestions);
        console.log('CallQATable - Company questions object:', companyQuestions);
        console.log('CallQATable - Hiring questions object:', hiringQuestions);

        // Define the question lists EXACTLY as they appear in JobOrder and UnansweredQuestions
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

        // Process timing questions - check each one in order
        console.log('CallQATable - Processing timing questions...');
        timingQuestionsList.forEach((question, idx) => {
          const answer = timingQuestions[question];
          console.log(`CallQATable - Timing Q${idx + 1}: "${question.substring(0, 50)}..." => Answer: "${answer}"`);
          if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
            unanswered.timing.push(question);
            console.log(`  -> Added to unanswered (empty or "Not Specified")`);
          }
        });

        // Process job questions - check each one in order
        console.log('CallQATable - Processing job questions...');
        jobQuestionsList.forEach((question, idx) => {
          const answer = jobQuestions[question];
          console.log(`CallQATable - Job Q${idx + 1}: "${question.substring(0, 50)}..." => Answer: "${answer}"`);
          if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
            unanswered.job.push(question);
            console.log(`  -> Added to unanswered (empty or "Not Specified")`);
          }
        });

        // Check for any additional job questions that might have been added dynamically
        console.log('CallQATable - Checking for additional dynamic job questions...');
        Object.keys(jobQuestions).forEach(question => {
          if (question !== 'NOTES' && !jobQuestionsList.includes(question)) {
            const answer = jobQuestions[question];
            console.log(`CallQATable - Additional Job Q: "${question}" => Answer: "${answer}"`);
            if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
              unanswered.job.push(question);
              console.log(`  -> Added to unanswered (empty or "Not Specified")`);
            }
          }
        });

        // Process company questions - check each one in order
        console.log('CallQATable - Processing company questions...');
        companyQuestionsList.forEach((question, idx) => {
          const answer = companyQuestions[question];
          console.log(`CallQATable - Company Q${idx + 1}: "${question.substring(0, 50)}..." => Answer: "${answer}"`);
          if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
            unanswered.company.push(question);
            console.log(`  -> Added to unanswered (empty or "Not Specified")`);
          }
        });

        // Process hiring questions - check each one in order
        console.log('CallQATable - Processing hiring questions...');
        hiringQuestionsList.forEach((question, idx) => {
          const answer = hiringQuestions[question];
          console.log(`CallQATable - Hiring Q${idx + 1}: "${question.substring(0, 50)}..." => Answer: "${answer}"`);
          if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
            unanswered.hiring.push(question);
            console.log(`  -> Added to unanswered (empty or "Not Specified")`);
          }
        });

        console.log('CallQATable - Final unanswered counts:', {
          timing: unanswered.timing.length,
          job: unanswered.job.length,
          company: unanswered.company.length,
          hiring: unanswered.hiring.length,
          total: unanswered.timing.length + unanswered.job.length + unanswered.company.length + unanswered.hiring.length
        });
        console.log('CallQATable - Final unanswered questions detail:', unanswered);
        
        setUnansweredQuestions(unanswered);
      } else {
        console.log('CallQATable - No saved job order found for job:', job.id);
      }
    } catch (error) {
      console.error('CallQATable - Error loading unanswered questions:', error);
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const sections = [
    { key: 'timing', title: '1. Questions about Timing and Urgency', questions: unansweredQuestions.timing },
    { key: 'job', title: '2. Questions about the Job', questions: unansweredQuestions.job },
    { key: 'company', title: '3. Questions about the Company', questions: unansweredQuestions.company },
    { key: 'hiring', title: '4. Questions about the Hiring Process', questions: unansweredQuestions.hiring }
  ];

  const totalUnanswered = Object.values(unansweredQuestions).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-blue-700">
          <MessageSquare className="mr-2 h-5 w-5" />
          AI Prompts & Questions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center">
              <HelpCircle className="mr-2 h-4 w-4" />
              Unanswered Job Order Questions ({totalUnanswered})
            </h3>
            <p className="text-sm text-blue-700 mb-3">
              These questions need to be addressed during the call:
            </p>
            
            <div className="space-y-2">
              {sections.map(section => (
                <div key={section.key} className="border border-blue-200 rounded-lg bg-white">
                  <button
                    onClick={() => toggleSection(section.key)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center">
                      {collapsedSections[section.key] ? (
                        <ChevronRight className="h-4 w-4 mr-2 text-blue-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 mr-2 text-blue-500" />
                      )}
                      <span className="font-medium text-gray-900">{section.title}</span>
                      <span className="ml-2 text-sm text-gray-500">({section.questions.length})</span>
                    </div>
                  </button>
                  
                  {!collapsedSections[section.key] && section.questions.length > 0 && (
                    <div className="px-4 pb-3">
                      <ul className="space-y-2">
                        {section.questions.map((question, index) => (
                          <li key={index} className="flex items-start">
                            <span className="text-blue-500 mr-2 font-semibold">{index + 1}.</span>
                            <span className="text-sm text-gray-700">{question}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {!collapsedSections[section.key] && section.questions.length === 0 && (
                    <div className="px-4 pb-3">
                      <p className="text-sm text-gray-500 italic">All questions answered</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {totalUnanswered === 0 && (
              <div className="p-6 text-center text-green-600 bg-white rounded-lg mt-2">
                <HelpCircle className="h-10 w-10 mx-auto mb-3 text-green-500" />
                <h4 className="font-semibold mb-1">All Questions Answered!</h4>
                <p className="text-sm text-gray-600">Great job! All job order questions have been completed.</p>
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2">AI Assistant Prompts</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Use natural language to ask follow-up questions</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Request clarification on any unclear points</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Ask for specific examples or scenarios</span>
              </li>
              <li className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>Probe deeper into critical requirements</span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-900 mb-2">Conversation Tips</h3>
            <ul className="space-y-2 text-sm text-yellow-800">
              <li className="flex items-start">
                <span className="text-yellow-600 mr-2">💡</span>
                <span>Listen actively and take detailed notes</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-600 mr-2">💡</span>
                <span>Ask open-ended questions to gather more information</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-600 mr-2">💡</span>
                <span>Confirm understanding by summarizing key points</span>
              </li>
              <li className="flex items-start">
                <span className="text-yellow-600 mr-2">💡</span>
                <span>Focus on must-have vs nice-to-have requirements</span>
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CallQATable;