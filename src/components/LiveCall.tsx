import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { AlertCircle, Check, MessageSquare, Clock, Users, ChevronDown, ChevronRight, Square, CheckSquare } from 'lucide-react';
import { useCallPrompt } from '../contexts/CallPromptContext';

import { getJobTypePrompts } from '../utils/jobTypePrompts';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import VideoCallInterface from './VideoCallInterface';
import CallSummary from './CallSummary';
import { 
  Mic, 
  MicOff, 
  PhoneOff,
  User,
  CheckCircle,
  Phone,
  FileText,
  HelpCircle
} from 'lucide-react';
import { useChatGPT } from '@/hooks/useChatGPT';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { getCallTypePrompts } from '@/utils/jobTypePrompts';
import PhoneCallInterface from './PhoneCallInterface';
import TwilioCallInterface from './TwilioCallInterface';
import ZoomIntegration from './ZoomIntegration';
import { supabase } from '@/lib/supabase';


interface LiveCallProps {
  onEndCall: () => void;
}
// Define the exact question lists to match UnansweredQuestions component
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

// Categorize question based on which list it belongs to
const categorizeQuestion = (question: string): string => {
  if (timingQuestionsList.includes(question)) return 'timing';
  if (jobQuestionsList.includes(question)) return 'job';
  if (companyQuestionsList.includes(question)) return 'company';
  if (hiringQuestionsList.includes(question)) return 'hiring';
  
  // For any dynamic questions not in the lists, default to job
  return 'job';
};
const LiveCall: React.FC<LiveCallProps> = ({ onEndCall }) => {
  // Refs to prevent infinite loops
  const promptsLoadedRef = useRef(false);
  const knockoutQuestionsLoadedRef = useRef(false);
  const currentCallIdRef = useRef<string | null>(null);
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);



  const { currentCall, jobs, endCall } = useCallPrompt();
  const navigate = useNavigate();
  

  
  // Reset refs when call changes
  if (currentCall?.id !== currentCallIdRef.current) {
    promptsLoadedRef.current = false;
    knockoutQuestionsLoadedRef.current = false;
    currentCallIdRef.current = currentCall?.id || null;
  }
  
  const { getPromptingSupport } = useChatGPT();
  const [isRecording, setIsRecording] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [candidateJobTitle, setCandidateJobTitle] = useState<string>('');
  const [openSections, setOpenSections] = useState<string[]>(['timing', 'job', 'company', 'hiring']);
  const [fullTranscript, setFullTranscript] = useState<Array<{
    speaker: 'recruiter' | 'candidate';
    text: string;
    timestamp: Date;
  }>>([]);

  const [callNotes, setCallNotes] = useState<Array<{
    id: string;
    question: string;
    answer: string;
    timestamp: Date;
  }>>([]);
  const [prompts, setPrompts] = useState<Array<{
    id: string;
    message: string;
    type: 'question' | 'reminder' | 'selling_point';
    timestamp: Date;
    acknowledged: boolean;
    matched?: boolean;
    isFlashing?: boolean;
    manuallyAsked?: boolean;
  }>>([]);
  
  // State for knockout questions
  const [knockoutQuestions, setKnockoutQuestions] = useState<string[]>([]);
  const [askedKnockoutQuestions, setAskedKnockoutQuestions] = useState<number[]>([]);
  
  // New state for real-time transcript feature
  const [transcript, setTranscript] = useState<{
    question: string;
    answer: string;
    timestamp: string;
    questionNumber: number;
  }[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>('');
  const [isRecordingAnswer, setIsRecordingAnswer] = useState<boolean>(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<'interviewer' | 'participant'>('interviewer');
  const [fullCallTranscript, setFullCallTranscript] = useState<string>('');

  
  
  const {
    finalTranscript,
    interimTranscript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
    isSupported
  } = useSpeechRecognition();
  
  const [participantConnected, setParticipantConnected] = useState(false);
  const [participantName, setParticipantName] = useState<string>('Participant');



  const currentJob = jobs.find(job => job.id === currentCall?.jobId);



  // Load candidate's current job title from database
  useEffect(() => {
    const loadCandidateJobTitle = async () => {
      if (!currentCall?.candidateId) {
        console.log('No candidateId in currentCall');
        return;
      }
      
      console.log('=== LOADING CANDIDATE JOB TITLE ===');
      console.log('Loading candidate job title for ID:', currentCall.candidateId);
      
      // Query for the actual database field name (snake_case)
      const { data, error } = await supabase
        .from('candidates')
        .select('current_job_title, name')
        .eq('id', currentCall.candidateId)
        .single();
      
      console.log('Candidate job title query result:', { data, error });
      console.log('current_job_title field value:', data?.current_job_title);
      console.log('current_job_title type:', typeof data?.current_job_title);
      console.log('All fields returned:', data ? Object.keys(data) : 'no data');
      
      if (error) {
        console.error('Error loading candidate job title:', error);
        return;
      }
      
      // Set the job title directly from the database (snake_case field name)
      if (data?.current_job_title) {
        console.log('✅ Setting candidate job title to:', data.current_job_title);
        setCandidateJobTitle(data.current_job_title);
      } else {
        console.log('⚠️ No current_job_title found in database, value is:', data?.current_job_title);
        setCandidateJobTitle('');
      }
    };
    
    loadCandidateJobTitle();
  }, [currentCall?.candidateId]);







  // Toggle function for knockout questions
  const toggleKnockoutQuestionAsked = (index: number) => {
    if (index < 0 || index >= knockoutQuestions.length) return;
    console.log('Toggling knockout question:', index);

    setAskedKnockoutQuestions(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });

    // Add to transcript
    const question = knockoutQuestions[index];
    if (question) handleQuestionAsked(question);
  };

  // Function to capitalize sentences
  const capitalizeSentences = (text: string): string => {
    return text.replace(/(^\w|[.!?]\s*\w)/g, (match) => match.toUpperCase());
  };


  // Function to check if transcript matches any prompts OR knockout questions
  const checkTranscriptMatches = (text: string) => {
    if (!currentCall?.callType) return;
    
    const callTypePrompts = getCallTypePrompts(currentCall.callType);
    const normalizedText = text.toLowerCase().trim();
    
    // Check AI Prompts & Questions
    setPrompts(prev => prev.map(prompt => {
      const normalizedPrompt = prompt.message.toLowerCase().trim();
      
      // Check for close matches (contains key words)
      const promptWords = normalizedPrompt.split(' ').filter(word => word.length > 3);
      const matchCount = promptWords.filter(word => normalizedText.includes(word)).length;
      const matchPercentage = matchCount / Math.max(promptWords.length, 1);
      
      // Mark as matched if 40% or more words match
      if (matchPercentage >= 0.4 && !prompt.matched && !prompt.acknowledged) {
        // Start flashing animation for detected questions
        const updatedPrompt = { ...prompt, matched: true, isFlashing: true };
        
        // Stop flashing after 3 seconds and move to bottom
        setTimeout(() => {
          setPrompts(current => current.map(p => 
            p.id === prompt.id ? { ...p, isFlashing: false, acknowledged: true } : p
          ));
        }, 3000);
        
        return updatedPrompt;
      }
      
      return prompt;
    }));
    
    // CRITICAL: Also check knockout questions for auto-detection
    if (knockoutQuestions.length > 0) {
      knockoutQuestions.forEach((question, index) => {
        const normalizedQuestion = question.toLowerCase().trim();

        // Check for close matches (contains key words)
        const questionWords = normalizedQuestion.split(' ').filter(word => word.length > 3);
        const matchCount = questionWords.filter(word => normalizedText.includes(word)).length;
        const matchPercentage = matchCount / Math.max(questionWords.length, 1);

        // Mark as asked if 40% or more words match
        if (matchPercentage >= 0.4) {
          // Use functional setter to avoid stale closure reads
          setAskedKnockoutQuestions(prev => {
            if (prev.includes(index)) return prev;
            console.log('Auto-detected knockout question:', question);
            // Add to transcript (scheduled outside setter)
            const tid = setTimeout(() => handleQuestionAsked(question), 0);
            pendingTimeoutsRef.current.push(tid);
            return [...prev, index];
          });
        }
      });
    }
  };

  // Function to handle when a question is asked (detected or manually marked)
  // Function to handle when a question is asked (detected or manually marked)
  const handleQuestionAsked = (question: string) => {
    console.log('Question asked:', question);
    
    // If there was a previous question being answered, save it to transcript
    if (currentQuestion && currentQuestion !== question) {
      const finalAnswer = currentAnswer || '(No answer recorded)';
      
      setTranscript(prev => [...prev, {
        question: currentQuestion,
        answer: finalAnswer,
        timestamp: new Date().toISOString(),
        questionNumber: currentQuestionNumber
      }]);
      
      // Add to full call transcript with proper formatting
      setFullCallTranscript(prev => 
        prev + `\n\nQ${currentQuestionNumber}: ${currentQuestion}\n[PARTICIPANT]: ${finalAnswer}`
      );
    }
    
    // Start tracking the new question IN ORDER
    const nextQuestionNumber = currentQuestionNumber + 1;
    setCurrentQuestion(question);
    setCurrentQuestionNumber(nextQuestionNumber);
    setCurrentAnswer(''); // Clear answer for new question
    setIsRecordingAnswer(true); // Start recording the participant's answer
    setCurrentSpeaker('participant'); // Switch to expecting participant response
    
    // Add question to full transcript
    setFullCallTranscript(prev => 
      prev + `\n\n[RECRUITER] Q${nextQuestionNumber}: ${question}`
    );
  };

  
  // Function to manually mark a prompt as asked
  const markAsAsked = (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      // Track this question in the transcript
      handleQuestionAsked(prompt.message);
      
      // Add to call notes when manually marked as asked
      const newNote = {
        id: crypto.randomUUID(),
        question: prompt.message,
        answer: "Manually marked as asked - waiting for candidate response...",
        timestamp: new Date()
      };
      setCallNotes(prev => [...prev, newNote]);
    }
    
    // Start flashing animation for manually asked prompts
    setPrompts(prev => prev.map(p => 
      p.id === promptId ? { ...p, manuallyAsked: true, isFlashing: true } : p
    ));
    
    // Stop flashing after 3 seconds and move to bottom
    const flashTid = setTimeout(() => {
      setPrompts(current => current.map(p =>
        p.id === promptId ? { ...p, isFlashing: false, acknowledged: true } : p
      ));
    }, 3000);
    pendingTimeoutsRef.current.push(flashTid);
  };

  // Effect to handle speech recognition and recording - WAIT for participant
  useEffect(() => {
    // Listen for participant connection
    const handleParticipantConnected = (event: any) => {
      const name = event.detail?.participantName || 'Participant';
      console.log('🎯 Participant connected:', name);
      setParticipantName(name);
      setParticipantConnected(true);
      if (isRecording && isSupported) {
        startListening(); // Start listening now
      }
    };


    window.addEventListener('participantConnected', handleParticipantConnected);

    // Only start listening if participant is already connected and not already listening
    if (participantConnected && isRecording && isSupported && !isListening) {
      startListening();
    } else if (!isRecording) {
      stopListening();
    }

    return () => {
      window.removeEventListener('participantConnected', handleParticipantConnected);
    };
  }, [isRecording, isSupported, isListening, participantConnected, startListening, stopListening]);


  // Effect to handle final transcript updates (only when speech is finalized)
  useEffect(() => {
    if (finalTranscript.trim()) {
      const existingText = fullTranscript.map(entry => entry.text).join(' ');
      const newText = finalTranscript.replace(existingText, '').trim();
      
      if (newText) {
        const capitalizedText = capitalizeSentences(newText);
        
        // Determine speaker based on current question state
        const speaker = currentQuestion && isRecordingAnswer ? 'candidate' : 'recruiter';
        
        setFullTranscript(prev => [...prev, {
          speaker: speaker as 'recruiter' | 'candidate',
          text: capitalizedText,
          timestamp: new Date()
        }]);
        
        // If recording answer, add to current answer
        if (currentQuestion && isRecordingAnswer) {
          setCurrentAnswer(prev => prev ? `${prev} ${capitalizedText}` : capitalizedText);
          
          // Add to full call transcript
          setFullCallTranscript(prev => 
            prev + `\n[PARTICIPANT]: ${capitalizedText}`
          );
        } else {
          // Add recruiter speech to full transcript
          setFullCallTranscript(prev => 
            prev + `\n[RECRUITER]: ${capitalizedText}`
          );
        }
        
        // Check for prompt matches
        checkTranscriptMatches(capitalizedText);
      }
    }
  }, [finalTranscript, currentQuestion, isRecordingAnswer]);

  useEffect(() => {
    if (!currentCall || promptsLoadedRef.current) return;
    
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    
    // Mark as loaded to prevent re-running
    promptsLoadedRef.current = true;
    
    // For Job Order Call, use EXACT same logic as UnansweredQuestions component
    if (currentCall.callType === "Job Order Call" && currentJob) {
      try {
        const savedJobOrder = localStorage.getItem(`jobOrder_${currentJob.id}`);
        
        if (savedJobOrder) {
          let parsed;
          try {
            parsed = JSON.parse(savedJobOrder);
          } catch {
            console.warn('Corrupted jobOrder localStorage, removing:', currentJob.id);
            localStorage.removeItem(`jobOrder_${currentJob.id}`);
            parsed = null;
          }
          if (!parsed) return;
          const questionsToShow: string[] = [];
          
          // Get all questions from the job order data structure
          const timingQuestions = parsed.timingQuestions || {};
          const jobQuestions = parsed.jobQuestions || {};
          const companyQuestions = parsed.companyQuestions || {};
          const hiringQuestions = parsed.hiringQuestions || {};
          
          // Find all questions that are "Not Specified" or empty
          timingQuestionsList.forEach(question => {
            const answer = timingQuestions[question];
            if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
              questionsToShow.push(question);
            }
          });

          jobQuestionsList.forEach(question => {
            const answer = jobQuestions[question];
            if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
              questionsToShow.push(question);
            }
          });

          // Also check for any additional job questions
          Object.keys(jobQuestions).forEach(question => {
            if (question !== 'NOTES' && !jobQuestionsList.includes(question)) {
              const answer = jobQuestions[question];
              if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
                questionsToShow.push(question);
              }
            }
          });

          companyQuestionsList.forEach(question => {
            const answer = companyQuestions[question];
            if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
              questionsToShow.push(question);
            }
          });

          hiringQuestionsList.forEach(question => {
            const answer = hiringQuestions[question];
            if (!answer || answer.trim() === '' || answer.trim() === 'Not Specified') {
              questionsToShow.push(question);
            }
          });

          // Create prompts from the questions
          const questionPrompts = questionsToShow.map((question, index) => ({
            id: crypto.randomUUID(),
            message: question,
            type: 'question' as const,
            timestamp: new Date(Date.now() + index * 1000),
            acknowledged: false
          }));

          setPrompts(questionPrompts);
        }
      } catch (error) {
        console.error('LiveCall - Error loading questions:', error);
      }
    }
    // For all other call types, load questions from currentCall.questions or sessionStorage
    else if (currentCall.callType !== "Job Order Call") {
      let questionsToShow: string[] = [];
      
      // First try to get questions from currentCall
      if (currentCall.questions && currentCall.questions.length > 0) {
        questionsToShow = currentCall.questions;
      }
      // Fallback to sessionStorage
      else {
        const storedQuestions = sessionStorage.getItem(`callQuestions_${currentCall.callType}`);
        
        if (storedQuestions) {
          try {
            questionsToShow = JSON.parse(storedQuestions);
          } catch (error) {
            console.error('LiveCall - Error parsing stored questions:', error);
          }
        }
        
        // If still no questions, try fetching directly from database as last resort
        if (questionsToShow.length === 0 && !promptsLoadedRef.current) {
          // Fetch questions directly from database
          supabase
            .from('client_call_types')
            .select('id')
            .eq('name', currentCall.callType)
            .eq('is_active', true)
            .single()
            .then(({ data: callTypeData, error: callTypeError }) => {
              if (!callTypeError && callTypeData) {
                // Fetch questions for this call type
                return supabase
                  .from('questions')
                  .select('question_text')
                  .eq('type_id', callTypeData.id)
                  .eq('is_active', true)
                  .order('sort_order');
              }
              return null;
            })
            .then((result) => {
              if (result && !result.error && result.data && result.data.length > 0) {
                const dbQuestions = result.data.map(q => q.question_text);
                
                // Create prompts from the questions
                const questionPrompts = dbQuestions.map((question, index) => ({
                  id: crypto.randomUUID(),
                  message: question,
                  type: 'question' as const,
                  timestamp: new Date(Date.now() + index * 1000),
                  acknowledged: false
                }));

                setPrompts(questionPrompts);
              }
            })
            .catch(error => {
              console.error('LiveCall - Error fetching questions from database:', error);
            });
        }
      }
      
      if (questionsToShow.length > 0) {
        // Create prompts from the questions
        const questionPrompts = questionsToShow.map((question, index) => ({
          id: crypto.randomUUID(),
          message: question,
          type: 'question' as const,
          timestamp: new Date(Date.now() + index * 1000),
          acknowledged: false
        }));

        setPrompts(questionPrompts);
      }
    }

    return () => {
      clearInterval(timer);
      pendingTimeoutsRef.current.forEach(t => clearTimeout(t));
      pendingTimeoutsRef.current = [];
    };
  }, [currentCall?.id]);


  // Effect to load knockout questions from the job
  // Effect to load knockout questions from the job
  // Effect to load knockout questions from the job
  useEffect(() => {
    if (knockoutQuestionsLoadedRef.current) return;
    
    const callType = currentCall?.callType;
    const jobId = currentCall?.jobReferenceId || currentCall?.jobId;
    
    const loadKnockoutQuestions = async () => {
      if (!jobId || jobId.startsWith('temp-')) {
        setKnockoutQuestions([]);
        return;
      }
      
      const { data: jobData, error } = await supabase
        .from('job_orders')
        .select('knockout_questions, title, id')
        .eq('id', jobId);
      
      if (error || !jobData || jobData.length === 0) {
        setKnockoutQuestions([]);
        return;
      }
      
      const job = jobData[0];
      if (job?.knockout_questions && Array.isArray(job.knockout_questions) && job.knockout_questions.length > 0) {
        setKnockoutQuestions(job.knockout_questions);
      } else {
        setKnockoutQuestions([]);
      }
      
      knockoutQuestionsLoadedRef.current = true;
    };

    // Only load if it's the right call type
    if (callType === 'Initial Screening' || callType === 'Full Interview') {
      loadKnockoutQuestions();
    } else {
      setKnockoutQuestions([]);
    }
    
  }, [currentCall?.id]);







  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const acknowledgePrompt = (promptId: string) => {
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      // Add to call notes when question is acknowledged
      const newNote = {
        id: crypto.randomUUID(),
        question: prompt.message,
        answer: "Waiting for candidate response...",
        timestamp: new Date()
      };
      setCallNotes(prev => [...prev, newNote]);
    }
    
    setPrompts(prev => prev.map(p => 
      p.id === promptId ? { ...p, acknowledged: true } : p
    ));
  };

  const handleEndCall = async () => {
    const callId = currentCall?.databaseId || currentCall?.id;

    console.log('=== ENDING CALL WITH TRANSCRIPT ===');
    console.log('Full call transcript:', fullCallTranscript);
    console.log('Call ID:', callId);
    
    // Save the full call transcript to the database
    if (callId && fullCallTranscript.trim()) {
      try {
        console.log('Saving transcript to calls table...');
        const { error: transcriptError } = await supabase
          .from('calls')

          .update({ 
            transcript: fullCallTranscript,
            updated_at: new Date().toISOString()
          })
          .eq('id', callId);
        
        if (transcriptError) {
          console.error('Error saving transcript:', transcriptError);
        } else {
          console.log('✅ Transcript saved successfully');
        }
      } catch (error) {
        console.error('Error saving transcript:', error);
      }
    }
    
    // Update the current call with questions and responses before ending
    if (currentCall && callNotes.length > 0) {
      const questionsAndResponses = callNotes.map(note => ({
        question: note.question,
        response: note.answer,
        timestamp: note.timestamp
      }));
      
      // Update the current call with the questions and responses
      currentCall.questionsAndResponses = questionsAndResponses;
    }
    
    // CRITICAL FIX: Dispatch event to end Zoom call FIRST
    console.log('Dispatching endZoomCall event from LiveCall...');
    window.dispatchEvent(new CustomEvent('endZoomCall', { 
      detail: { 
        callId: callId,
        callMethod: 'zoom'
      } 
    }));
    
    // Wait for Zoom cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Call the context's endCall function which will generate the call note
    await endCall();
    
    // Navigate to call summary page with the callId
    if (callId) {
      console.log('✅ Navigating to call summary page:', callId);
      navigate(`/call-summary/${callId}`);
    }
    
    // Then call the parent's onEndCall
    onEndCall();
  };


  // Only require currentJob for Job Order Calls
  // For candidate calls, currentJob might not exist if it's a temporary job
  if (!currentCall) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">No active call session</p>
      </div>
    );
  }

  // For Job Order Calls specifically, we need the job data
  if (currentCall.callType === 'Job Order Call' && !currentJob) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Job data not found for Job Order Call</p>
      </div>
    );
  }

  // Sort prompts: unacknowledged non-matched first, then matched (detected), then acknowledged at bottom
  // But keep flashing items in their original position during the flash animation
  const sortedPrompts = [...prompts].sort((a, b) => {
    // Acknowledged items go to bottom
    if (a.acknowledged !== b.acknowledged) {
      return a.acknowledged ? 1 : -1;
    }
    // Among unacknowledged items, keep flashing items in original position
    // Only move matched items to bottom if they're not currently flashing
    if (!a.acknowledged && !b.acknowledged) {
      if (a.isFlashing || b.isFlashing) {
        return 0; // Keep flashing items in original position
      }
      if (a.matched !== b.matched) {
        return a.matched ? 1 : -1;
      }
    }
    return 0;
  });

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* LEFT SIDEBAR - Video Feeds */}
      <aside className="w-80 bg-slate-900 p-4 overflow-y-auto">
        <h3 className="text-white text-sm font-semibold mb-3">Live Video</h3>
        <ZoomIntegration 
          userName={currentCall.candidateName || 'Host'}
          callDatabaseId={currentCall.databaseId || currentCall.id}
          onCallStatusChange={(isActive) => {
            console.log('Call status changed:', isActive);
          }}
          compact={true}
        />

      </aside>


      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse mr-3"></div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Live Zoom {currentCall.callType}
                </h1>
                <p className="text-gray-600">{currentCall.candidateName} - {candidateJobTitle || 'No job title available'}</p>
              </div>
            </div>
            
             <div className="flex items-center gap-4">
              {/* Participant Connection Status */}
              {!participantConnected ? (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-yellow-700 font-medium">Waiting for participant to join...</span>
                </div>
              ) : isListening ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-green-700 font-medium">Listening...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                  <span className="text-sm text-gray-600">Not listening</span>
                </div>
              )}
              
              <div className="flex items-center text-lg font-mono bg-white px-4 py-2 rounded-lg shadow">
                <Clock className="mr-2 h-4 w-4" />
                {formatDuration(callDuration)}
              </div>

              <Button
                variant="outline"
                onClick={() => setIsRecording(!isRecording)}
                className={isRecording ? 'bg-red-50 border-red-200' : 'bg-gray-50'}
              >
                {isRecording ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
              
              <Button
                onClick={handleEndCall}
                className="bg-red-600 hover:bg-red-700"
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                End Call
              </Button>
            </div>
          </div>




        {/* AI Prompts & Questions with Collapsible Sections */}
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-orange-500" />
              AI Prompts & Questions
              <Badge variant="secondary" className="ml-auto">
                {prompts.filter(p => !p.acknowledged).length} remaining
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <div className="space-y-4">
                {/* Conditional rendering based on call type */}
                {currentCall.callType === 'Job Order Call' ? (
                  // Job Order Call - show with category headers
                  (() => {
                    const categorizedQuestions = {
                      timing: prompts.filter(p => categorizeQuestion(p.message) === 'timing'),
                      job: prompts.filter(p => categorizeQuestion(p.message) === 'job'),
                      company: prompts.filter(p => categorizeQuestion(p.message) === 'company'),
                      hiring: prompts.filter(p => categorizeQuestion(p.message) === 'hiring')
                    };

                    const sections = [
                      { id: 'timing', title: '1. Questions About Timing and Urgency', questions: categorizedQuestions.timing },
                      { id: 'job', title: '2. Questions About the Job', questions: categorizedQuestions.job },
                      { id: 'company', title: '3. Questions About the Company', questions: categorizedQuestions.company },
                      { id: 'hiring', title: '4. Questions About the Hiring Process', questions: categorizedQuestions.hiring }
                    ];

                    const toggleSection = (sectionId: string) => {
                      setOpenSections(prev => 
                        prev.includes(sectionId) 
                          ? prev.filter(id => id !== sectionId)
                          : [...prev, sectionId]
                      );
                    };

                    return sections.map((section) => (
                      <Collapsible
                        key={section.id}
                        open={openSections.includes(section.id)}
                        onOpenChange={() => toggleSection(section.id)}
                      >
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                            <div className="flex items-center">
                              {openSections.includes(section.id) ? (
                                <ChevronDown className="h-4 w-4 mr-2" />
                              ) : (
                                <ChevronRight className="h-4 w-4 mr-2" />
                              )}
                              <h3 className="font-semibold text-gray-800">{section.title}</h3>
                            </div>
                            <span className="text-sm text-gray-600">
                              {section.questions.length} question{section.questions.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          {section.questions.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {section.questions.map((prompt, index) => (
                                <div
                                  key={prompt.id}
                                  className={`p-3 rounded-lg border transition-all duration-300 ${
                                    prompt.acknowledged 
                                      ? 'bg-green-50 border-green-200 opacity-60' 
                                      : prompt.matched
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-orange-50 border-orange-200'
                                  } ${
                                    prompt.isFlashing ? 'animate-pulse bg-yellow-100 border-yellow-300' : ''
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <p className="text-sm font-medium flex items-center">
                                      {prompt.matched && (
                                        <Check className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                                      )}
                                      {prompt.acknowledged && (
                                        <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                                      )}
                                      <span className="mr-2 text-gray-500">{index + 1}.</span>
                                      {prompt.message}
                                    </p>
                                    {!prompt.acknowledged && (
                                      <div className="flex gap-1 ml-2">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => acknowledgePrompt(prompt.id)}
                                          className="h-6 w-6 p-0 flex-shrink-0"
                                          title="Mark as asked"
                                        >
                                          <CheckCircle className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => markAsAsked(prompt.id)}
                                          className="h-6 px-2 flex-shrink-0 text-xs"
                                          title="Manually mark as asked"
                                        >
                                          Asked
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {prompt.acknowledged && (
                                      <span className="text-green-600 font-medium">✓ Asked - </span>
                                    )}
                                    {prompt.matched && !prompt.acknowledged && (
                                      <span className="text-blue-600 font-medium">Detected - </span>
                                    )}
                                    {isListening && (
                                      <Mic className="inline h-3 w-3 text-red-500 animate-pulse mr-1" />
                                    )}
                                    {prompt.timestamp.toLocaleTimeString()}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              No questions in this category yet
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    ));
                  })()
                ) : (
                  // All other call types - NO category headers, flat list
                  <div className="space-y-2">
                    {prompts.map((prompt, index) => (
                      <div
                        key={prompt.id}
                        className={`p-3 rounded-lg border transition-all duration-300 ${
                          prompt.acknowledged 
                            ? 'bg-green-50 border-green-200 opacity-60' 
                            : prompt.matched
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-orange-50 border-orange-200'
                        } ${
                          prompt.isFlashing ? 'animate-pulse bg-yellow-100 border-yellow-300' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-medium flex items-center">
                            {prompt.matched && (
                              <Check className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                            )}
                            {prompt.acknowledged && (
                              <CheckCircle className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                            )}
                            <span className="mr-2 text-gray-500">{index + 1}.</span>
                            {prompt.message}
                          </p>
                          {!prompt.acknowledged && (
                            <div className="flex gap-1 ml-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => acknowledgePrompt(prompt.id)}
                                className="h-6 w-6 p-0 flex-shrink-0"
                                title="Mark as asked"
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => markAsAsked(prompt.id)}
                                className="h-6 px-2 flex-shrink-0 text-xs"
                                title="Manually mark as asked"
                              >
                                Asked
                              </Button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {prompt.acknowledged && (
                            <span className="text-green-600 font-medium">✓ Asked - </span>
                          )}
                          {prompt.matched && !prompt.acknowledged && (
                            <span className="text-blue-600 font-medium">Detected - </span>
                          )}
                          {isListening && (
                            <Mic className="inline h-3 w-3 text-red-500 animate-pulse mr-1" />
                          )}
                          {prompt.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                
                {prompts.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-8">
                    AI prompts and questions will appear here during the call
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Knockout Questions Section - REPLACES Quick Reference */}
        {knockoutQuestions.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0 mb-6">
            <CardHeader>
              <div className="pb-2 border-b-2 border-orange-500">
                <CardTitle className="flex items-center text-orange-600">
                  <AlertCircle className="mr-2 h-5 w-5" />
                  Knockout Questions
                  <Badge variant="secondary" className="ml-auto">
                    {knockoutQuestions.length} questions
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Job-specific screening questions
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {knockoutQuestions.map((question, index) => {
                    // Strip any existing numbering from the question text
                    const cleanQuestion = question.replace(/^\d+\.\s*/, '').trim();
                    
                    return (
                      <div
                        key={index}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          askedKnockoutQuestions.includes(index)
                            ? 'bg-green-50 border-green-300'
                            : 'bg-background border-border hover:bg-accent'
                        }`}
                        onClick={() => toggleKnockoutQuestionAsked(index)}
                      >
                        {/* Checkbox */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 mt-1 pointer-events-none h-6 w-6 p-0"
                        >
                          {askedKnockoutQuestions.includes(index) ? (
                            <CheckSquare className="h-5 w-5 text-green-600" />
                          ) : (
                            <Square className="h-5 w-5" />
                          )}
                        </Button>
                        
                        {/* Question text with clean numbering */}
                        <div className="flex-1">
                          <p className={`text-sm ${
                            askedKnockoutQuestions.includes(index) 
                              ? 'text-green-900 font-medium' 
                              : 'text-foreground'
                          }`}>
                            {index + 1}. {cleanQuestion}
                          </p>
                          {askedKnockoutQuestions.includes(index) && (
                            <p className="text-xs text-green-600 font-medium mt-1">
                              ✓ Asked
                            </p>
                          )}
                        </div>
                      </div>
                    );
                   })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}



        {/* Real-time Transcript Section - CHRONOLOGICAL ORDER */}
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5 text-blue-500" />
              Call Transcript
              <Badge variant="outline" className="ml-auto">
                {transcript.length + (currentQuestion ? 1 : 0)} Q&A
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96">
              <div className="space-y-6">
                {/* Display completed Q&A pairs IN THE ORDER THEY WERE ASKED */}
                {transcript
                  .sort((a, b) => a.questionNumber - b.questionNumber)
                  .map((item, index) => (
                    <div key={index} className="border-l-4 border-primary pl-4 py-2">
                      <div className="font-semibold text-primary mb-2">
                        Q{item.questionNumber}: {item.question}
                      </div>
                      <div className="text-muted-foreground whitespace-pre-wrap">
                        A: {item.answer || '(No answer recorded)'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                
                {/* Current question being answered - appears AFTER previous questions */}
                {currentQuestion && (
                  <div className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50">
                    <div className="font-semibold text-blue-600 mb-2">
                      Q{currentQuestionNumber}: {currentQuestion}
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap">
                      A: {currentAnswer || `(Listening for ${participantName}'s answer...)`}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="animate-pulse w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-xs text-muted-foreground">Recording {participantName}'s answer...</span>
                    </div>
                  </div>
                )}

                {transcript.length === 0 && !currentQuestion && (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Transcript will appear here as questions are asked and answered</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};


export default LiveCall;