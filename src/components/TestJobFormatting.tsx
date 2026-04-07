import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import { useChatGPT } from '@/hooks/useChatGPT';

const TestJobFormatting: React.FC = () => {
  const [jobDescription, setJobDescription] = useState(`Software Engineer - Full Stack Developer

Join our innovative tech company as a Full Stack Developer where you'll build cutting-edge web applications that serve millions of users worldwide. We're looking for a passionate developer to join our growing engineering team.

Responsibilities:
- Develop and maintain web applications using React and Node.js
- Collaborate with cross-functional teams to deliver high-quality software
- Participate in code reviews and technical discussions
- Work in an agile development environment

Requirements:
- 3+ years of experience in full-stack development
- Proficiency in JavaScript, React, Node.js
- Experience with databases and API development
- Strong problem-solving skills

We offer:
- Competitive salary and equity
- Comprehensive health benefits
- Flexible work arrangements
- Professional development budget
- Mentorship opportunities`);
  
  const [formattedResult, setFormattedResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { analyzeJob } = useChatGPT();

  const testFormatting = async () => {
    setIsLoading(true);
    try {
      const result = await analyzeJob(jobDescription);
      if (result?.content) {
        setFormattedResult(result.content);
      } else {
        setFormattedResult('Error: No content returned from ChatGPT');
      }
    } catch (error) {
      setFormattedResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Sparkles className="mr-2 h-5 w-5" />
            Test Job Description Formatting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Job Description Input:</label>
            <Textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste a job description here..."
              className="min-h-[200px]"
            />
          </div>
          
          <Button 
            onClick={testFormatting} 
            disabled={isLoading || !jobDescription.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Formatting with ChatGPT...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Format Job Description
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {formattedResult && (
        <Card>
          <CardHeader>
            <CardTitle>Formatted Result:</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg border">
              <pre className="whitespace-pre-wrap text-sm text-gray-700">
                {formattedResult}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TestJobFormatting;