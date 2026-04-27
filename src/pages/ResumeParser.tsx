import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import mammoth from 'mammoth';

interface CandidateData {
  firstName: string;
  lastName: string;
  cellPhone: string;
  homePhone: string;
  workEmail: string;
  personalEmail: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  currentJobTitle: string;
  currentCompany: string;
}

export default function ResumeParser() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [candidateData, setCandidateData] = useState<CandidateData | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setCandidateData(null);
    }
  };

  const processFile = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const fileName = file.name.toLowerCase();
      const fileType = file.type;
      
      const isPDF = fileType === 'application/pdf' || fileName.endsWith('.pdf');
      const isWord = fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     fileType === 'application/msword' ||
                     fileName.endsWith('.docx') ||
                     fileName.endsWith('.doc');

      if (!isPDF && !isWord) {
        throw new Error('Please upload a PDF or Word document.');
      }

      if (isWord) {
        console.log('Processing Word document - extracting text in frontend...');

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const resumeText = result.value;
        
        console.log('Word text extracted:', resumeText ? 'YES' : 'NO');
        console.log('Word text length:', resumeText?.length);
        
        if (!resumeText || resumeText.trim().length === 0) {
          throw new Error('Could not extract text from Word document');
        }
        
        // Send extracted TEXT to Edge Function
        const { data, error } = await supabase.functions.invoke('parse-resume', {
          body: { 
            resumeText: resumeText.substring(0, 30000) // Send as TEXT, limit to 30k chars
          }
        });

        console.log('Full Supabase response:', { data, error });

        if (error) {
          console.error('Edge Function error:', error);
          toast({
            title: "Edge Function Error",
            description: error.message || JSON.stringify(error),
            variant: "destructive",
          });
          throw error;
        }

        console.log('Edge Function response:', data);

        if (data) {
          if (data.error) {
            console.warn('Parsing warning:', data.error);
          }
          
          setCandidateData(data);
          
          const hasData = Object.values(data).some(val => val && val !== null && val !== 'null');
          
          if (hasData) {
            toast({
              title: "Success!",
              description: "Resume parsed successfully",
            });
          } else {
            toast({
              title: "Partial Success",
              description: "Resume processed but no contact information could be extracted.",
              variant: "default",
            });
          }
        }
        
      } else if (isPDF) {
        console.log('Processing PDF file:', fileName);

        // Convert file to base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });

        console.log('File converted to base64, calling Edge Function...');

        // Call Edge Function with base64 data
        const { data, error } = await supabase.functions.invoke('parse-resume', {
          body: { 
            fileData,
            fileType: file.type
          }
        });

        console.log('Full Supabase response:', { data, error });

        if (error) {
          console.error('Edge Function error:', error);
          toast({
            title: "Edge Function Error",
            description: error.message || JSON.stringify(error),
            variant: "destructive",
          });
          throw error;
        }

        console.log('Edge Function response:', data);

        if (data) {
          if (data.error) {
            console.warn('Parsing warning:', data.error);
          }
          
          setCandidateData(data);
          
          const hasData = Object.values(data).some(val => val && val !== null && val !== 'null');
          
          if (hasData) {
            toast({
              title: "Success!",
              description: "Resume parsed successfully",
            });
          } else {
            toast({
              title: "Partial Success",
              description: "Resume processed but no contact information could be extracted.",
              variant: "default",
            });
          }
        }
      }


    } catch (err: any) {
      console.error("Error parsing resume:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to parse resume",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <Button
          onClick={() => navigate('/')}
          variant="outline"
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Resume Parser
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label htmlFor="resume-upload">Upload Resume (PDF or Word)</Label>
              <Input
                id="resume-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
              <Button
                onClick={processFile}
                disabled={!file || isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? (
                  <>Processing...</>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Parse Resume
                  </>
                )}
              </Button>
            </div>

            {candidateData && (
              <div className="space-y-4 pt-6 border-t">
                <p className="text-sm text-muted-foreground">Review and edit the information below before adding the candidate.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input 
                      value={candidateData.firstName || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, firstName: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input 
                      value={candidateData.lastName || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, lastName: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cell Phone</Label>
                    <Input 
                      value={candidateData.cellPhone || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, cellPhone: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Home Phone</Label>
                    <Input 
                      value={candidateData.homePhone || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, homePhone: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Work Email</Label>
                    <Input 
                      value={candidateData.workEmail || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, workEmail: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Personal Email</Label>
                    <Input 
                      value={candidateData.personalEmail || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, personalEmail: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Street Address</Label>
                    <Input 
                      value={candidateData.streetAddress || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, streetAddress: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input 
                      value={candidateData.city || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, city: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input 
                      value={candidateData.state || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, state: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ZIP Code</Label>
                    <Input 
                      value={candidateData.zip || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, zip: e.target.value}))}
                    />
                  </div>
                  {/* Current Job Title and Current Company on same line */}
                  <div className="space-y-2">
                    <Label>Current Job Title</Label>
                    <Input 
                      value={candidateData.currentJobTitle || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, currentJobTitle: e.target.value}))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Current Company</Label>
                    <Input 
                      value={candidateData.currentCompany || ''} 
                      onChange={(e) => setCandidateData(prev => ({...prev!, currentCompany: e.target.value}))}
                    />
                  </div>
                </div>
              </div>

            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
