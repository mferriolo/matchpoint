import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export const SkillsDebugger: React.FC = () => {
  const [resumeText, setResumeText] = useState(`John Doe
john@example.com
555-1234

SKILLS:
- Botox Application
- EMR Proficiency (Epic, Cerner)
- Patient Communication
- Hormone Replacement Therapy
- Telemedicine`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const testParser = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
      
      if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not found in environment');
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { 
              role: 'system', 
              content: 'Extract structured resume data. Return only valid JSON. IMPORTANT: Extract ALL skills, certifications, procedures, software, and competencies from the resume.' 
            },
            { 
              role: 'user', 
              content: `Extract firstName, lastName, cellPhone, homePhone, workEmail, personalEmail, streetAddress, city, state, zip, currentJobTitle, currentCompany, and ALL healthcare skills/certifications/software/procedures. Return JSON: {"firstName":"","lastName":"","cellPhone":"","homePhone":"","workEmail":"","personalEmail":"","streetAddress":"","city":"","state":"","zip":"","currentJobTitle":"","currentCompany":"","skills":["skill1","skill2","skill3"]}\n\nIMPORTANT: The skills array should contain ALL mentioned skills, certifications, software, procedures, and competencies. Include technical skills, clinical skills, and soft skills.\n\nResume:\n${resumeText}` 
            }
          ],
          temperature: 0.3
        }),
      });

      const data = await response.json();
      
      console.log('===== OPENAI TEST RESPONSE =====');
      console.log('Full response:', data);
      
      const content = data.choices[0].message.content;
      console.log('Content:', content);
      
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      
      console.log('Parsed data:', parsed);
      console.log('Skills:', parsed.skills);
      console.log('Skills type:', typeof parsed.skills);
      console.log('Skills is array?', Array.isArray(parsed.skills));
      console.log('Skills length:', parsed.skills?.length);
      console.log('================================');
      
      setResult(parsed);
    } catch (err: any) {
      console.error('Test error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills Extraction Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Test Resume Text</label>
          <Textarea
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={10}
            className="mt-2"
          />
        </div>

        <Button onClick={testParser} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            'Test OpenAI Parser'
          )}
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-2">
            <h3 className="font-semibold">Result:</h3>
            <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
            
            <div className="mt-4">
              <h4 className="font-semibold">Skills Extracted:</h4>
              <ul className="list-disc pl-5 mt-2">
                {result.skills?.map((skill: string, i: number) => (
                  <li key={i}>{skill}</li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 mt-2">
                Total: {result.skills?.length || 0} skills
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};