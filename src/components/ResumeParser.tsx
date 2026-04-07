import React, { useState } from 'react';
import { Upload, FileText, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;



interface ParsedResume {
  firstName: string | null;
  lastName: string | null;
  cellPhone: string | null;
  homePhone: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  currentJobTitle: string | null;
  currentCompany: string | null;
  skills: string[] | null;
}

const ResumeParser = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedResume | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const fileType = selectedFile.type;
      const fileName = selectedFile.name.toLowerCase();
      
      if (
        fileType === 'application/pdf' ||
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileType === 'application/msword' ||
        fileName.endsWith('.docx') ||
        fileName.endsWith('.doc') ||
        fileName.endsWith('.pdf')
      ) {
        setFile(selectedFile);
        setParsedData(null);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF or Word document",
          variant: "destructive",
        });
        setFile(null);
      }
    }
  };

  const parseResume = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      console.log('=== RESUME PROCESSING DEBUG ===');
      console.log('File name:', file.name);
      console.log('File type:', file.type);
      console.log('File size:', file.size);

      const fileName = file.name.toLowerCase();
      const isPDF = file.type === 'application/pdf' || fileName.endsWith('.pdf');
      const isWord = fileName.endsWith('.docx') || fileName.endsWith('.doc');
      if (isWord) {
        console.log('=== PROCESSING WORD DOCUMENT ===');
        
        // Check for old .doc format
        if (fileName.endsWith('.doc') && !fileName.endsWith('.docx')) {
          toast({
            title: "Old Word Format Not Supported",
            description: ".doc files (Word 97-2003) cannot be reliably parsed. Please convert to .docx or PDF format.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        
        try {
          // Extract text from Word document
          const arrayBuffer = await file.arrayBuffer();
          
          // Validate it's a proper .docx file (check for ZIP signature)
          const view = new DataView(arrayBuffer);
          const signature = view.getUint32(0, false);
          
          // ZIP files start with PK (0x504B)
          if (signature !== 0x504B0304 && signature !== 0x504B0506 && signature !== 0x504B0708) {
            throw new Error('Invalid .docx file format. Please ensure the file is a valid Word document.');
          }
          
          const result = await mammoth.extractRawText({ arrayBuffer });
          const resumeText = result.value;
          
          console.log('Word text extracted successfully');
          console.log('Text length:', resumeText?.length);
          
          if (!resumeText || resumeText.trim().length < 50) {
            throw new Error('Could not extract meaningful text from Word document');
          }
          
          console.log('Calling Edge Function with resumeText...');
          // Call Edge Function with extracted text
          const { data, error } = await supabase.functions.invoke('parse-resume', {
            body: { 
              resumeText: resumeText.substring(0, 30000)
            }
          });
          
          console.log('Edge Function response status:', error ? 'error' : 'success');
          
          if (error) {
            console.error('Edge function error:', error.message);
            throw new Error('Failed to parse resume: ' + (error.message || 'Unknown error'));
          }
          
          console.log('Parsed data keys:', data ? Object.keys(data) : 'no data');
          
          const parsedResult = data || {};
          setParsedData(parsedResult);
          
          
          const hasData = Object.values(parsedResult).some(val => val && String(val).trim() !== '');
          
          if (hasData) {
            toast({
              title: "Success!",
              description: "Resume parsed successfully",
            });
          } else {
            toast({
              title: "No Data Extracted",
              description: "Could not extract information from this resume.",
              variant: "default",
            });
          }
          
          setLoading(false);
          return; // Exit after processing Word doc
          
        } catch (wordError: any) {
          console.error('Word processing error:', wordError);
          setLoading(false);
          
          if (wordError.message?.includes('main document part')) {
            toast({
              title: "Invalid Word Document",
              description: "This doesn't appear to be a valid .docx file. Please ensure it's a proper Word document.",
              variant: "destructive",
            });
          } else {
            throw wordError;
          }
          return;
        }
        
        
      } else if (isPDF) {
        console.log('=== PROCESSING PDF DOCUMENT ===');
        
        try {
          // Try text extraction with PDF.js first
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
          console.log('PDF loaded, pages:', pdf.numPages);
          
          // Extract text from all pages
          const textParts = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            textParts.push(pageText);
            console.log(`Page ${i}: ${pageText.length} chars`);
          }
          
          const resumeText = textParts.join('\n\n');
          console.log('Text extraction result:', resumeText.length, 'chars');
          
          // If text extraction failed or insufficient, use Vision fallback
          if (resumeText.length < 100) {
            console.log('⚠️ Text extraction insufficient, converting to images for Vision API...');
            
            // Convert PDF pages to images
            const imagePromises = [];
            const maxPages = Math.min(pdf.numPages, 3); // First 3 pages
            
            for (let i = 1; i <= maxPages; i++) {
              imagePromises.push((async () => {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                
                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');
                
                if (!context) throw new Error('Could not get canvas context');
                
                // Render page to canvas
                await page.render({
                  canvasContext: context,
                  viewport: viewport
                }).promise;
                
                // Convert to base64 PNG
                const base64 = canvas.toDataURL('image/png').split(',')[1];
                console.log(`Page ${i} converted to image (${base64.length} chars)`);
                
                return base64;
              })());
            }
            
            const images = await Promise.all(imagePromises);
            
            // Send images to Edge Function for Vision API processing
            console.log('Sending images to Vision API...');
            
            const { data, error } = await supabase.functions.invoke('parse-resume', {
              body: {
                images: images,
                useVision: true
              }
            });
            
            if (error) throw error;
            
            console.log('✅ Vision API parsed successfully');
            setParsedData(data || {});
            
            toast({
              title: "Success!",
              description: "Resume parsed successfully using Vision AI",
            });
            
            setLoading(false);
            return;
          }
          
          // Send text to Edge Function for normal OpenAI parsing
          console.log('Sending text to Edge Function...');
          
          const { data, error } = await supabase.functions.invoke('parse-resume', {
            body: { resumeText: resumeText.substring(0, 30000) }
          });
          
          if (error) throw error;
          
          console.log('✅ Resume parsed successfully');
          setParsedData(data || {});
          
          toast({
            title: "Success!",
            description: "Resume parsed successfully",
          });
          
          setLoading(false);
          return;
          
        } catch (pdfError) {
          console.error('PDF processing error:', pdfError);
          setLoading(false);
          throw pdfError;
        }

      } else {
        throw new Error('Unsupported file type');
      }

    } catch (err) {
      console.error("Error parsing resume:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to parse resume. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary" />
              <div>
                <CardTitle className="text-2xl">AI Resume Parser</CardTitle>
                <CardDescription>
                  Upload a resume in PDF or Word format to extract contact information
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="resume-upload">Upload Resume</Label>
              <div className="flex items-center gap-4">
                <Button variant="outline" className="relative" asChild>
                  <label htmlFor="resume-upload" className="cursor-pointer">
                    <Upload className="w-4 h-4 mr-2" />
                    Choose File
                    <Input
                      id="resume-upload"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </Button>
                {file && (
                  <span className="text-sm text-muted-foreground">{file.name}</span>
                )}
              </div>
            </div>

            <Button 
              onClick={parseResume} 
              disabled={!file || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing Resume...
                </>
              ) : (
                'Parse Resume'
              )}
            </Button>

            {parsedData && (
              <div className="space-y-4 pt-6 border-t">
                <h3 className="text-lg font-semibold">Extracted Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={parsedData.firstName || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input value={parsedData.lastName || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Cell Phone</Label>
                    <Input value={parsedData.cellPhone || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Home Phone</Label>
                    <Input value={parsedData.homePhone || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Work Email</Label>
                    <Input value={parsedData.workEmail || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Personal Email</Label>
                    <Input value={parsedData.personalEmail || ''} readOnly />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label>Street Address</Label>
                    <Input value={parsedData.streetAddress || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={parsedData.city || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input value={parsedData.state || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Zip Code</Label>
                    <Input value={parsedData.zip || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Current Job Title</Label>
                    <Input value={parsedData.currentJobTitle || ''} readOnly />
                  </div>

                  <div className="space-y-2">
                    <Label>Current Company</Label>
                    <Input value={parsedData.currentCompany || ''} readOnly />
                  </div>

                  {parsedData.skills && parsedData.skills.length > 0 && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Healthcare Skills</Label>
                      <div className="p-3 bg-muted rounded-md">
                        <div className="flex flex-wrap gap-2">
                          {parsedData.skills.map((skill, index) => (
                            <span 
                              key={index}
                              className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResumeParser;