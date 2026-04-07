import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Megaphone, MessageSquare, Phone, Target, AlertTriangle, HelpCircle, Presentation, FileSearch, FileText, Lightbulb, Headphones, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { defaultAIPrompts } from '@/utils/defaultAIPrompts';

const AIManagement = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobAdPrompt, setJobAdPrompt] = useState(defaultAIPrompts.job_advertisement);
  const [candidatePrompt, setCandidatePrompt] = useState(defaultAIPrompts.generate_presentation);
  const [textMessagePrompt, setTextMessagePrompt] = useState(defaultAIPrompts.text_message);
  const [voicemailPrompt, setVoicemailPrompt] = useState(defaultAIPrompts.voicemail);
  const [sellingPointsPrompt, setSellingPointsPrompt] = useState(defaultAIPrompts.selling_points);
  const [knockoutQuestionsPrompt, setKnockoutQuestionsPrompt] = useState(defaultAIPrompts.knockout_questions);
  const [objectionsPrompt, setObjectionsPrompt] = useState(defaultAIPrompts.objections);
  const [analyzeJobPrompt, setAnalyzeJobPrompt] = useState(defaultAIPrompts.analyze_job || '');
  const [parseResumePrompt, setParseResumePrompt] = useState(defaultAIPrompts.parse_resume || '');
  const [gapQuestionsPrompt, setGapQuestionsPrompt] = useState(defaultAIPrompts.gap_questions || '');
  const [callCoachingPrompt, setCallCoachingPrompt] = useState(defaultAIPrompts.call_coaching || '');
  const [smartJobUpdatePrompt, setSmartJobUpdatePrompt] = useState(defaultAIPrompts.smart_job_update || '');


  // Load prompts from ai_prompts database table on mount
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        setLoading(true);
        console.log('Attempting to fetch prompts...');
        
        // Fetch prompts from ai_prompts table
        const { data, error } = await supabase
          .from('ai_prompts')
          .select('name, prompt_text')
          .in('name', [
            'generate_job_ad',
            'generate_candidate_presentation',
            'generate_text',
            'generate_voicemail',
            'generate_selling_points',
            'knockout_questions',
            'objections',
            'analyze_job_prompt',
            'parse_resume_prompt',
            'gap_questions_prompt',
            'call_coaching_prompt',
            'smart_job_update_prompt'
          ]);


        console.log('Database query completed');
        console.log('Fetched data:', data);

        if (error) {
          console.error('Error loading prompts:', error?.message || JSON.stringify(error));
          alert(`Failed to load AI prompts: ${error?.message || 'Unknown error'}`);
          setLoading(false);
          return;
        }

        if (data && data.length > 0) {
          // Map database prompt names to state variables
          data.forEach((prompt) => {
            switch (prompt.name) {
              case 'generate_job_ad':
                setJobAdPrompt(prompt.prompt_text);
                break;
              case 'generate_candidate_presentation':
                setCandidatePrompt(prompt.prompt_text);
                break;
              case 'generate_text':
                setTextMessagePrompt(prompt.prompt_text);
                break;
              case 'generate_voicemail':
                setVoicemailPrompt(prompt.prompt_text);
                break;
              case 'generate_selling_points':
                setSellingPointsPrompt(prompt.prompt_text);
                break;
              case 'knockout_questions':
                setKnockoutQuestionsPrompt(prompt.prompt_text);
                break;
              case 'objections':
                setObjectionsPrompt(prompt.prompt_text);
                break;
              case 'analyze_job_prompt':
                setAnalyzeJobPrompt(prompt.prompt_text);
                break;
              case 'parse_resume_prompt':
                setParseResumePrompt(prompt.prompt_text);
                break;
              case 'gap_questions_prompt':
                setGapQuestionsPrompt(prompt.prompt_text);
                break;
              case 'call_coaching_prompt':
                setCallCoachingPrompt(prompt.prompt_text);
                break;
              case 'smart_job_update_prompt':
                setSmartJobUpdatePrompt(prompt.prompt_text);
                break;
            }
          });
          
          console.log('✅ Successfully loaded AI prompts from database');
        }
        
        setLoading(false);

      } catch (error) {
        console.error('Error loading prompts:', error?.message || JSON.stringify(error));
        alert(`Failed to load AI prompts: ${error?.message || 'Unknown error'}`);
        setLoading(false);
      }
    };

    loadPrompts();
  }, []);

  const handleSavePrompts = async () => {
    try {
      setLoading(true);
      
      // Create array of prompts to save
      const promptsToSave = [
        { name: 'generate_job_ad', prompt_text: jobAdPrompt },
        { name: 'generate_candidate_presentation', prompt_text: candidatePrompt },
        { name: 'generate_text', prompt_text: textMessagePrompt },
        { name: 'generate_voicemail', prompt_text: voicemailPrompt },
        { name: 'generate_selling_points', prompt_text: sellingPointsPrompt },
        { name: 'knockout_questions', prompt_text: knockoutQuestionsPrompt },
        { name: 'objections', prompt_text: objectionsPrompt },
        { name: 'analyze_job_prompt', prompt_text: analyzeJobPrompt },
        { name: 'parse_resume_prompt', prompt_text: parseResumePrompt },
        { name: 'gap_questions_prompt', prompt_text: gapQuestionsPrompt },
        { name: 'call_coaching_prompt', prompt_text: callCoachingPrompt },
        { name: 'smart_job_update_prompt', prompt_text: smartJobUpdatePrompt }
      ];

      
      // Save each prompt to the database
      for (const prompt of promptsToSave) {
        // First try to UPDATE existing row
        const { data: updateData, error: updateError } = await supabase
          .from('ai_prompts')
          .update({ 
            prompt_text: prompt.prompt_text,
            updated_at: new Date().toISOString()
          })
          .eq('name', prompt.name)
          .select();
        
        // If UPDATE didn't find a row to update (returns empty array), INSERT a new one
        if (updateError || !updateData || updateData.length === 0) {
          console.log(`No existing prompt found for ${prompt.name}, inserting new row...`);
          
          // Create a display name from the prompt name
          const displayName = prompt.name
            .replace(/_/g, ' ')
            .replace(/prompt/gi, '')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          // Determine the function category based on prompt name
          let functionCategory = 'general';
          if (prompt.name.includes('job') || prompt.name.includes('analyze')) {
            functionCategory = 'job_analysis';
          } else if (prompt.name.includes('resume') || prompt.name.includes('parse')) {
            functionCategory = 'resume_parsing';
          } else if (prompt.name.includes('call') || prompt.name.includes('coaching')) {
            functionCategory = 'call_support';
          } else if (prompt.name.includes('gap') || prompt.name.includes('insight')) {
            functionCategory = 'job_analysis';
          }

          const { error: insertError } = await supabase
            .from('ai_prompts')
            .insert({
              name: prompt.name,
              prompt_text: prompt.prompt_text,
              prompt_template: prompt.prompt_text,
              display_name: displayName,
              function_category: functionCategory,
              model: 'gpt-4',
              temperature: 0.7,
              max_tokens: 2000
            });



          
          if (insertError) {
            console.error(`Failed to save prompt ${prompt.name}:`, insertError?.message || JSON.stringify(insertError));
            throw insertError;
          }
        } else {
          console.log(`Successfully updated prompt ${prompt.name}`);
        }
      }
      
      // Show success alert
      alert('✅ AI prompts saved successfully!');
      console.log('✅ All AI prompts saved successfully');
      
    } catch (error) {
      console.error('Failed to save prompts:', error?.message || JSON.stringify(error));
      alert('❌ Failed to save prompts. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setJobAdPrompt(defaultAIPrompts.job_advertisement);
    setCandidatePrompt(defaultAIPrompts.generate_presentation);
    setTextMessagePrompt(defaultAIPrompts.text_message);
    setVoicemailPrompt(defaultAIPrompts.voicemail);
    setSellingPointsPrompt(defaultAIPrompts.selling_points);
    setKnockoutQuestionsPrompt(defaultAIPrompts.knockout_questions);
    setObjectionsPrompt(defaultAIPrompts.objections);
    setAnalyzeJobPrompt(defaultAIPrompts.analyze_job || '');
    setParseResumePrompt(defaultAIPrompts.parse_resume || '');
    setGapQuestionsPrompt(defaultAIPrompts.gap_questions || '');
    setCallCoachingPrompt(defaultAIPrompts.call_coaching || '');
    setSmartJobUpdatePrompt(defaultAIPrompts.smart_job_update || '');
    
    toast({
      title: "Reset Complete",
      description: "All prompts have been reset to their default values.",
      duration: 3000,
    });
  };


  // Show loading indicator while prompts are being fetched
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Loading AI Settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">AI Prompt Management</h2>
          <p className="text-gray-600 mt-1">Configure AI instructions for content generation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>Reset to Defaults</Button>
          <Button onClick={handleSavePrompts}>Save Changes</Button>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-purple-600" />
              Job Advertisement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={jobAdPrompt} 
              onChange={(e) => setJobAdPrompt(e.target.value)} 
              className="w-full min-h-[200px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating job advertisements..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Presentation className="h-5 w-5 text-indigo-600" />
              Candidate Presentation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={candidatePrompt} 
              onChange={(e) => setCandidatePrompt(e.target.value)} 
              className="w-full min-h-[200px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating candidate presentations..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Text Message
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={textMessagePrompt} 
              onChange={(e) => setTextMessagePrompt(e.target.value)} 
              className="w-full min-h-[150px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating text messages..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-green-600" />
              Voicemail Script
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={voicemailPrompt} 
              onChange={(e) => setVoicemailPrompt(e.target.value)} 
              className="w-full min-h-[150px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating voicemail scripts..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" />
              Selling Points
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={sellingPointsPrompt} 
              onChange={(e) => setSellingPointsPrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating selling points..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-blue-600" />
              Knockout Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={knockoutQuestionsPrompt} 
              onChange={(e) => setKnockoutQuestionsPrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating knockout questions..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Objections Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={objectionsPrompt} 
              onChange={(e) => setObjectionsPrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for analyzing objections..."
            />
          </CardContent>
        </Card>

        {/* New AI Prompts Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-cyan-600" />
              Analyze Job Order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={analyzeJobPrompt} 
              onChange={(e) => setAnalyzeJobPrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for analyzing job orders..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" />
              Parse Resume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={parseResumePrompt} 
              onChange={(e) => setParseResumePrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for parsing resumes..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-600" />
              Gap Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={gapQuestionsPrompt} 
              onChange={(e) => setGapQuestionsPrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for generating gap questions..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-pink-600" />
              Call Coaching
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={callCoachingPrompt} 
              onChange={(e) => setCallCoachingPrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for call coaching..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-violet-600" />
              Smart Job Update
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={smartJobUpdatePrompt} 
              onChange={(e) => setSmartJobUpdatePrompt(e.target.value)} 
              className="w-full min-h-[120px] font-mono text-sm p-3 border rounded-lg" 
              placeholder="Enter the AI prompt for smart job updates..."
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleSavePrompts}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
        >
          {loading ? 'Saving...' : 'Save AI Prompts'}
        </Button>
      </div>
    </div>
  );
};

export default AIManagement;