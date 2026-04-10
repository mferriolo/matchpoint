import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Mic, MicOff, MessageSquare, Target, AlertTriangle, FileText, Megaphone, Play, Clock, User, HelpCircle, Send, Sparkles, X, Plus, Trash2, Copy, GripVertical } from 'lucide-react';

import { Job } from '@/types/callprompt';
import { useChatGPT } from '@/hooks/useChatGPT';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

import JobDetailsTop from './JobDetailsTop';
import CallNotesTab from './CallNotesTab';
import JobOrder from './JobOrder';
import UnansweredQuestions from './UnansweredQuestions';

interface JobDetailsTabsProps {
  job: Job;
  isEditing: boolean;
  editData: any;
  updateEditData: (updates: any) => void;
  addItem: (type: string) => void;
  updateItem: (type: string, index: number, value: string) => void;
  removeItem: (type: string, index: number) => void;
}

// Emergency logging to detect infinite render loops
let renderCount = 0;
let firstRenderTime = Date.now();

const JobDetailsTabs: React.FC<JobDetailsTabsProps> = ({
  job,
  isEditing,
  editData,
  updateEditData,
  addItem,
  updateItem,
  removeItem
}) => {
  renderCount++;
  const now = Date.now();
  const timeSinceFirst = now - firstRenderTime;
  
  console.log(`🔄 JobDetailsTabs render #${renderCount} (${timeSinceFirst}ms since first render)`);
  
  // Reset counter every 5 seconds
  if (timeSinceFirst > 5000) {
    console.log('✅ Resetting render counter (5 seconds passed)');
    renderCount = 0;
    firstRenderTime = now;
  }
  
  // Only flag as infinite loop if 100+ renders in 5 seconds
  if (renderCount > 100 && timeSinceFirst < 5000) {
    console.error('🚨 INFINITE LOOP DETECTED - 100+ renders in 5 seconds');
    console.trace();
    throw new Error('Infinite loop detected - stopping execution');
  }



  const { callChatGPT, generateSellingPoints, generateObjections, generateKnockoutQuestions, generateVoicemail, generateText, generateJobAd, loading } = useChatGPT();
  const { toast } = useToast();
  const [voicemailHook, setVoicemailHook] = useState('');
  const [voicemailScript, setVoicemailScript] = useState('');
  const [textHook, setTextHook] = useState('');
  const [textMessage, setTextMessage] = useState('');
  const [sellingPoints, setSellingPoints] = useState('');
  const [jobAd, setJobAd] = useState('');
  const [objections, setObjections] = useState('');
  const [knockoutQuestions, setKnockoutQuestions] = useState('');
  const [knockoutQuestionsArray, setKnockoutQuestionsArray] = useState<string[]>([]);
  const [isAnalyzingJob, setIsAnalyzingJob] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedVoicemails, setRecordedVoicemails] = useState<Array<{
    id: string;
    filename: string;
    date: string;
    username: string;
    duration: string;
    audioUrl: string;
  }>>([]);
  const [isSendingToCrelate, setIsSendingToCrelate] = useState(false);
  const [crelateStatus, setCrelateStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const isSavingRef = useRef(false);

  // Timer effect for recording
  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isRecording]);

  // Load from database when job changes
  useEffect(() => {
    console.log('Job ID changed, loading data...');
    // Set initial load flag IMMEDIATELY to prevent auto-save during load
    setIsInitialLoad(true);
    isSavingRef.current = true; // Lock saves during load
    
    // Use setTimeout to ensure state updates are batched
    setTimeout(() => {
      loadFromDatabase();
    }, 0);
  }, [job.id]);

  // Auto-save - simplified to prevent infinite loops
  const lastSavedRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Skip during initial load
    if (isInitialLoad) {
      console.log('Skipping auto-save during initial load');
      return;
    }

    // Skip if currently saving
    if (isSavingRef.current) {
      console.log('Already saving, skipping auto-save');
      return;
    }

    // Create hash of current data
    const currentHash = JSON.stringify({
      knockoutQuestions,
      sellingPoints,
      objections,
      voicemailHook,
      textHook,
      jobAd
    });

    // Only save if data actually changed
    if (currentHash === lastSavedRef.current) {
      return;
    }

    // Only save if we have data
    if (!knockoutQuestions && !sellingPoints && !objections && !voicemailHook && !textHook && !jobAd) {
      return;
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    console.log('Scheduling auto-save...');
    
    // Schedule save after 3 seconds of inactivity
    saveTimeoutRef.current = setTimeout(async () => {
      if (isSavingRef.current) {
        console.log('Save in progress, aborting...');
        return;
      }

      console.log('Executing auto-save...');
      isSavingRef.current = true;
      
      try {
        await saveToLocalStorage({
          knockoutQuestions,
          sellingPoints,
          objections,
          voicemailHook,
          voicemailScript,
          textHook,
          textMessage,
          jobAd,
          lastUpdated: Date.now()
        });
        
        lastSavedRef.current = currentHash;
        console.log('✅ Auto-save complete');
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        isSavingRef.current = false;
      }
    }, 3000); // 3 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [knockoutQuestions, sellingPoints, objections, voicemailHook, voicemailScript, textHook, textMessage, jobAd, isInitialLoad]);




  const loadFromDatabase = async () => {
    console.log('=== LOADING JOB DETAILS FROM DATABASE ===');
    console.log('Job ID:', job.id);
    
    try {
      const { data, error } = await supabase
        .from('job_orders')
        .select('knockout_questions, selling_points, objections, voicemail_hook, voicemail_script, text_hook, text_message, job_ad')
        .eq('id', job.id)
        .single();
      
      if (error) {
        console.error('Error loading from database:', error);
        // Fallback to localStorage
        loadFromLocalStorage();
      } else if (data) {
        console.log('Loaded from database:', data);
        
        // Set knockout questions from database
        if (data.knockout_questions && Array.isArray(data.knockout_questions)) {
          const questionsString = data.knockout_questions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n');
          setKnockoutQuestions(questionsString);
          setKnockoutQuestionsArray(data.knockout_questions);
          console.log('✅ Loaded knockout questions from database:', data.knockout_questions);
        }
        
        // Set other fields
        if (data.selling_points) setSellingPoints(data.selling_points);
        if (data.objections) setObjections(data.objections);
        if (data.voicemail_hook) setVoicemailHook(data.voicemail_hook);
        if (data.voicemail_script) setVoicemailScript(data.voicemail_script);
        if (data.text_hook) setTextHook(data.text_hook);
        if (data.text_message) setTextMessage(data.text_message);
        if (data.job_ad) setJobAd(data.job_ad);
      }
      
      // If no data in database, generate new content
      if (!data || !data.knockout_questions) {
        console.log('No data in database, generating new content...');
        await generateAllContentInParallel();
      }
      
      // CRITICAL: Release lock and mark initial load complete AFTER everything is done
      // Use setTimeout to ensure all state updates have been processed
      setTimeout(() => {
        isSavingRef.current = false;
        setIsInitialLoad(false);
        console.log('Initial load complete, auto-save now enabled');
      }, 100);
      
    } catch (error) {
      console.error('Exception loading from database:', error);
      loadFromLocalStorage();
      setTimeout(() => {
        isSavingRef.current = false;
        setIsInitialLoad(false);
      }, 100);
    }
  };





  const loadFromLocalStorage = () => {
    const savedData = localStorage.getItem(`jobDetails_${job.id}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setVoicemailHook(parsed.voicemailHook || '');
        setVoicemailScript(parsed.voicemailScript || '');
        setTextHook(parsed.textHook || '');
        setTextMessage(parsed.textMessage || '');
        setJobAd(parsed.jobAd || '');
        setSellingPoints(parsed.sellingPoints || '');
        setObjections(parsed.objections || '');
        setKnockoutQuestions(parsed.knockoutQuestions || '');
      } catch (error) {
        console.error('Error loading from localStorage:', error);
      }
    }
  };

  const saveToLocalStorage = async (data: any) => {
    try {
      // Save to localStorage for backward compatibility
      localStorage.setItem(`jobDetails_${job.id}`, JSON.stringify(data));
      
      // Also save to database
      console.log('=== SAVING JOB DETAILS TO DATABASE ===');
      console.log('Job ID:', job.id);
      console.log('Data to save:', data);
      
      const dbUpdate = {
        knockout_questions: data.knockoutQuestions ? 
          data.knockoutQuestions.split('\n').filter((q: string) => q.trim() && !q.includes('Knockout Questions:')) : 
          [],
        selling_points: data.sellingPoints || '',
        objections: data.objections || '',
        summary: data.jobAd || '',
        voicemail_hook: data.voicemailHook || '',
        voicemail_script: data.voicemailScript || '',
        text_hook: data.textHook || '',
        text_message: data.textMessage || '',
        job_ad: data.jobAd || ''
      };
      
      console.log('Database update object:', dbUpdate);
      
      const { data: updatedData, error } = await supabase
        .from('job_orders')
        .update(dbUpdate)
        .eq('id', job.id)
        .select()
        .single();
      
      if (error) {
        console.error('❌ Error saving job details to database:', error);
      } else {
        console.log('✅ Job details saved to database successfully');
        console.log('Updated data:', updatedData);
      }
    } catch (error) {
      console.error('❌ Exception saving to localStorage/database:', error);
    }
  };



  const generateAllContentInParallel = async () => {
    if (!job.jobDescription && !job.description) return;
    
    try {
      // CRITICAL: Lock saves during generation
      isSavingRef.current = true;
      console.log('🔒 Locked auto-save during content generation');
      
      // Generate all content in parallel for speed
      const [
        voicemailResult,
        textResult,
        jobAdResult,
        sellingPointsResult,
        objectionsResult,
        knockoutQuestionsResult
      ] = await Promise.all([
        generateVoicemail(job.jobDescription || job.description || '').catch(e => ({ error: e })),
        generateText(job.jobDescription || job.description || '').catch(e => ({ error: e })),
        generateJobAd(job.jobDescription || job.description || '').catch(e => ({ error: e })),
        generateSellingPoints(job.jobDescription || job.description || '').catch(e => ({ error: e })),
        generateObjections(job.jobDescription || job.description || '').catch(e => ({ error: e })),
        generateKnockoutQuestions(job.jobDescription || job.description || '').catch(e => ({ error: e }))
      ]);

      // Process voicemail result
      if (!voicemailResult.error) {
        processVoicemailResult(voicemailResult);
      }

      // Process text result
      if (!textResult.error) {
        processTextResult(textResult);
      }

      // Process job ad result
      if (!jobAdResult.error) {
        setJobAd(jobAdResult);
      }

      // Process selling points result
      if (!sellingPointsResult.error) {
        setSellingPoints(sellingPointsResult);
      }

      // Process objections result
      if (!objectionsResult.error) {
        setObjections(objectionsResult);
      }

      // Process knockout questions result
      if (!knockoutQuestionsResult.error) {
        setKnockoutQuestions(knockoutQuestionsResult);
      }

      // Save all results once at the end
      const allData = {
        voicemailHook: voicemailResult.error ? voicemailHook : (voicemailResult.hook || voicemailHook),
        voicemailScript: voicemailResult.error ? voicemailScript : (voicemailResult.script || voicemailScript),
        textHook: textResult.error ? textHook : (textResult.hook || textHook),
        textMessage: textResult.error ? textMessage : (textResult.message || textMessage),
        jobAd: jobAdResult.error ? jobAd : jobAdResult,
        sellingPoints: sellingPointsResult.error ? sellingPoints : sellingPointsResult,
        objections: objectionsResult.error ? objections : objectionsResult,
        knockoutQuestions: knockoutQuestionsResult.error ? knockoutQuestions : knockoutQuestionsResult,
        lastUpdated: Date.now()
      };
      
      // Save once at the end
      await saveToLocalStorage(allData);
      
      console.log('✅ Content generation complete');
    } catch (error) {
      console.error('Error generating content in parallel:', error);
    } finally {
      // CRITICAL: Always release the lock
      isSavingRef.current = false;
      console.log('🔓 Released auto-save lock');
    }
  };


  const processVoicemailResult = (result: string) => {
    console.log('Processing voicemail result:', result); // Debug log
    
    // First try the standard HOOK: and SCRIPT: format
    const hookMatch = result.match(/HOOK:\s*(.*?)(?=\n\n?SCRIPT:|$)/s);
    const scriptMatch = result.match(/SCRIPT:\s*(.*?)$/s);
    
    if (hookMatch && scriptMatch) {
      let extractedHook = hookMatch[1].trim()
        .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
        .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
        .trim();
      
      let extractedScript = scriptMatch[1].trim()
        .replace(/\[Your\s*Name\]/g, 'John')
        .replace(/Our\s*Client/g, 'our client');
      
      console.log('Extracted voicemail hook:', extractedHook);
      console.log('Extracted voicemail script:', extractedScript);
      
      setVoicemailHook(extractedHook);
      setVoicemailScript(extractedScript);
      return;
    }

    // Fallback: try to extract from a more flexible format
    const lines = result.split('\n').filter(line => line.trim());
    let hookContent = '';
    let scriptContent = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toLowerCase().includes('hook') && !hookContent) {
        // Try to extract hook from this line or the next few lines
        hookContent = line.replace(/^.*hook:?\s*/i, '').trim();
        if (!hookContent && i + 1 < lines.length) {
          hookContent = lines[i + 1].trim();
        }
      } else if (line.toLowerCase().includes('script') && !scriptContent) {
        // Try to extract script from this line or the rest of the content
        scriptContent = line.replace(/^.*script:?\s*/i, '').trim();
        if (!scriptContent) {
          // Take all remaining lines as the script
          scriptContent = lines.slice(i + 1).join(' ').trim();
        }
      }
    }

    if (hookContent || scriptContent) {
      // Clean up the extracted content
      hookContent = hookContent
        .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
        .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
        .trim();
      
      scriptContent = scriptContent
        .replace(/\[Your\s*Name\]/g, 'John')
        .replace(/Our\s*Client/g, 'our client');

      console.log('Fallback extracted voicemail hook:', hookContent);
      console.log('Fallback extracted voicemail script:', scriptContent);
      
      setVoicemailHook(hookContent || 'Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.');
      setVoicemailScript(scriptContent || `Hi, this is John from MedCentric. I'm calling regarding a Director of Case Management role with our client. What makes this role stand out is the chance to build and lead a brand-new team with full executive support. I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
    } else {
      // Final fallback - use defaults
      console.log('Using default voicemail content');
      setVoicemailHook('Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.');
      setVoicemailScript(`Hi, this is John from MedCentric. I'm calling regarding a Director of Case Management role with our client. What makes this role stand out is the chance to build and lead a brand-new team with full executive support. I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
    }
  };

  const processTextResult = (result: string) => {
    console.log('Processing text result:', result); // Debug log
    
    // First try the standard HOOK: and TEXT MESSAGE: format
    const hookMatch = result.match(/HOOK:\s*(.*?)(?=\n\n?TEXT MESSAGE:|$)/s);
    const textMatch = result.match(/TEXT MESSAGE:\s*(.*?)$/s);
    
    if (hookMatch && textMatch) {
      let extractedHook = hookMatch[1].trim()
        .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
        .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
        .trim();
      
      let extractedText = textMatch[1].trim()
        .replace(/\[Your\s*Name\]/g, 'John')
        .replace(/Our\s*Client/g, 'our client');
      
      console.log('Extracted text hook:', extractedHook);
      console.log('Extracted text message:', extractedText);
      
      setTextHook(extractedHook);
      setTextMessage(extractedText);
      return;
    }

    // Fallback: try to extract from a more flexible format
    const lines = result.split('\n').filter(line => line.trim());
    let hookContent = '';
    let textContent = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.toLowerCase().includes('hook') && !hookContent) {
        // Try to extract hook from this line or the next few lines
        hookContent = line.replace(/^.*hook:?\s*/i, '').trim();
        if (!hookContent && i + 1 < lines.length) {
          hookContent = lines[i + 1].trim();
        }
      } else if ((line.toLowerCase().includes('text message') || line.toLowerCase().includes('message')) && !textContent) {
        // Try to extract text from this line or the rest of the content
        textContent = line.replace(/^.*(?:text message|message):?\s*/i, '').trim();
        if (!textContent) {
          // Take all remaining lines as the text message
          textContent = lines.slice(i + 1).join(' ').trim();
        }
      }
    }

    if (hookContent || textContent) {
      // Clean up the extracted content
      hookContent = hookContent
        .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
        .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
        .trim();
      
      textContent = textContent
        .replace(/\[Your\s*Name\]/g, 'John')
        .replace(/Our\s*Client/g, 'our client');

      console.log('Fallback extracted text hook:', hookContent);
      console.log('Fallback extracted text message:', textContent);
      
      setTextHook(hookContent || 'Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.');
      setTextMessage(textContent || `Hi, this is John with MedCentric. I'm reaching out regarding a Director of Case Management role with our client. Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years. I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
    } else {
      // Final fallback - use defaults
      console.log('Using default text content');
      const hook = 'Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.';
      setTextHook(hook);
      setTextMessage(`Hi, this is John with MedCentric. I'm reaching out regarding a Director of Case Management role with our client. ${hook} I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
    }
  };

  const generateJobOrderInitial = async () => {
    // This will trigger the JobOrder component to generate and auto-save
    // We don't need to do anything here since JobOrder handles its own generation
    console.log('Job Order will be generated when the tab is accessed');
  };

  const generateKnockoutQuestionsList = async () => {
    setIsAnalyzingJob(true);
    console.log('=== ANALYZING JOB FOR KNOCKOUT QUESTIONS ===');
    console.log('Job data:', job);
    
    try {
      // Call the new edge function with detailed job information
      const { data, error } = await supabase.functions.invoke('generate-knockout-questions', {
        body: {
          jobTitle: job.title || job.job_title,
          jobDescription: job.jobDescription || job.description,
          requirements: job.requirements,
          company: job.company,
          location: job.location || `${job.city || ''}, ${job.state || ''}`.trim(),
          salary: job.salary || job.compensation || job.salary_range
        }
      });
      
      if (error) {
        console.error('Error generating questions:', error);
        throw error;
      }
      
      console.log('Generated questions:', data);
      
      // Set the generated questions
      if (data.questions && Array.isArray(data.questions)) {
        setKnockoutQuestionsArray(data.questions);
        // Also set the string version for backward compatibility
        setKnockoutQuestions(data.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
        
        toast({
          title: "Success",
          description: `Generated ${data.questions.length} knockout questions`,
        });
      } else {
        throw new Error('No questions returned');
      }
      
    } catch (error) {
      console.error('Error analyzing job:', error);
      toast({
        title: "Error",
        description: "Failed to generate knockout questions. Please try again.",
        variant: "destructive"
      });
      
      // Fallback questions
      const fallbackQuestions = [
        `What is your availability for this ${job.title} position?`,
        `How does your background align with the ${job.title} role?`,
        `What interests you most about this opportunity?`
      ];
      setKnockoutQuestionsArray(fallbackQuestions);
      setKnockoutQuestions(fallbackQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
    } finally {
      setIsAnalyzingJob(false);
    }
  };

  const generateObjectionsList = async () => {
    if (job.description) {
      try {
        const result = await generateObjections(job.description);
        setObjections(result);
      } catch (error) {
        console.error('Error generating objections:', error);
        setObjections(`1. Salary range not specified - candidates may be concerned about compensation
2. Heavy workload expectations - unclear work-life balance
3. Limited career growth information - no advancement path mentioned
4. Company stability concerns - new or unproven organization
5. Role clarity issues - responsibilities seem too broad`);
      }
    } else {
      setObjections(`1. Salary range not specified - candidates may be concerned about compensation
2. Heavy workload expectations - unclear work-life balance
3. Limited career growth information - no advancement path mentioned
4. Company stability concerns - new or unproven organization
5. Role clarity issues - responsibilities seem too broad`);
    }
  };
  const generateVoicemailContent = async () => {
    if (job.description) {
      try {
        const result = await generateVoicemail(job.description);
        
        console.log('Voicemail generation result:', result); // Debug log
        
        // Parse the result to extract hook and script
        const hookMatch = result.match(/HOOK:\s*(.*?)(?=\n\n?SCRIPT:|$)/s);
        const scriptMatch = result.match(/SCRIPT:\s*(.*?)$/s);
        
        console.log('Hook match:', hookMatch); // Debug log
        console.log('Script match:', scriptMatch); // Debug log
        
        if (hookMatch && scriptMatch) {
          let extractedHook = hookMatch[1].trim();
          let extractedScript = scriptMatch[1].trim();
          
          // Remove any greeting from hook - be more aggressive with patterns
          extractedHook = extractedHook
            .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*Kim\s*from\s*Our\s*Client\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*MedCentric\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*Our\s*Client\.?\s*/i, '')
            .trim();
          
          // Replace placeholders in script
          // Replace placeholders in script
          extractedScript = extractedScript
            .replace(/\[Your\s*Name\]/g, 'John') // Replace with actual user name
            .replace(/Our\s*Client/g, 'our client');
          console.log('Extracted hook:', extractedHook); // Debug log
          console.log('Extracted script:', extractedScript); // Debug log
          
          setVoicemailHook(extractedHook);
          setVoicemailScript(extractedScript);
        } else {
          // If parsing fails, try to split by lines and look for HOOK: and SCRIPT: patterns
          const lines = result.split('\n');
          let hookContent = '';
          let scriptContent = '';
          let currentSection = '';
          
          for (const line of lines) {
            if (line.startsWith('HOOK:')) {
              currentSection = 'hook';
              hookContent = line.replace('HOOK:', '').trim();
            } else if (line.startsWith('SCRIPT:')) {
              currentSection = 'script';
              scriptContent = line.replace('SCRIPT:', '').trim();
            } else if (currentSection === 'hook' && line.trim()) {
              hookContent += (hookContent ? ' ' : '') + line.trim();
            } else if (currentSection === 'script' && line.trim()) {
              scriptContent += (scriptContent ? ' ' : '') + line.trim();
            }
          }
          
          if (hookContent && scriptContent) {
            // Remove greeting from hook if it exists
            hookContent = hookContent
              .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*Kim\s*from\s*Our\s*Client\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*MedCentric\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*Our\s*Client\.?\s*/i, '')
              .trim();
            
            // Replace placeholders in script
            scriptContent = scriptContent
              .replace(/\[Your\s*Name\]/g, 'John') // Replace with actual user name
              .replace(/Our\s*Client/g, 'our client');
            
            setVoicemailHook(hookContent);
            setVoicemailScript(scriptContent);
          } else {
            // Final fallback - use the example hook
            setVoicemailHook('Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.');
            setVoicemailScript(`Hi, this is John from MedCentric. I'm calling regarding a Director of Case Management role with our client. What makes this role stand out is the chance to build and lead a brand-new team with full executive support. I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
          }
        }
      } catch (error) {
        console.error('Error generating voicemail:', error);
        // Provide defaults
        setVoicemailHook('Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.');
        setVoicemailScript(`Hi, this is John from MedCentric. I'm calling regarding a Director of Case Management role with our client. What makes this role stand out is the chance to build and lead a brand-new team with full executive support. I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
      }
    } else {
      // Provide defaults
      setVoicemailHook('Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.');
      setVoicemailScript(`Hi, this is John from MedCentric. I'm calling regarding a Director of Case Management role with our client. What makes this role stand out is the chance to build and lead a brand-new team with full executive support. I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
    }
  };

  const regenerateVoicemailScript = async () => {
    if (voicemailHook.trim()) {
      try {
        const prompt = `Using this hook: "${voicemailHook}"

Create a professional voicemail script following this 5-step structure:

Step 1 – Start with a polite introduction
Introduce yourself by name and company.
Mention that you are reaching out about a career opportunity.
Example: "Hi [Candidate Name], this is [Your Name] with MedCentric…"

Step 2 – Reference the role and client (confidentially)
Mention the position title.
Refer to the employer as "our client" (not by name).
Example: "…I'm reaching out regarding a Director of Care Coordination role with our client…"

Step 3 – Deliver the hook
Insert the single strongest selling point from the job description.
Phrase it as a benefit that makes this role exceptional.
Example: "…What makes this role stand out is the chance to build and lead a brand-new team with full executive support."

Step 4 – Invite response / next step
Keep the ask simple: a return call, or check email for details.
Provide your callback number clearly.
Example: "…I'd love to share more details with you. Please give me a call back at [phone number]…"

Step 5 – Close professionally
Thank them for their time.
End warmly but concisely.

Return only the voicemail script without any additional formatting or labels.`;
        
        const result = await callChatGPT('analyze_job', { prompt });
        if (result?.content) {
          setVoicemailScript(result.content);
        }
      } catch (error) {
        console.error('Error regenerating voicemail script:', error);
      }
    }
  };
  const regenerateTextMessage = async () => {
    if (textHook.trim()) {
      try {
        const prompt = `Using this hook: "${textHook}"

Create a professional text message following this 5-step structure:

Step 1 – Start with a polite introduction
Introduce yourself by name and company.
Mention that you are reaching out about a career opportunity.
Example: "Hi [Candidate Name], this is [Your Name] with MedCentric…"

Step 2 – Reference the role and client (confidentially)
Mention the position title.
Refer to the employer as "our client" (not by name).
Example: "…I'm reaching out regarding a Director of Care Coordination role with our client…"

Step 3 – Deliver the hook
Insert the single strongest selling point from the job description.
Phrase it as a benefit that makes this role exceptional.
Example: "…What makes this role stand out is the chance to build and lead a brand-new team with full executive support."

Step 4 – Invite response / next step
Keep the ask simple: a return call, or check email for details.
Provide your callback number clearly.
Example: "…I'd love to share more details with you. Please give me a call back at [phone number]…"

Step 5 – Close professionally
Thank them for their time.
End warmly but concisely.

Return only the text message without any additional formatting or labels.`;
        
        const result = await callChatGPT('analyze_job', { prompt });
        if (result?.content) {
          setTextMessage(result.content);
        }
      } catch (error) {
        console.error('Error regenerating text message:', error);
      }
    }
  };

  const generateTextMessage = async () => {
    if (job.description) {
      try {
        const result = await generateText(job.description);

        console.log('Text generation result:', result); // Debug log
        
        // Parse the result to extract hook and text message
        const hookMatch = result.match(/HOOK:\s*(.*?)(?=\n\n?TEXT MESSAGE:|$)/s);
        const textMatch = result.match(/TEXT MESSAGE:\s*(.*?)$/s);
        
        console.log('Text Hook match:', hookMatch); // Debug log
        console.log('Text Message match:', textMatch); // Debug log
        
        if (hookMatch && textMatch) {
          let extractedHook = hookMatch[1].trim();
          let extractedText = textMatch[1].trim();
          
          // Remove any greeting from hook - be more aggressive with patterns
          extractedHook = extractedHook
            .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*Kim\s*from\s*Our\s*Client\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*MedCentric\.?\s*/i, '')
            .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*Our\s*Client\.?\s*/i, '')
            .trim();
          
          // Replace placeholders in text message
          extractedText = extractedText
            .replace(/\[Your\s*Name\]/g, 'John') // Replace with actual user name
            .replace(/Our\s*Client/g, 'our client');
          
          console.log('Extracted text hook:', extractedHook); // Debug log
          console.log('Extracted text message:', extractedText); // Debug log
          
          setTextHook(extractedHook);
          // For text message, use the hook as the core of the message
          setTextMessage(`${extractedHook} ${extractedText}`);
        } else {
          // If parsing fails, try to split by lines and look for HOOK: and TEXT MESSAGE: patterns
          const lines = result.split('\n');
          let hookContent = '';
          let textContent = '';
          let currentSection = '';
          
          for (const line of lines) {
            if (line.startsWith('HOOK:')) {
              currentSection = 'hook';
              hookContent = line.replace('HOOK:', '').trim();
            } else if (line.startsWith('TEXT MESSAGE:')) {
              currentSection = 'text';
              textContent = line.replace('TEXT MESSAGE:', '').trim();
            } else if (currentSection === 'hook' && line.trim()) {
              hookContent += (hookContent ? ' ' : '') + line.trim();
            } else if (currentSection === 'text' && line.trim()) {
              textContent += (textContent ? ' ' : '') + line.trim();
            }
          }
          
          if (hookContent && textContent) {
            // Remove greeting from hook if it exists
            hookContent = hookContent
              .replace(/^Hi,?\s*this\s*is\s*\[?Your\s*Name\]?\s*from\s*Our\s*Client\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*\[?[^,\]]*\]?\s*from\s*[^.]*\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*Kim\s*from\s*Our\s*Client\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*MedCentric\.?\s*/i, '')
              .replace(/^Hi,?\s*this\s*is\s*[^,]*\s*from\s*Our\s*Client\.?\s*/i, '')
              .trim();
            
            // Replace placeholders in text content
            textContent = textContent
              .replace(/\[Your\s*Name\]/g, 'John') // Replace with actual user name
              .replace(/Our\s*Client/g, 'our client');
            
            setTextHook(hookContent);
            setTextMessage(textContent);
          } else {
            // Final fallback - use the example hook
            const hook = 'Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.';
            setTextHook(hook);
            setTextMessage(`Hi, this is John with MedCentric. I'm reaching out regarding a Director of Case Management role with our client. ${hook} I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
          }
        }
      } catch (error) {
        console.error('Error generating text message:', error);
        // Provide defaults
        const hook = 'Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.';
        setTextHook(hook);
        setTextMessage(`Hi, this is John with MedCentric. I'm reaching out regarding a Director of Case Management role with our client. ${hook} I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
      }
    } else {
      // Provide defaults
      const hook = 'Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.';
      setTextHook(hook);
      setTextMessage(`Hi, this is John with MedCentric. I'm reaching out regarding a Director of Case Management role with our client. ${hook} I'd love to share more details with you. Please give me a call back at your convenience. Thank you for your time.`);
    }
  };
  const generateJobAdContent = async () => {
    // Check localStorage first for cached job ad
    const cachedJobAd = localStorage.getItem(`jobAd_${job.id}`);
    if (cachedJobAd) {
      setJobAd(cachedJobAd);
      return;
    }

    if (!job.description) {
      setJobAd(`**About the Job**

Join Our Client as a ${job.title}!

**Who You Are**

A talented professional ready to make an impact.

**Who We Are**

Our Client is a growing organization committed to excellence.

**Your Role**

• Lead key initiatives
• Drive results and innovation
• Collaborate with talented teams

**How You Qualify**

• Relevant experience in the field
• Strong communication skills
• Team player with problem-solving abilities

**How You Are Supported**

We offer competitive compensation, benefits, and a collaborative work environment.`);
      return;
    }

    try {
      const result = await generateJobAd(job.description);
      setJobAd(result);
      // Cache the result
      localStorage.setItem(`jobAd_${job.id}`, result);
    } catch (error) {
      console.error('Error generating job ad:', error);
      setJobAd(`**About the Job**

Join Our Client as a ${job.title}!

**Who You Are**

A talented professional ready to make an impact.

**Who We Are**

Our Client is a growing organization committed to excellence.

**Your Role**

• Lead key initiatives
• Drive results and innovation
• Collaborate with talented teams

**How You Qualify**

• Relevant experience in the field
• Strong communication skills
• Team player with problem-solving abilities

**How You Are Supported**

We offer competitive compensation, benefits, and a collaborative work environment.`);
    }
  };
  const generateSellingPointsList = async () => {
    if (job.description) {
      try {
        const result = await generateSellingPoints(job.description);
        setSellingPoints(result);
      } catch (error) {
        console.error('Error generating selling points:', error);
        setSellingPoints(`Based on the available information:
1. Opportunity to work as a ${job.title} at ${job.company}
2. Join a professional team environment
3. Apply your skills in this role`);
      }
    } else {
      setSellingPoints(`Based on the available information:
1. Opportunity to work as a ${job.title} at ${job.company}
2. Join a professional team environment
3. Apply your skills in this role`);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const duration = formatTime(recordingTime);
        
        const newRecording = {
          id: Date.now().toString(),
          filename: `voicemail_${Date.now()}.wav`,
          date: new Date().toLocaleDateString(),
          username: 'Current User',
          duration,
          audioUrl
        };
        setRecordedVoicemails(prev => [newRecording, ...prev]);
        
        // Clean up stream
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
      setIsRecording(false);
    } else {
      setIsRecording(true);
      await startRecording();
    }
  };

  const playRecording = (audioUrl: string) => {
    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }
    
    // Create and play new audio
    const audio = new Audio(audioUrl);
    currentAudioRef.current = audio;
    audio.play().catch(error => {
      console.error('Error playing audio:', error);
    });
  };

  const sendToCrelate = async () => {
    setIsSendingToCrelate(true);
    setCrelateStatus('idle');
    
    try {
      // Get Google Doc URL from localStorage
      let googleDocUrl = '';
      try {
        const savedJobOrder = localStorage.getItem(`jobOrder_${job.id}`);
        if (savedJobOrder) {
          const parsed = JSON.parse(savedJobOrder);
          googleDocUrl = parsed.google_doc_url || parsed.website || parsed.googleDocUrl || '';
        }
      } catch (error) {
        console.error('Error retrieving Google Doc URL from localStorage:', error);
      }

      // Prepare complete job record payload for Zapier webhook
      const jobPayload = {
        // Basic job information
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location || `${job.city}, ${job.state}`,
        description: job.jobDescription || job.description || '',
        targetSalary: job.salary || job.compensation || '', // Changed from 'salary' to 'targetSalary'
        startDate: job.startDate || new Date().toISOString().split('T')[0],
        numberOfOpenings: job.numberOfOpenings || 1,
        jobType: job.type || 'Full-time',
        status: 'Open',
        
        // Address fields (include even if empty)
        streetAddress: job.streetAddress || '',
        city: job.city || '',
        state: job.state || '',
        zipCode: job.zipCode || job.zip || '',
        
        // Additional job details
        compensation: job.compensation || '', // Keep original field name too
        benefits: job.benefits,
        requirements: job.requirements,
        responsibilities: job.responsibilities,
        
        // Generated content - Remove salary info from job ad
        sellingPoints: sellingPoints,
        knockoutQuestions: knockoutQuestions,
        voicemailHook: voicemailHook,
        voicemailScript: voicemailScript,
        textHook: textHook,
        textMessage: textMessage,
        jobAd: jobAd.replace(/\$[\d,]+(?:k|K)?(?:\s*[-–—to]\s*\$?[\d,]+(?:k|K)?)?/g, '').replace(/salary|compensation|pay|wage/gi, ''), // Remove salary references
        
        // Job Order Doc URL
        jobOrderDocUrl: googleDocUrl,
        googleDocUrl: googleDocUrl,
        
        // Metadata
        createdAt: new Date().toISOString(),
        source: 'MedCentric Job Processor'
      };

      console.log('Sending complete job payload to Zapier webhook:', jobPayload);

      // Send to Zapier webhook
      const response = await fetch('https://hooks.zapier.com/hooks/catch/9770/udg121y/', {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobPayload),
      });
      // With no-cors mode, we can't check response status, so assume success
      console.log('Sent to Zapier webhook (no-cors mode)');
      setCrelateStatus('success');
    } catch (error) {
      console.error('Error sending to Zapier webhook:', error);
      setCrelateStatus('error');
    } finally {
      setIsSendingToCrelate(false);
    }
  };

  // Knockout questions management functions
  const addKnockoutQuestion = () => {
    const newArray = [...knockoutQuestionsArray, ''];
    setKnockoutQuestionsArray(newArray);
    updateKnockoutQuestionsState(newArray);
  };

  const updateKnockoutQuestion = (index: number, value: string) => {
    const newArray = [...knockoutQuestionsArray];
    newArray[index] = value;
    setKnockoutQuestionsArray(newArray);
    updateKnockoutQuestionsState(newArray);
  };

  const deleteKnockoutQuestion = (index: number) => {
    const newArray = knockoutQuestionsArray.filter((_, i) => i !== index);
    setKnockoutQuestionsArray(newArray);
    updateKnockoutQuestionsState(newArray);
    toast({
      title: "Question Deleted",
      description: "Knockout question has been removed",
    });
  };

  const duplicateKnockoutQuestion = (index: number) => {
    const newArray = [...knockoutQuestionsArray];
    newArray.splice(index + 1, 0, knockoutQuestionsArray[index]);
    setKnockoutQuestionsArray(newArray);
    updateKnockoutQuestionsState(newArray);
    toast({
      title: "Question Duplicated",
      description: "Knockout question has been copied",
    });
  };

  const updateKnockoutQuestionsState = (questionsArray: string[]) => {
    // Update both the array and string versions
    // CRITICAL FIX: Remove any existing numbering before adding new numbers
    const cleanedQuestions = questionsArray
      .filter(q => q.trim())
      .map(q => {
        // Remove any leading numbers like "1. ", "2. ", "Q1: ", etc.
        return q.replace(/^(\d+\.\s*)+/, '').replace(/^Q\d+:\s*/, '').trim();
      });
    
    const questionsString = cleanedQuestions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n');
    setKnockoutQuestions(questionsString);
    
    // Save the cleaned array (without numbers) to database
    saveToLocalStorage({
      knockoutQuestions: questionsString,
      sellingPoints,
      objections,
      voicemailHook,
      voicemailScript,
      textHook,
      textMessage,
      jobAd,
      lastUpdated: Date.now()
    });
  };



  return (
    <TooltipProvider>
      <div className="w-full">
        <Tabs defaultValue="job-order" className="w-full">
          <TabsList className="grid w-full grid-cols-4 grid-rows-2 gap-1 h-auto p-2 border border-gray-200 rounded-lg bg-white shadow-sm">
            <TabsTrigger value="summary" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-medcentric-50 data-[state=active]:text-medcentric-800">Summary</TabsTrigger>
            <TabsTrigger value="job-order" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-medcentric-50 data-[state=active]:text-medcentric-800">Job Order</TabsTrigger>
            <TabsTrigger value="unanswered" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
              Unanswered Questions
            </TabsTrigger>
            <TabsTrigger value="knockout" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">Knockout Questions</TabsTrigger>
            <TabsTrigger value="job-ad" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-medcentric-50 data-[state=active]:text-medcentric-800">Job Ad</TabsTrigger>
            <TabsTrigger value="call-notes" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-medcentric-50 data-[state=active]:text-medcentric-800">Call Notes</TabsTrigger>
            <TabsTrigger value="crelate" className="border border-gray-200 rounded text-sm font-medium data-[state=active]:bg-green-50 data-[state=active]:text-green-700">Send to Crelate</TabsTrigger>
          </TabsList>





      <TabsContent value="summary" className="mt-6">
        <JobDetailsTop
          job={job}
          isEditing={isEditing}
          editData={editData}
          updateEditData={updateEditData}
          addItem={addItem}
          updateItem={updateItem}
          removeItem={removeItem}
        />
      </TabsContent>
      <TabsContent value="selling" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <Target className="mr-2 h-5 w-5" />
              Selling Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sellingPoints.split('\n').filter(line => line.trim()).map((point: string, index: number) => (
                <div key={index} className="p-3 bg-green-50 rounded-lg border border-green-100">
                  <p className="text-sm text-gray-700">{point}</p>
                </div>
              ))}
            </div>
            <Button 
              onClick={generateSellingPointsList} 
              className="mt-4"
              disabled={loading}
            >
              Regenerate Selling Points
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="questions" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-blue-700">
              <MessageSquare className="mr-2 h-5 w-5" />
              Knockout Questions to Ask
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {knockoutQuestions.split('\n').filter(line => line.trim() && !line.includes('Knockout Questions:')).map((question: string, index: number) => (
                <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-sm text-gray-700">{question}</p>
                </div>
              ))}
            </div>
            <Button 
              onClick={generateKnockoutQuestionsList} 
              className="mt-4"
              disabled={loading}
            >
              Regenerate Knockout Questions
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="objections" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-orange-700">
              <AlertTriangle className="mr-2 h-5 w-5" />
              Objections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {objections.split('\n').filter(line => line.trim()).map((objection: string, index: number) => (
                <div key={index} className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                  <p className="text-sm text-gray-700">{objection}</p>
                </div>
              ))}
            </div>
            <Button 
              onClick={generateObjectionsList} 
              className="mt-4"
              disabled={loading}
            >
              Regenerate Objections
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="job-ad" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-purple-700">
              <Megaphone className="mr-2 h-5 w-5" />
              Job Advertisement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div 
                className="prose prose-sm max-w-none space-y-4"
                style={{
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  lineHeight: '1.6',
                  color: '#374151'
                }}
              >
                {jobAd.split('\n').map((line, index) => {
                  // Handle bold headings
                  if (line.match(/^\*\*(.*?)\*\*$/)) {
                    const heading = line.replace(/\*\*(.*?)\*\*/, '$1');
                    return (
                      <h3 
                        key={index}
                        style={{
                          fontSize: '1.125rem',
                          fontWeight: '700',
                          color: '#1f2937',
                          margin: '1.5rem 0 0.75rem 0',
                          borderBottom: '2px solid #e5e7eb',
                          paddingBottom: '0.5rem'
                        }}
                      >
                        {heading}
                      </h3>
                    );
                  }
                  // Handle bullet points
                  else if (line.startsWith('• ') || line.startsWith('- ')) {
                    return (
                      <div key={index} style={{ margin: '0.5rem 0' }}>
                        <span style={{ color: '#6366f1', fontWeight: '600' }}>•</span>
                        {' ' + line.substring(2)}
                      </div>
                    );
                  }
                  // Handle regular lines
                  else if (line.trim()) {
                    return (
                      <div key={index} style={{ margin: '1rem 0' }}>
                        {line}
                      </div>
                    );
                  }
                  // Handle empty lines
                  else {
                    return <div key={index} style={{ height: '0.5rem' }} />;
                  }
                })}
              </div>
            </div>
            <Button 
              onClick={generateJobAdContent}
              className="mt-6 bg-purple-600 hover:bg-purple-700"
              disabled={loading}
            >
              {loading ? 'Generating...' : 'Regenerate Advertisement'}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="voicemail" className="mt-6">
        <div className="space-y-6">
          {/* Hook Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="mr-2 h-5 w-5" />
                Hook
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="ml-2 h-4 w-4 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The hook is the key selling point that grabs attention. Adjust it to customize your voicemail script.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={voicemailHook}
                onChange={(e) => setVoicemailHook(e.target.value)}
                placeholder="Hook will be generated..."
                className="min-h-[100px]"
                disabled={loading}
              />
            </CardContent>
          </Card>
          {/* Script Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Mic className="mr-2 h-5 w-5" />
                  Script
                  {isRecording && (
                    <Badge variant="destructive" className="ml-3">
                      Recording: {formatTime(recordingTime)}
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={toggleRecording}
                  variant={isRecording ? "destructive" : "default"}
                  size="sm"
                >
                  {isRecording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {isRecording ? 'Stop Recording' : 'Record Voicemail'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={voicemailScript}
                onChange={(e) => setVoicemailScript(e.target.value)}
                placeholder="Script will be generated..."
                className="min-h-[100px]"
                disabled={loading}
              />
            </CardContent>
          </Card>

          <div>
            <Button 
              onClick={regenerateVoicemailScript} 
              disabled={loading}
            >
              Regenerate Script
            </Button>
          </div>

          {/* Recorded Voicemails Section */}
          {recordedVoicemails.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Recorded Voicemails</h4>
              <div className="space-y-3">
                {recordedVoicemails.map((recording) => (
                  <div key={recording.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-3">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => playRecording(recording.audioUrl)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{recording.filename}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {recording.duration}
                          </span>
                          <span className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {recording.username}
                          </span>
                          <span>{recording.date}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </TabsContent>
      <TabsContent value="text" className="mt-6">
        <div className="space-y-6">
          {/* Hook Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Target className="mr-2 h-5 w-5" />
                Hook
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="ml-2 h-4 w-4 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The hook is the key selling point that grabs attention. Adjust it to customize your text message.</p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={textHook}
                onChange={(e) => setTextHook(e.target.value)}
                placeholder="Hook will be generated..."
                className="min-h-[100px]"
                disabled={loading}
              />
            </CardContent>
          </Card>

          {/* Text Message Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-5 w-5" />
                Text Message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={textMessage}
                onChange={(e) => setTextMessage(e.target.value)}
                placeholder="Text message will be generated..."
                className="min-h-[100px]"
                disabled={loading}
              />
            </CardContent>
          </Card>

          <div>
            <Button 
              onClick={regenerateTextMessage} 
              disabled={loading}
            >
              Regenerate Text Message
            </Button>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="crelate" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-green-700">
              <Send className="mr-2 h-5 w-5" />
              Send Job to Crelate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full mb-4 shadow-lg">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Ready to Send to Crelate?
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  This will send the job details to your Crelate system via webhook for further processing and candidate matching.
                </p>
              </div>

              {/* Status Messages */}
              {crelateStatus === 'success' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-center text-green-700">
                    <Sparkles className="w-5 h-5 mr-2" />
                    <span className="font-medium">Successfully sent to Crelate!</span>
                  </div>
                </div>
              )}

              {crelateStatus === 'error' && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center justify-center text-red-700">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <span className="font-medium">Failed to send to Crelate. Please try again.</span>
                  </div>
                </div>
              )}

              {/* Big Shiny Button */}
              <Button
                onClick={sendToCrelate}
                disabled={isSendingToCrelate}
                className="relative px-8 py-4 text-lg font-semibold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSendingToCrelate ? (
                  <>
                    <div className="inline-flex items-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3"></div>
                      Sending to Crelate...
                    </div>
                  </>
                ) : (
                  <>
                    <Send className="mr-3 h-5 w-5" />
                    Send Job to Crelate
                    <Sparkles className="ml-3 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>

            {/* Job Summary */}
            <div className="mt-8 p-4 bg-gray-50 rounded-lg border">
              <h4 className="font-semibold text-gray-900 mb-3">Job Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Title:</span>
                  <span className="ml-2 text-gray-600">{job.title}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Company:</span>
                  <span className="ml-2 text-gray-600">{job.company}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Location:</span>
                  <span className="ml-2 text-gray-600">{job.location}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Type:</span>
                  <span className="ml-2 text-gray-600">{job.type}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="call-notes" className="mt-6">
        <CallNotesTab job={job} />
      </TabsContent>

      <TabsContent value="job-order" className="mt-6">
        <JobOrder job={job} />
      </TabsContent>

      <TabsContent value="unanswered" className="mt-6">
        <UnansweredQuestions job={job} />
      </TabsContent>

      <TabsContent value="knockout" className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center text-blue-700">
                <MessageSquare className="mr-2 h-5 w-5" />
                Knockout Questions
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  onClick={generateKnockoutQuestionsList} 
                  disabled={isAnalyzingJob}
                  variant="outline"
                  size="sm"
                >
                  {isAnalyzingJob ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate with AI
                    </>
                  )}
                </Button>
                <Button 
                  onClick={addKnockoutQuestion}
                  variant="outline"
                  size="sm"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Question
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {knockoutQuestionsArray.length === 0 ? (
              <div className="text-center p-8 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground mb-4">
                  No knockout questions yet. Generate with AI or add manually.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {knockoutQuestionsArray.map((question, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 border rounded-lg bg-card hover:shadow-sm transition-shadow">
                    {/* Drag handle (visual only) */}
                    <div className="mt-3 cursor-move text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                    </div>
                    
                    {/* Question number */}
                    <div className="mt-3 text-sm font-medium text-muted-foreground shrink-0">
                      {index + 1}.
                    </div>
                    
                    {/* Editable question text */}
                    <Textarea
                      value={question}
                      onChange={(e) => updateKnockoutQuestion(index, e.target.value)}
                      placeholder="Enter knockout question..."
                      className="flex-1"
                      rows={2}
                    />
                    
                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {/* Duplicate button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => duplicateKnockoutQuestion(index)}
                        title="Duplicate question"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      
                      {/* Delete button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteKnockoutQuestion(index)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete question"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-4 text-sm text-muted-foreground">
              {knockoutQuestionsArray.length} question(s) • Changes are saved automatically
            </div>
          </CardContent>
        </Card>
      </TabsContent>


    </Tabs>
    </div>
    </TooltipProvider>
  );
};

export default React.memo(JobDetailsTabs);