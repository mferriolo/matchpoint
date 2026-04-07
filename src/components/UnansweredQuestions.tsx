import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, HelpCircle, Copy, Check } from 'lucide-react';
import { Job } from '@/types/callprompt';

interface UnansweredQuestionsProps {
  job: Job;
}

const UnansweredQuestions: React.FC<UnansweredQuestionsProps> = ({ job }) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copySuccess, setCopySuccess] = useState(false);

  const [unansweredQuestions, setUnansweredQuestions] = useState<Record<string, string[]>>({
    timing: [],
    job: [],
    company: [],
    hiring: [],
    insightful: []
  });

  useEffect(() => {
    loadUnansweredQuestions();
    
    // Listen for localStorage changes to automatically refresh
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `jobOrder_${job.id}`) {
        console.log('UnansweredQuestions - Detected localStorage change, reloading...');
        loadUnansweredQuestions();
      }
    };
    
    // Also listen for custom events from the same window (since storage events don't fire in same window)
    const handleCustomStorageChange = () => {
      console.log('UnansweredQuestions - Detected custom storage change event, reloading...');
      loadUnansweredQuestions();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('jobOrderUpdated', handleCustomStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('jobOrderUpdated', handleCustomStorageChange);
    };
  }, [job.id]);


  const loadUnansweredQuestions = () => {
    try {
      const savedJobOrder = localStorage.getItem(`jobOrder_${job.id}`);
      console.log('UnansweredQuestions - Loading from localStorage:', savedJobOrder);
      
      if (savedJobOrder) {
        const parsed = JSON.parse(savedJobOrder);
        console.log('UnansweredQuestions - Parsed data:', parsed);
        
        const unanswered: Record<string, string[]> = {
          timing: [],
          job: [],
          company: [],
          hiring: [],
          insightful: []
        };

        // Get all questions from the job order data structure
        const timingQuestions = parsed.timingQuestions || {};
        const jobQuestions = parsed.jobQuestions || {};
        const companyQuestions = parsed.companyQuestions || {};
        const hiringQuestions = parsed.hiringQuestions || {};

        console.log('UnansweredQuestions - Questions data:', {
          timing: timingQuestions,
          job: jobQuestions,
          company: companyQuestions,
          hiring: hiringQuestions
        });

        // CRITICAL: Load question lists from localStorage to respect deletions
        // If question lists are saved, use them; otherwise fall back to defaults
        const timingQuestionsList = parsed.timingQuestionsList || [
          'What is the target start date, and what happens if the hire is delayed?',
          'Where are you in the hiring process now, and what challenges have you faced so far?',
          'What is driving the urgency to fill this role?',
          'Who is covering the work currently, and how is that affecting the organization?',
          'What does your candidate pipeline look like (resources used, people interviewed, viability, and any declined offers)?'
        ];

        const jobQuestionsList = parsed.jobQuestionsList || [
          'Is there mandatory overtime or \'On-Call\' Hours? If so, what does it look like?',
          'What is the title of the position?',
          'What are the primary responsibilities?',
          'What is the schedule for this role?',
          'Is this a remote, hybrid, or onsite position?',
          'What qualifications are preferred?',
          'What is the compensation structure?',
          'Are there travel requirements?',
          'How many direct reports (if any)?',
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


        const companyQuestionsList = parsed.companyQuestionsList || [
          'What is the size and scope of the organization?',
          'What services or specialties does the organization provide?',
          'What is the company\'s mission or core values?',
          'What makes the organization unique or attractive to candidates?',
          'Are there any growth plans or recent milestones to share?'
        ];

        const hiringQuestionsList = parsed.hiringQuestionsList || [
          'What is the hiring timeline?',
          'What are the interview stages?',
          'Who will be involved in the interview process (names and titles)?',
          'How will interviews be conducted (e.g., phone, video, in-person)?',
          'Who is the final decision maker?'
        ];

        console.log('UnansweredQuestions - Using question lists:', {
          timing: timingQuestionsList.length,
          job: jobQuestionsList.length,
          company: companyQuestionsList.length,
          hiring: hiringQuestionsList.length
        });


        // Find all questions that are "Not Specified" or empty, maintaining order
        // Find all questions that are "Not Specified" or empty, maintaining order
        timingQuestionsList.forEach(question => {
          const answer = timingQuestions[question];
          const answerStr = String(answer || '').trim();
          if (!answerStr || answerStr === 'Not Specified') {
            unanswered.timing.push(question);
          }
        });

        jobQuestionsList.forEach(question => {
          const answer = jobQuestions[question];
          const answerStr = String(answer || '').trim();
          if (!answerStr || answerStr === 'Not Specified') {
            unanswered.job.push(question);
          }
        });

        // Also check for any additional job questions that might have been added dynamically
        Object.keys(jobQuestions).forEach(question => {
          if (question !== 'NOTES' && !jobQuestionsList.includes(question)) {
            const answer = jobQuestions[question];
            const answerStr = String(answer || '').trim();
            if (!answerStr || answerStr === 'Not Specified') {
              unanswered.job.push(question);
            }
          }
        });

        companyQuestionsList.forEach(question => {
          const answer = companyQuestions[question];
          const answerStr = String(answer || '').trim();
          if (!answerStr || answerStr === 'Not Specified') {
            unanswered.company.push(question);
          }
        });

        hiringQuestionsList.forEach(question => {
          const answer = hiringQuestions[question];
          const answerStr = String(answer || '').trim();
          if (!answerStr || answerStr === 'Not Specified') {
            unanswered.hiring.push(question);
          }
        });

        // Check for insightful questions from the saved data
        if (parsed.unansweredQuestions && parsed.unansweredQuestions.insightful) {
          // These are the insightful questions that were added via "Add Insight"
          parsed.unansweredQuestions.insightful.forEach(question => {
            // Check if this question is still unanswered
            const answer = jobQuestions[question];
            const answerStr = String(answer || '').trim();
            if (!answerStr || answerStr === 'Not Specified') {
              // Add to insightful list if not already in job list
              if (!unanswered.job.includes(question)) {
                unanswered.insightful.push(question);
              }
            }
          });
        }

        console.log('UnansweredQuestions - Final unanswered questions:', unanswered);
        setUnansweredQuestions(unanswered);
      } else {
        console.log('UnansweredQuestions - No saved job order found');
      }
    } catch (error) {
      console.error('Error loading unanswered questions:', error);
    }
  };

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const copyToClipboard = async () => {
    try {
      if (totalUnanswered === 0) {
        alert('No unanswered questions to copy');
        return;
      }

      // Build the formatted text
      let clipboardText = `UNANSWERED QUESTIONS\n`;
      clipboardText += `Total: ${totalUnanswered} question${totalUnanswered !== 1 ? 's' : ''}\n`;
      clipboardText += `${'='.repeat(50)}\n\n`;

      // Add each section with its questions
      sections.forEach(section => {
        if (section.questions.length > 0) {
          clipboardText += `${section.title.toUpperCase()}\n`;
          clipboardText += `${'-'.repeat(section.title.length)}\n`;
          
          section.questions.forEach((question, index) => {
            clipboardText += `${index + 1}. ${question}\n`;
          });
          
          clipboardText += `\n`;
        }
      });

      clipboardText += `${'='.repeat(50)}\n`;
      clipboardText += `Generated from Job Order: ${job.jobTitle || 'Untitled'} at ${job.company || 'Unknown Company'}\n`;
      clipboardText += `Date: ${new Date().toLocaleDateString()}\n`;

      // Copy to clipboard
      await navigator.clipboard.writeText(clipboardText);

      console.log('Copied to clipboard:', clipboardText);

      // Show success feedback
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);

    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard. Please try again.');
    }
  };


  const sections = [
    { key: 'timing', title: '1. Questions about Timing and Urgency', questions: unansweredQuestions.timing },
    { key: 'job', title: '2. Questions about the Job', questions: unansweredQuestions.job },
    { key: 'company', title: '3. Questions about the Company', questions: unansweredQuestions.company },
    { key: 'hiring', title: '4. Questions about the Hiring Process', questions: unansweredQuestions.hiring },
    ...(unansweredQuestions.insightful.length > 0 ? [{ key: 'insightful', title: '5. Insightful Questions (AI Generated)', questions: unansweredQuestions.insightful }] : [])
  ];

  const totalUnanswered = Object.values(unansweredQuestions).reduce((sum, arr) => sum + arr.length, 0);

  return (

    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-orange-700">
            <HelpCircle className="mr-2 h-5 w-5" />
            Unanswered Questions ({totalUnanswered})
          </CardTitle>
          
          {/* Copy to Clipboard Button */}
          {totalUnanswered > 0 && (
            <button
              onClick={copyToClipboard}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                copySuccess 
                  ? 'bg-green-600 text-white' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copySuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.key} className="border border-gray-200 rounded-lg">
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  {collapsedSections[section.key] ? (
                    <ChevronRight className="h-4 w-4 mr-2 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 mr-2 text-gray-500" />
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
                        <span className="text-orange-500 mr-2 font-semibold">{index + 1}.</span>
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
          
          {totalUnanswered === 0 && (
            <div className="p-8 text-center text-green-600">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold mb-2">All Questions Answered!</h3>
              <p className="text-gray-600">Great job! All job order questions have been completed.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UnansweredQuestions;