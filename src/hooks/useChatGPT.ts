import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callAI, getAIPrompt } from '@/lib/aiPrompts';


const FUNCTION_NAME = 'chatgpt-integration';

const getClientRedactSetting = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'chatgpt.client_name_redact')
      .single();
    
    if (error || !data) return true; // Default to true
    return data.value;
  } catch (error) {
    console.error('Error fetching client redact setting:', error);
    return true; // Default to true
  }
};

const addRedactionInstruction = async (prompt: string): Promise<string> => {
  const shouldRedact = await getClientRedactSetting();
  if (shouldRedact) {
    return `Redact the name of the company, and use 'Our Client' instead.\n\n${prompt}`;
  }
  return prompt;
};

export const useChatGPT = () => {
  const [loading, setLoading] = useState(false);
  
  const generateJobSummary = async (transcript: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'call_summary',
          data: { transcript }
        }
        // Removed headers - Supabase client handles Content-Type automatically
      });


      clearTimeout(timeoutId);

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to connect to AI service');
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to generate summary');
      }
      return cleanContent(data.content);
    } catch (error: any) {
      console.error('Summary generation error:', error);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  };



  const generateJobAd = async (transcript: string) => {
    try {
      const result = await callAI('generate_job_ad_prompt', {
        JOB_DESCRIPTION: transcript
      });
      return cleanContent(result);
    } catch (error) {
      console.error('Job ad generation error:', error);
      throw error;
    }
  };


  // Helper function to clean ChatGPT responses
  // Helper function to clean ChatGPT responses
  const cleanContent = (content: string): string => {
    if (!content) return content;
    
    let cleaned = content.trim();
    
    // Check if content contains HOOK: format - if so, preserve it and return early with minimal cleaning
    if (cleaned.includes('HOOK:') && (cleaned.includes('TEXT MESSAGE:') || cleaned.includes('SCRIPT:'))) {
      // Only remove JSON code blocks but preserve the HOOK structure
      cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      // Remove any JSON wrapper that might surround the HOOK content
      cleaned = cleaned.replace(/^\s*{\s*"[^"]*":\s*"/, '').replace(/"\s*}\s*$/, '');
      return cleaned; // Return with HOOK format preserved for parsing
    }
    
    // Remove JSON code blocks and structure
    cleaned = cleaned.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Remove JSON wrapper patterns - much more aggressive
    cleaned = cleaned.replace(/^\s*{\s*$/gm, ''); // Remove standalone opening braces
    cleaned = cleaned.replace(/^\s*}\s*$/gm, ''); // Remove standalone closing braces
    cleaned = cleaned.replace(/^\s*{\s*"[^"]*":\s*{\s*$/gm, ''); // Remove {"job_ad": {
    cleaned = cleaned.replace(/^\s*"[^"]*":\s*{\s*$/gm, ''); // Remove "job_ad": {
    cleaned = cleaned.replace(/^\s*{\s*"[^"]*":\s*\[?\s*"?/gm, ''); // Remove {"selling_points": [
    cleaned = cleaned.replace(/^\s*\]\s*}\s*$/gm, ''); // Remove closing array and brace
    
    // Remove any line that starts with JSON characters and has no actual content
    cleaned = cleaned.replace(/^\s*[{}"\[\],]\s*$/gm, '');
    
    // Remove incomplete JSON property starts
    cleaned = cleaned.replace(/^\s*"[^"]*":\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*"[^"]*":\s*{[^}]*$/gm, '');
    cleaned = cleaned.replace(/^\s*"[^"]*":\s*"[^"]*$/gm, '');
    
    // Remove lines that only contain JSON structure characters
    cleaned = cleaned.replace(/^[^a-zA-Z0-9*#\-\s]+$/gm, '');
    
    // More aggressive JSON artifact removal
    cleaned = cleaned.replace(/^\s*{\s*"job_ad":\s*{\s*$/gmi, '');
    cleaned = cleaned.replace(/^\s*"[^"]*":\s*\[\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*\]\s*,?\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*}\s*,?\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*,\s*$/gm, '');
    
    // Remove any remaining JSON property patterns
    cleaned = cleaned.replace(/^\s*"[^"]*":\s*/gm, '');
    
    // Extract TEXT MESSAGE content if it's in JSON format
    const textMessageMatch = cleaned.match(/"TEXT MESSAGE":\s*"([^"]+)"/);
    if (textMessageMatch) {
      return textMessageMatch[1];
    }
    
    // Extract SCRIPT content if it's in JSON format
    const scriptMatch = cleaned.match(/"SCRIPT":\s*"([^"]+)"/);
    if (scriptMatch) {
      return scriptMatch[1];
    }
    
    // Remove JSON structure artifacts for selling points and other content
    cleaned = cleaned.replace(/"selling_points":\s*\[/g, '');
    cleaned = cleaned.replace(/"content":\s*"/g, '');
    cleaned = cleaned.replace(/^\s*"/gm, ''); // Remove quotes at start of lines
    cleaned = cleaned.replace(/",?\s*$/gm, ''); // Remove quotes and commas at end of lines
    cleaned = cleaned.replace(/\]\s*}?\s*$/g, ''); // Remove closing brackets
    cleaned = cleaned.replace(/^,\s*/gm, ''); // Remove commas at start of lines
    
    // Final cleanup - remove empty lines and trim
    cleaned = cleaned.replace(/^\s*\n/gm, '').trim();
    
    return cleaned;
  };

  const generateText = async (transcript: string) => {
    try {
      const result = await callAI('generate_text_message_prompt', {
        JOB_DESCRIPTION: transcript
      });
      return cleanContent(result);
    } catch (error) {
      console.error('Text generation error:', error);
      throw error;
    }
  };


  const generateVoicemail = async (transcript: string) => {
    try {
      const result = await callAI('generate_voicemail_prompt', {
        JOB_DESCRIPTION: transcript
      });
      return cleanContent(result);
    } catch (error) {
      console.error('Voicemail generation error:', error);
      throw error;
    }
  };




  const analyzeJob = async (description: string) => {
    if (!description) {
      throw new Error('Missing required fields: action and prompt');
    }
    
    try {
      const result = await callAI('analyze_job_prompt', {
        JOB_DESCRIPTION: description
      });
      return { content: cleanContent(result) };
    } catch (error) {
      console.error('Job analysis error:', error);
      throw error;
    }
  };


  const generateJobSpecificQuestions = async (title: string, company: string, description: string, jobType: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'generate_job_questions',
          data: { jobTitle: title, company, description, jobType }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate questions');
      return { content: data.content };
    } catch (error) {
      console.error('Question generation error:', error);
      throw error;
    }
  };

  const generateCallSummary = async (transcript: string) => {
    return generateJobSummary(transcript);
  };

  const callChatGPT = async (action: string, data: any, retries = 2) => {
    try {
      setLoading(true);
      const { data: result, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: { 
          action, 
          prompt: data.prompt || data.description || data.transcript || JSON.stringify(data)
        }
      });

      if (error) {
        // Retry on fetch/network errors
        if (retries > 0 && (error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('Failed'))) {
          console.warn(`Retrying AI call (${retries} retries left) after error:`, error.message);
          setLoading(false);
          await new Promise(r => setTimeout(r, 1500));
          return callChatGPT(action, data, retries - 1);
        }
        console.error('Supabase function error:', error);
        throw new Error('AI service unavailable. Check Supabase Edge Function.');
      }

      // Check if response is HTML instead of JSON
      if (typeof result === 'string' && (result.includes('<!DOCTYPE') || result.includes('<html>') || result.includes('upstream'))) {
        console.error('Edge function returned HTML/error page:', result.substring(0, 200));
        throw new Error('AI service returned an error page. Edge function may be misconfigured.');
      }
      
      if (!result?.success) {
        console.error('AI generation failed:', result);
        throw new Error(result?.error || 'AI generation failed');
      }
      
      // Clean the content to ensure it's valid JSON if needed
      let content = result.content;
      if (typeof content === 'string' && content.includes('```json')) {
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      }
      
      return { content };
    } catch (error: any) {
      console.error('AI generation error:', error);
      // Retry on fetch failures
      if (retries > 0 && (error?.message?.includes('fetch') || error?.message?.includes('Failed to fetch') || error?.message?.includes('network'))) {
        console.warn(`Retrying AI call (${retries} retries left) after error:`, error.message);
        setLoading(false);
        await new Promise(r => setTimeout(r, 1500));
        return callChatGPT(action, data, retries - 1);
      }
      // Provide more specific error message
      if (error?.message?.includes('upstream')) {
        throw new Error('AI service is temporarily unavailable. Please try again.');
      }
      if (error?.message?.includes('fetch')) {
        throw new Error('Network error connecting to AI service. Please check your connection and try again.');
      }
      throw new Error(error?.message || 'AI service error');
    } finally {
      setLoading(false);
    }
  };




  const getPromptingSupport = async (context: string, lastMessage: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'prompting_support',
          data: { context, lastMessage }
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to get prompting support');
      return { content: data.content };
    } catch (error) {
      console.error('Prompting support error:', error);
      throw error;
    }
  };

  const generateSellingPoints = async (transcript: string) => {
    if (!transcript) {
      throw new Error('Missing required fields: action and prompt');
    }
    
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'analyze_job',
          prompt: `From the job description, pick the most distinctive, positive, and candidate-relevant points.

Avoid generic claims like "great benefits" unless they're truly exceptional.

Make sure each point connects to something the ideal candidate values.

Example selling points from a JD:
1. Lead a brand-new care coordination team with full executive backing and a clear promotion path to VP within 2 years.
2. Work directly with C-suite executives on strategic initiatives that impact patient outcomes across 15 facilities.
3. Build your own team from the ground up with full hiring authority and $2M budget.

Step 1 – Read the job description with one guiding question
Ask: "What are the 5-7 most compelling reasons this job is worth a candidate's attention?"

Step 2 – Identify the strongest unique features
Look for standout details in areas like:
• Mission impact – How this role improves lives, patient care, or the community.
• Career growth – Clear advancement path, leadership track, or rare development opportunity.
• Work-life balance – Exceptional schedule flexibility, low call/travel, or hybrid/remote work.
• Prestige – Work with an award-winning, fast-growing, or highly innovative organization.
• Resources & support – Backing from leadership, robust team, or advanced tools/technology.
• Compensation & benefits – Exceptional packages, bonuses, or unique perks.
• Autonomy & leadership – Decision-making authority, team building, strategic influence.

Step 3 – Phrase each as a candidate-focused benefit
Rewrite each standout detail into a clear, punchy statement.
Avoid company jargon — frame it in terms of why the candidate should care.

Examples:
Instead of: "Company expanding into new markets"
Write: "Be the leader who builds a brand-new care coordination team in a high-growth market."

Step 4 – Keep each point short and powerful
Limit each to one sentence (15–25 words max).
Use strong, active language that creates excitement.
Rank by impact - most compelling first.

Step 5 – Output format
Return as a numbered list with 5-7 selling points:
1. [Most compelling selling point] – brief, punchy statement.
2. [Second strongest selling point]
3. [Third strongest selling point]
Continue until all selling points are listed.

CRITICAL: Only use information explicitly provided in the job description. Do not fabricate benefits, perks, or opportunities not mentioned. If the job description lacks specific details, create a shorter list with only the selling points that can be reasonably inferred.

Return ONLY the numbered list content, no JSON formatting or additional structure.

Job Description:
${transcript}`
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate selling points');
      return cleanContent(data.content);
    } catch (error) {
      console.error('Selling points generation error:', error);
      throw error;
    }
  };

  const generateObjections = async (transcript: string) => {
    if (!transcript) {
      return '1. Salary range not specified\n2. Work-life balance concerns\n3. Limited career growth information';
    }
    
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'analyze_job',
          prompt: `Step 1 – Read the job description through a candidate's eyes
Imagine you are an experienced professional in the role's target field.

Ask: "What might make me hesitate to apply or accept this job?"

Step 2 – Look for common objection triggers
Check for and note anything that could raise questions in these areas:
• Compensation and benefits – Salary range missing, vague bonus structure, benefits not mentioned.
• Workload and expectations – Heavy travel, on-call hours, weekend shifts, unclear performance metrics.
• Location and commute – Relocation requirement, rural or inconvenient location, unclear hybrid/remote policy.
• Company stability and reputation – New or unproven organization, recent restructuring, lack of public information.
• Role clarity – Overly broad responsibilities, unclear scope, conflicting expectations.
• Growth and advancement – No mention of career progression, leadership development, or training.
• Work culture – Missing or generic descriptions of culture, team size, or management style.

Step 3 – Phrase each as a candidate concern
Turn each trigger into a short, plain-language statement of concern:

Step 4 – Prioritize by likelihood and impact
Likelihood: How probable is it that a candidate will notice this and question it?
Impact: If true, how strongly could it affect their willingness to accept?

Rank objections starting with those most likely to derail interest.

Step 5 – Output format
Return as a numbered list:
1. Most likely/highest impact objection – short statement.
2. Second most likely objection.
Continue until all identified objections are listed.

Return ONLY the numbered list content, no JSON formatting or additional structure.

Job Description:
${transcript}`
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate objections');
      return cleanContent(data.content);
    } catch (error) {
      console.error('Objections generation error:', error);
      // Return fallback instead of throwing
      return '1. Salary range not specified\n2. Work-life balance concerns\n3. Limited career growth information';
    }
  };


  const generateKnockoutQuestions = async (transcript: string) => {
    if (!transcript) {
      throw new Error('Missing required fields: action and prompt');
    }
    
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'analyze_job',
          prompt: `IMPORTANT: Only use information explicitly provided in the job description. Do not make up or infer requirements that are not clearly stated.

Review the job description and identify all required qualifications that are explicitly mentioned (education, certifications, licenses, years of experience, technical skills, work eligibility, location, schedule requirements).

Create 3-5 knockout questions to confirm these requirements early in the conversation. 

IMPORTANT: 
- Wherever possible, make questions open-ended rather than yes/no questions. For example:
  - Instead of "Are you familiar with X?", ask "How familiar are you with X?"
  - Instead of "Do you have experience with Y?", ask "What experience do you have with Y?"
  - Instead of "Can you work Z schedule?", ask "What is your availability for Z schedule?"

- Only create questions based on requirements explicitly stated in the job description
- If the job description lacks specific requirements, create fewer questions rather than making up requirements
- Do not assume standard requirements that aren't mentioned

Return ONLY the questions as a numbered list, no JSON formatting or additional structure.

Job Description:
${transcript}`
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate knockout questions');
      return cleanContent(data.content);
    } catch (error) {
      console.error('Knockout questions generation error:', error);
      throw error;
    }
  };

  const generateGapQuestions = async (jobData: any) => {
    if (!jobData) {
      throw new Error('Missing job data for gap analysis');
    }
    
    try {
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'analyze_job',
          prompt: `Review Context: Read all provided job information carefully. Identify the role, responsibilities, company, and any supporting details.

Check Coverage: Note what information is already known (title, duties, qualifications, compensation, location). Do not repeat these.

Identify Gaps: Look for areas that are not fully explained, ambiguous, unclear or missing (culture, growth path, reporting structure, performance expectations, challenges).

Generate Questions: Write 3–5 new questions that:
- Go beyond surface details
- Seek clarification or deeper insight into gaps or uncertainties  
- Could reveal something important about the job that has not yet been stated
- Are concise, specific, and relevant to decision-making

Job Information:
Title: ${jobData.title || 'Not specified'}
Company: ${jobData.company || 'Not specified'}
Description: ${jobData.description || 'Not specified'}
Location: ${jobData.location || 'Not specified'}
Summary: ${jobData.summary || 'Not specified'}

Return ONLY 3-5 questions as a numbered list, no JSON formatting or additional structure.`
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate gap questions');
      return cleanContent(data.content);
    } catch (error) {
      console.error('Gap questions generation error:', error);
      throw error;
    }
  };

  const generateJobOrder = async (jobData: any) => {
    if (!jobData) {
      throw new Error('Missing job data for job order generation');
    }
    
    try {
      const prompt = await addRedactionInstruction(`Create a comprehensive job order document for the following position:
      
      Title: ${jobData.title || 'Not specified'}
      Company: ${jobData.company || 'Not specified'}
      Description: ${jobData.description || 'Not specified'}
      Requirements: ${jobData.requirements || 'Not specified'}
      Location: ${jobData.location || 'Not specified'}
      Summary: ${jobData.summary || 'Not specified'}
      
      Format the job order as a professional document with the following sections:
      
      **Position Overview**
      A brief summary of the role and its importance to the organization.
      
      **Key Responsibilities**
      List the main duties and responsibilities of the position.
      
      **Required Qualifications**
      List the essential qualifications, skills, and experience required.
      
      **Preferred Qualifications**
      List any additional qualifications that would be beneficial.
      
      **Compensation & Benefits**
      Include salary range (if available) and key benefits.
      
      **About Our Client**
      A brief description of the company (without naming them).
      
      Return ONLY the formatted content with markdown headings, no JSON formatting or additional structure.`);
      
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
        body: {
          action: 'analyze_job',
          prompt
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate job order');
      return cleanContent(data.content);
    } catch (error) {
      console.error('Job order generation error:', error);
      throw error;
    }
  };

  return {
    loading,
    generateJobSummary,
    generateJobAd,
    generateText,
    generateVoicemail,
    analyzeJob,
    generateJobSpecificQuestions,
    generateCallSummary,
    callChatGPT,
    getPromptingSupport,
    generateSellingPoints,
    generateObjections,
    generateKnockoutQuestions,
    generateGapQuestions,
    generateJobOrder,
  };
};