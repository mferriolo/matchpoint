import { supabase } from './supabase';

export interface AIPromptVariables {
  [key: string]: string;
}

export const getAIPrompt = async (promptName: string, variables: AIPromptVariables = {}) => {
  console.log('=== FETCHING AI PROMPT ===');
  console.log('Prompt name:', promptName);
  console.log('Variables:', variables);
  
  try {
    // Fetch from ai_prompts table with correct column names
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('prompt_text, model, temperature, max_tokens')
      .eq('name', promptName)
      .single(); // Use single to get one row
    
    if (error) {
      console.error('❌ Database error fetching prompt:', error);
      throw new Error(`Failed to fetch AI prompt: ${error.message}`);
    }
    
    if (!data || !data.prompt_text) {
      console.error(`❌ AI Prompt not found or empty: ${promptName}`);
      console.log('Please configure the prompt in Admin > AI Management');
      throw new Error(`AI Prompt "${promptName}" not found or has no content. Please configure it in Admin > AI Management.`);
    }

    console.log('✅ Found prompt from database');
    console.log('Model:', data.model || 'gpt-4');
    console.log('Temperature:', data.temperature || 0.7);
    console.log('Max tokens:', data.max_tokens || 2000);
    
    // Replace variables in the template
    let processedPrompt = data.prompt_text;
    
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      processedPrompt = processedPrompt.replace(regex, value || '');
    });
    
    console.log('Processed prompt (first 200 chars):', processedPrompt.substring(0, 200));
    
    return {
      prompt: processedPrompt,
      model: data.model || 'gpt-4',
      temperature: data.temperature || 0.7,
      maxTokens: data.max_tokens || 2000
    };
  } catch (error) {
    console.error('❌ Error in getAIPrompt:', error);
    throw error;
  }
};


export const callAI = async (
  promptName: string,
  variables: AIPromptVariables = {}
) => {
  try {
    console.log('=== CALLING AI ===');
    console.log('Fetching prompt configuration for:', promptName);
    
    const { prompt, model, temperature, maxTokens } = await getAIPrompt(promptName, variables);
    
    // Fetch API key from system_settings table
    console.log('Fetching OpenAI API key from system settings...');
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'integrations.openai_api_key')
      .single();
    
    const apiKey = apiKeyData?.value || '';
    
    // Check if API key is configured
    if (!apiKey || apiKey.length < 20 || apiKey === 'sk-proj-your-openai-api-key-here') {
      console.warn('⚠️ OpenAI API key not configured in System Settings');
      return `[DEMO MODE - OpenAI API key not configured]\n\nThis is a simulated AI response. To get real AI-generated content:\n\n1. Go to Admin > System Settings\n2. Find the "Integrations" section\n3. Enter your OpenAI API key\n4. Click "Save Settings"\n\nGet your API key from: https://platform.openai.com/api-keys\n\nPrompt that would be sent:\n${prompt.substring(0, 500)}...`;
    }
    
    // Convert claude model to gpt model if needed
    const gptModel = model.includes('claude') ? 'gpt-4' : model;
    
    console.log('API Configuration:');
    console.log('- Model:', gptModel);
    console.log('- Temperature:', temperature);
    console.log('- Max tokens:', maxTokens);
    
    // For candidate presentations, use system/user message structure
    const messages = promptName === 'generate_candidate_presentation' 
      ? [
          { 
            role: 'system' as const, 
            content: prompt.split('{{CANDIDATE_DATA}}')[0] || prompt 
          },
          { 
            role: 'user' as const, 
            content: JSON.stringify(variables, null, 2) 
          }
        ]
      : [
          { 
            role: 'user' as const, 
            content: prompt 
          }
        ];
    
    console.log('Sending messages to OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: gptModel,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetail = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.error?.message || JSON.stringify(errorJson);
      } catch {
        errorDetail = errorText.substring(0, 200);
      }
      console.error('❌ OpenAI API error:', errorDetail);
      return `[API Error]\n\nCould not generate AI content: ${errorDetail}\n\nPlease check your OpenAI API key configuration.`;
    }

    
    const data = await response.json();
    const result = data.choices[0].message.content;
    
    console.log('✅ ChatGPT response received');
    console.log('Response length:', result.length, 'characters');
    console.log('First 200 chars:', result.substring(0, 200));
    
    return result;
    
  } catch (error) {
    console.error('❌ ChatGPT call failed:', error);
    
    // If it's a database/prompt fetch error, be specific
    if (error instanceof Error && error.message.includes('AI Prompt')) {
      return `[Configuration Error]\n\n${error.message}\n\nPlease go to Admin > AI Management and ensure the "${promptName}" prompt is configured.`;
    }
    
    // Return user-friendly error instead of throwing
    return `[Error]\n\nFailed to generate AI content: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe AI prompts have been saved, but AI generation features require a valid OpenAI API key.`;
  }
};
