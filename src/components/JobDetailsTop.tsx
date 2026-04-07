import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { MessageSquare, Plus, Loader2, Sparkles, FileText, Save } from 'lucide-react';
import { Job, JobType } from '@/types/callprompt';
import { supabase } from '@/lib/supabase';
import { useChatGPT } from '@/hooks/useChatGPT';
import { useCallPrompt } from '@/contexts/CallPromptContext';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJobTypes } from '@/contexts/JobTypesContext';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import ConfirmationDialog from '@/components/ui/confirmation-dialog';


interface JobDetailsTopProps {
  job: Job;
  isEditing: boolean;
  editData: any;
  updateEditData: (updates: any) => void;
  addItem: (type: string) => void;
  updateItem: (type: string, index: number, value: string) => void;
  removeItem: (type: string, index: number) => void;
}

const JobDetailsTop: React.FC<JobDetailsTopProps> = ({
  job,
  isEditing,
  editData,
  updateEditData,
  addItem,
  updateItem,
  removeItem
}) => {
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isGeneratingGapQuestions, setIsGeneratingGapQuestions] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const { generateJobSpecificQuestions, generateGapQuestions } = useChatGPT();
  const { updateJobWisdom, updateJob } = useCallPrompt();
  const { toast } = useToast();
  const { activeJobTypes } = useJobTypes();
  const { isOpen, dialogConfig, showConfirmation, hideConfirmation } = useConfirmDialog();


  const generateJobQuestions = async () => {
    setIsGeneratingQuestions(true);
    try {
      const result = await generateJobSpecificQuestions(
        job.title,
        job.company,
        job.description || '',
        job.jobType || 'Healthcare Professional'
      );
      
      if (result?.content) {
        try {
          const questions = JSON.parse(result.content);
          if (Array.isArray(questions)) {
            updateEditData({ specificJobQuestions: questions });
          }
        } catch (parseError) {
          console.error('Failed to parse questions JSON:', parseError);
          toast({
            title: "Parse Error",
            description: "Generated questions but failed to parse. Please try again.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Error generating job questions:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate job-specific questions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const generateJobGapQuestions = async () => {
    setIsGeneratingGapQuestions(true);
    try {
      console.log('Starting gap questions generation...');
      const result = await generateGapQuestions(job);
      console.log('Gap questions result:', result);
      
      if (result) {
        // Parse the numbered list into an array
        const questions = result.split('\n')
          .filter(line => line.trim() && /^\d+\./.test(line.trim()))
          .map(line => line.replace(/^\d+\.\s*/, '').trim())
        
        console.log('Parsed questions:', questions);
        
        if (questions.length > 0) {
          // Add gap questions to existing specificJobQuestions with "Not Specified" status
          const currentQuestions = editData.specificJobQuestions || specificJobQuestions || [];
          const gapQuestionsWithStatus = questions.map(q => `${q} - Not Specified`);
          updateEditData({ 
            specificJobQuestions: [...currentQuestions, ...gapQuestionsWithStatus] 
          });
          
          // Store the questions in localStorage for JobOrder to pick up
          localStorage.setItem('insightfulQuestions', JSON.stringify(questions));
          console.log('Stored in localStorage:', questions);
          
          // Dispatch a custom event to notify JobOrder
          const event = new CustomEvent('insightfulQuestionsUpdated', {
            detail: { questions }
          });
          window.dispatchEvent(event);
          console.log('Dispatched event with questions:', questions);
        } else {
          console.log('No questions parsed from result');
        }
      } else {
        console.log('No result from generateGapQuestions');
      }
    } catch (error) {
      console.error('Error generating gap questions:', error);
      toast({
        title: "Generation Failed", 
        description: "Failed to generate gap questions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingGapQuestions(false);
    }
  };

  const saveJobDetails = async () => {
    setIsSavingDetails(true);
    try {
      // Update job with new details
      const updates = {
        compensation: editData.compensation,
        startDate: editData.startDate,
        numberOfOpenings: editData.numberOfOpenings,
        streetAddress: editData.streetAddress,
        city: editData.city,
        state: editData.state,
        zipcode: editData.zipcode,
        // Auto-populate location from city and state
        location: editData.city && editData.state ? `${editData.city}, ${editData.state}` : job.location
      };
      
      await updateJobWisdom(job.id, updates);
      
      // Show success message using toast instead of alert
      toast({
        title: "Job Details Saved Successfully",
        description: "All job details have been saved and location has been updated.",
      });
    } catch (error) {
      console.error('Error saving job details:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save job details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingDetails(false);
    }
  };

  const generateSummary = async () => {
    setIsGeneratingSummary(true);
    try {
      console.log('Generating job summary from all job details...');

      // Collect all job details into one comprehensive text block
      const jobDetailsText = `
JOB TITLE: ${job.title || 'Not specified'}

COMPANY: ${job.company || 'Not specified'}

JOB DESCRIPTION:
${job.jobDescription || job.description || 'Not specified'}

LOCATION: ${editData.city && editData.state ? `${editData.city}, ${editData.state}` : job.location || 'Not specified'}

COMPENSATION: ${editData.compensation || job.compensation || 'Not specified'}

START DATE: ${editData.startDate || job.startDate || 'Not specified'}

NUMBER OF OPENINGS: ${editData.numberOfOpenings || job.numberOfOpenings || 'Not specified'}

REQUIREMENTS: ${job.requirements || 'Not specified'}

SELLING POINTS:
${job.sellingPoints?.join('\n') || 'Not specified'}

CANDIDATE NEEDS:
${(editData.candidateNeeds || candidateNeeds).join('\n') || 'Not specified'}
      `.trim();

      // Get OpenAI API key from system settings
      const { data: apiKeyData, error: apiKeyError } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'integrations.openai_api_key')
        .single();
      
      const OPENAI_API_KEY = apiKeyData?.value || '';
      
      if (!OPENAI_API_KEY || OPENAI_API_KEY.length < 20) {
        throw new Error('OpenAI API key not configured. Please add it in Admin > System Settings.');
      }


      // Fetch the prompt from database or use default
      // Fetch the prompt from database or use default
      const { data: promptData } = await supabase
        .from('ai_prompts')
        .select('prompt_text, model, temperature, max_tokens')
        .eq('name', 'generate_job_summary')
        .maybeSingle(); // Use maybeSingle() to avoid 406 error if prompt doesn't exist


      const systemPrompt = promptData?.prompt_text || `You are an expert at writing professional job summaries for executive recruiters.

Instructions for Writing a Job Summary:

1. Clarify the Purpose
The goal is to create a concise, high-level overview of the role that captures:
* The core function and primary impact of the position.
* The organizational context (what the company does and how the role contributes to it).
* The key qualifications or leadership focus that define success in the position.

This summary should be 1–2 paragraphs and read like the opening statement of a polished job description or candidate brief.

2. Write the Job Summary
Use this structure and tone:

Paragraph 1 — Overview and Organizational Context
Begin with a statement that defines what the position is and where it fits within the organization. Mention the company's mission or focus area in healthcare and how the role supports it.

Paragraph 2 — Role Impact and Candidate Profile
Describe what the person in this role will accomplish and the type of professional who will thrive in it. Reference leadership scope, collaboration, or patient/community impact.

3. Ensure Professional Consistency
* Keep the tone professional, clear, and polished (no contractions).
* Eliminate unnecessary jargon while preserving industry-accurate terms.
* The summary should stand alone as a concise snapshot of the opportunity.
* Make it 2 paragraphs maximum.
* Do not include a title or header, just the summary paragraphs.`;

      // Call OpenAI
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: promptData?.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: `Generate a professional job summary based on these job details:\n\n${jobDetailsText}`
            }
          ],
          temperature: promptData?.temperature || 0.7,
          max_tokens: promptData?.max_tokens || 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API error:', errorData);
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      const generatedSummary = data.choices[0].message.content.trim();

      console.log('✅ Summary generated successfully');
      console.log('📝 Generated summary:', generatedSummary);

      // Update the summary field in edit data
      updateEditData({ summary: generatedSummary });
      
      console.log('✅ Updated editData.summary');

      toast({
        title: "Summary Generated",
        description: "Job summary has been generated successfully. Don't forget to save your changes.",
      });
    } catch (error) {
      console.error('Error generating summary:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : 'Failed to generate summary. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSummary(false);
    }
  };


  // Get categorized questions with fallback to legacy questions
  const categorized = job.categorizedQuestions;
  const specificJobQuestions = categorized?.specificJobQuestions || job.questions?.slice(0, 11) || [];
  const candidateNeeds = categorized?.candidateNeeds || job.questions?.slice(11, 22) || [];
  const candidateQualifications = categorized?.candidateQualifications || job.questions?.slice(22) || [];

  return (
    <>
      {/* Summary Section - Changed title from "Description" to "Summary" */}
      <Card className="mb-6 bg-white/80 backdrop-blur-sm shadow-lg border-0">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center text-blue-700">
              <Sparkles className="mr-2 h-5 w-5" />
              Summary
            </CardTitle>
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={generateSummary}
                disabled={isGeneratingSummary}
              >
                {isGeneratingSummary ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-3 w-3" />
                )}
                Generate with AI
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              value={editData.summary || ''}
              onChange={(e) => updateEditData({ summary: e.target.value })}
              placeholder="Write a compelling two-paragraph summary highlighting what makes this job interesting to candidates and why it's a great opportunity..."
              className="min-h-[120px]"
            />
          ) : (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-gray-700 whitespace-pre-wrap">
                {editData.summary || job.summary || 'No summary available. Click Edit to add a compelling job summary.'}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Job Details Fields - Always Visible and Editable */}
      <Card className="mb-6 bg-white/80 backdrop-blur-sm shadow-lg border-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-green-700">
            <FileText className="mr-2 h-5 w-5" />
            Job Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
              <Select 
                value={editData.jobType || job.jobType || ''} 
                onValueChange={(value) => {
                  updateEditData({ jobType: value as JobType });
                  updateJob(job.id, { jobType: value as JobType });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select job type" />
                </SelectTrigger>
                <SelectContent>
                  {activeJobTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Compensation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compensation</label>
              <input
                type="text"
                value={editData.compensation || ''}
                onChange={(e) => updateEditData({ compensation: e.target.value })}
                placeholder="e.g., $80,000 - $120,000 or $1,500,000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>


            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={editData.startDate || new Date().toISOString().split('T')[0]}
                onChange={(e) => updateEditData({ startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Number of Openings */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Openings</label>
              <input
                type="number"
                min="1"
                value={editData.numberOfOpenings || 1}
                onChange={(e) => updateEditData({ numberOfOpenings: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Street Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={editData.streetAddress || ''}
                onChange={(e) => updateEditData({ streetAddress: e.target.value })}
                placeholder="123 Main Street"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* City */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={editData.city || ''}
                onChange={(e) => updateEditData({ city: e.target.value })}
                placeholder="New York"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* State */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={editData.state || ''}
                onChange={(e) => updateEditData({ state: e.target.value })}
                placeholder="NY"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Zipcode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zipcode</label>
              <input
                type="text"
                value={editData.zipcode || ''}
                onChange={(e) => updateEditData({ zipcode: e.target.value })}
                placeholder="10001"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Candidate Needs Section - Removed from summary tab */}
      {isEditing && (
        <Card className="mb-6 bg-white/80 backdrop-blur-sm shadow-lg border-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-purple-700">
              <MessageSquare className="mr-2 h-5 w-5" />
              Candidate Needs
              <Badge variant="secondary" className="ml-auto">
                {editData.candidateNeeds?.length || candidateNeeds.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(editData.candidateNeeds || candidateNeeds).map((need: string, index: number) => (
                <div key={index} className="group">
                  <div className="flex gap-2">
                    <Textarea
                      value={need}
                      onChange={(e) => updateItem('candidateNeeds', index, e.target.value)}
                      className="flex-1 min-h-[60px] text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem('candidateNeeds', index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addItem('candidateNeeds')}
                className="w-full border-dashed text-xs"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Need
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candidate Qualification Questions Section - Removed from summary tab */}
      {isEditing && (
        <Card className="mb-6 bg-white/80 backdrop-blur-sm shadow-lg border-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-blue-700">
              <MessageSquare className="mr-2 h-5 w-5" />
              Candidate Qualification Questions
              <Badge variant="secondary" className="ml-auto">
                {editData.specificJobQuestions?.length || specificJobQuestions.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600">Questions to assess candidate qualifications and fit for this role</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateJobQuestions}
                  disabled={isGeneratingQuestions}
                  className="text-xs"
                >
                  {isGeneratingQuestions ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  Generate AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateJobGapQuestions}
                  disabled={isGeneratingGapQuestions}
                  className="text-xs bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                >
                  {isGeneratingGapQuestions ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="mr-1 h-3 w-3" />
                  )}
                  Add Gap Questions
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {(editData.specificJobQuestions || specificJobQuestions).map((question: string, index: number) => (
                <div key={index} className="group">
                  <div className="flex gap-2">
                    <Textarea
                      value={question}
                      onChange={(e) => updateItem('specificJobQuestions', index, e.target.value)}
                      className="flex-1 min-h-[60px] text-sm"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem('specificJobQuestions', index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addItem('specificJobQuestions')}
                className="w-full border-dashed text-xs"
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Question
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={isOpen}
        onClose={hideConfirmation}
        onConfirm={dialogConfig.onConfirm}
        title={dialogConfig.title}
        message={dialogConfig.message}
        confirmText={dialogConfig.confirmText}
        cancelText={dialogConfig.cancelText}
        variant={dialogConfig.variant}
        showIcon={dialogConfig.showIcon}
      />
    </>
  );
};

export default JobDetailsTop;