import React, { useState, useEffect } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import { JOB_CATEGORIES } from '@/utils/jobTypesData';

// Static list of all job types (excluding the "Active Jobs" pseudo-category),
// computed once at module load. Previously this lived in a useState + useEffect
// inside the component, but the source data never changes at runtime.
const ALL_JOB_TYPES: string[] = [...new Set(
  Object.entries(JOB_CATEGORIES)
    .filter(([category]) => category !== 'Active Jobs')
    .flatMap(([, jobs]) => jobs)
)].sort();
import { useJobTypes } from '@/contexts/JobTypesContext';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;


interface ParsedData {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience?: Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
  }>;
  education?: Array<{
    degree: string;
    school: string;
    year: string;
  }>;
  skills?: string[];
  normalizedSkills?: string[]; // Add normalized skills field
  certifications?: string[];
  languages?: string[];
  // Additional fields for compatibility
  firstName?: string | null;
  lastName?: string | null;
  cellPhone?: string | null;
  homePhone?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  currentJobTitle?: string | null;
  currentCompany?: string | null;
  jobType?: string | null;
}


export const ResumeParser: React.FC<{ onParsed: (data: any) => void; onCancel?: () => void }> = ({ onParsed, onCancel }) => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [error, setError] = useState('');
  const { activeJobTypes } = useJobTypes();


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const fileType = selectedFile.type;
      const fileName = selectedFile.name.toLowerCase();
      
      const isValidFile = 
        fileType === 'application/pdf' ||
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileType === 'application/msword' ||
        fileName.endsWith('.pdf') ||
        fileName.endsWith('.docx') ||
        fileName.endsWith('.doc');
      
      if (isValidFile) {
        setFile(selectedFile);
        setError('');
        setParsedData(null);
      } else {
        setError('Please upload a PDF or Word document');
        setFile(null);
      }
    }
  };
  const parseResume = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('=== PARSING RESUME FILE ===');
      console.log('File name:', file.name);
      console.log('File type:', file.type);
      console.log('File size:', file.size);
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      console.log('File extension:', fileExtension);
      
      let extractedText = '';
      
      if (fileExtension === 'doc' || fileExtension === 'docx') {
        console.log('Parsing Word document with mammoth...');
        
        try {
          // Convert file to ArrayBuffer
          const arrayBuffer = await file.arrayBuffer();
          console.log('ArrayBuffer size:', arrayBuffer.byteLength);
          
          // Extract text using mammoth
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ arrayBuffer });
          
          console.log('Mammoth extraction result:');
          console.log('  - Text length:', result.value.length);
          console.log('  - First 200 chars:', result.value.substring(0, 200));
          
          if (result.messages && result.messages.length > 0) {
            console.warn('Mammoth messages:', result.messages);
          }
          
          // CRITICAL: Validate extracted text BEFORE assigning
          if (!result.value || result.value.trim().length === 0) {
            throw new Error('NO_TEXT_EXTRACTED');
          }
          
          // Enhanced binary data detection
          const hasBinaryData = (
            result.value.includes('\u0000') || // null bytes
            result.value.includes('��') || // replacement characters  
            result.value.includes('\ufffd') || // unicode replacement character
            result.value.match(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g) !== null || // control characters
            result.value.startsWith('��') || // starts with garbage
            result.value.startsWith('\u0011') || // starts with control char
            // Check if more than 10% of characters are non-printable
            (result.value.split('').filter(c => {
              const code = c.charCodeAt(0);
              return code < 32 && c !== '\n' && c !== '\r' && c !== '\t';
            }).length / result.value.length > 0.1)
          );
          
          if (hasBinaryData) {
            console.error('❌ Binary garbage detected in extracted text');
            console.error('Sample:', result.value.substring(0, 100));
            throw new Error('BINARY_DATA_DETECTED');
          }
          
          // Enhanced text validation with detailed logging
          console.log('Checking extracted text...');
          console.log('Text length:', result.value?.length || 0);
          console.log('Trimmed length:', result.value?.trim().length || 0);
          console.log('First 300 chars:', result.value?.substring(0, 300));
          
          if (result.value.trim().length < 5) { // Changed from 50 to 5
            console.warn('⚠️ Extracted text is very short - may not be a valid resume');
            throw new Error('TEXT_TOO_SHORT');
          }
          
          console.log('✅ Text check passed');

          
          // Only assign if validation passes
          extractedText = result.value;
          console.log('✅ Successfully extracted and validated text from Word document');
          
        } catch (mammothError: any) {
          console.error('❌ Error parsing Word document:', mammothError);
          
          // Provide specific error messages based on error type
          if (mammothError.message === 'BINARY_DATA_DETECTED') {
            if (fileExtension === 'doc') {
              throw new Error('Old Word Format Issue\n\nThis .doc file contains binary data that cannot be parsed. Old .doc files (Word 97-2003) are not fully supported.\n\nPlease convert to .docx or PDF:\n1. Open in Microsoft Word\n2. File → Save As\n3. Choose "Word Document (.docx)" or "PDF"\n4. Upload the converted file');
            } else {
              throw new Error('This Word document contains unreadable binary data. Please try converting to PDF format.');
            }
          }
          
          if (mammothError.message === 'NO_TEXT_EXTRACTED' || mammothError.message === 'TEXT_TOO_SHORT') {
            if (fileExtension === 'doc') {
              throw new Error('Cannot Extract Text\n\nNo readable text could be extracted from this .doc file. Old Word format files may not parse correctly.\n\nPlease convert to .docx or PDF format and try again.');
            } else {
              throw new Error('No text could be extracted from this document. The file may be corrupted or empty.');
            }
          }
          
          // Generic error for old .doc format
          if (fileExtension === 'doc') {
            throw new Error('Old Word Format Not Supported\n\n.doc files (Word 97-2003) cannot be reliably parsed.\n\nPlease convert to .docx or PDF format:\n1. Open in Microsoft Word\n2. File → Save As\n3. Choose "Word Document (.docx)" or "PDF"');
          }
          
          // Re-throw other errors
          throw mammothError;
        }
        
        // Send extracted text to AI parser
        console.log('Sending extracted text to Edge Function...');
        console.log('Text preview:', extractedText.substring(0, 100));
        
        const response = await supabase.functions.invoke('parse-resume', {
          body: { 
            resumeText: extractedText.substring(0, 30000)
          }
        });

        // Don't log the raw response object - extract data first
        console.log('Edge function response status:', response.error ? 'error' : 'success');

        // Check for error in response data (edge function returns 200 with error field)
        if (response.error || response.data?.error) {
          const errorMsg = response.data?.error || response.error?.message || 'Failed to parse resume';
          console.error('Edge function error:', errorMsg);
          throw new Error(errorMsg);
        }

        const { data } = response;
        console.log('=== RESPONSE FROM EDGE FUNCTION ===');
        console.log('Response data keys:', data ? Object.keys(data) : 'no data');
        console.log('Extracted name:', data?.firstName, data?.lastName);
        console.log('===== RESUME PARSING DEBUG =====');
        console.log('Full parsed data:', data);
        console.log('Skills field:', data?.skills);
        console.log('Skills type:', typeof data?.skills);
        console.log('Skills is array?', Array.isArray(data?.skills));
        console.log('Skills length:', data?.skills?.length);
        console.log('Skills content:', JSON.stringify(data?.skills));
        console.log('================================');
        const parsedResult = { ...data, resumeText: extractedText };
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
        
      } else if (fileExtension === 'pdf') {
        console.log('=== PARSING PDF IN BROWSER ===');
        console.log('Extracting text from PDF...');
        
        try {
          // Read PDF file as ArrayBuffer
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Load PDF document
          const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
          console.log('PDF loaded, pages:', pdf.numPages);
          
          // Extract text from all pages
          const textParts: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            textParts.push(pageText);
            console.log(`Page ${i}: ${pageText.length} chars`);
          }
          
          extractedText = textParts.join('\n\n');
          console.log('Text extraction result:', extractedText.length, 'chars');
          
          // Check if text extraction was sufficient
          if (extractedText.trim().length < 100) {
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
                
                // Render page to canvas
                await page.render({
                  canvasContext: context!,
                  viewport: viewport
                }).promise;
                
                // Convert to base64 PNG
                const base64 = canvas.toDataURL('image/png').split(',')[1];
                console.log(`Page ${i} converted to image (${base64.length} chars)`);
                
                return base64;
              })());
            }
            
            const images = await Promise.all(imagePromises);
            console.log('Sending images to Vision API...');
            
            // Send images to Edge Function for Vision API processing
            const response = await supabase.functions.invoke('parse-resume', {
              body: {
                images: images,
                useVision: true
              }
            });
            
            console.log('Edge function response status:', response.error ? 'error' : 'success');
            
            if (response.error || response.data?.error) {
              const errorMsg = response.data?.error || response.error?.message || 'Failed to parse resume';
              console.error('Edge function error:', errorMsg);
              throw new Error(errorMsg);
            }
            
            const { data } = response;
            console.log('✅ Vision API parsed successfully');
            console.log('Response data keys:', data ? Object.keys(data) : 'no data');
            console.log('Extracted name:', data?.firstName, data?.lastName);
            
            const parsedResult = { ...data, resumeText: extractedText };
            setParsedData(parsedResult);
            
            const hasData = Object.values(parsedResult).some(val => val && String(val).trim() !== '');
            
            if (hasData) {
              toast({
                title: "Success!",
                description: "Resume parsed successfully using Vision AI",
              });
            } else {
              toast({
                title: "No Data Extracted",
                description: "Could not extract information from this resume.",
                variant: "default",
              });
            }
            
            return; // Exit early after Vision API processing
          }
          
          // Text extraction was sufficient, use normal parsing
          console.log('✅ PDF text extraction successful');
          console.log('Sending extracted PDF text to Edge Function...');
          console.log('Text preview:', extractedText.substring(0, 100));
          
          const response = await supabase.functions.invoke('parse-resume', {
            body: { 
              resumeText: extractedText.substring(0, 30000)
            }
          });

          console.log('Edge function response status:', response.error ? 'error' : 'success');

          if (response.error || response.data?.error) {
            const errorMsg = response.data?.error || response.error?.message || 'Failed to parse resume';
            console.error('Edge function error:', errorMsg);
            throw new Error(errorMsg);
          }

          const { data } = response;
          console.log('=== RESPONSE FROM EDGE FUNCTION ===');
          console.log('Response data keys:', data ? Object.keys(data) : 'no data');
          console.log('Extracted name:', data?.firstName, data?.lastName);
          
          const parsedResult = { ...data, resumeText: extractedText };
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
          
        } catch (pdfError: any) {
          console.error('❌ Error parsing PDF:', pdfError);
          throw new Error('Failed to parse PDF: ' + (pdfError.message || 'Unknown error'));
        }

      } else {
        throw new Error(`Unsupported file format: .${fileExtension}. Please use .docx or .pdf`);
      }

    } catch (err: any) {
      console.error('Error parsing resume:', err);
      const errorMessage = err.message || 'Failed to parse resume';
      setError(errorMessage);
      toast({
        title: "Parsing Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  const handleSubmit = async () => {
    if (!parsedData) return;

    // Upload the resume file to Supabase Storage
    const uploadResumeFile = async () => {
      if (!file) {
        console.log('=== UPLOAD RESUME: No file provided ===');
        return null;
      }

      try {
        console.log('=== UPLOADING RESUME ===');
        console.log('File:', file.name, 'Size:', file.size, 'Type:', file.type);
        
        // Generate unique filename
        const timestamp = Date.now();
        const fileExt = file.name.split('.').pop();
        const fileName = `${timestamp}_${parsedData.firstName || 'candidate'}_${parsedData.lastName || ''}.${fileExt}`;
        const filePath = `resumes/${fileName}`;
        
        console.log('Upload path:', filePath);
        console.log('Attempting upload to bucket: candidate-resumes');

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('candidate-resumes')
          .upload(filePath, file);

        console.log('Upload result:', { uploadData, uploadError });

        if (uploadError) {
          console.error('Error uploading resume:', uploadError);
          console.error('Upload error details:', JSON.stringify(uploadError));
          toast({
            title: "Upload Warning",
            description: "Resume file could not be uploaded, but candidate data will be saved.",
            variant: "default",
          });
          return null;
        }

        console.log('Upload successful! Getting public URL...');

        // Get public URL
        const { data } = supabase.storage
          .from('candidate-resumes')
          .getPublicUrl(filePath);

        console.log('Public URL:', data.publicUrl);
        return data.publicUrl;
      } catch (error) {
        console.error('Error in uploadResumeFile:', error);
        console.error('Caught exception:', JSON.stringify(error));
        return null;
      }
    };


    const resumeUrl = await uploadResumeFile();
    
    console.log('=== SAVING CANDIDATE ===');
    console.log('Resume URL from upload:', resumeUrl);

    // Calculate years of experience from the experience array
    const experienceYears = parsedData.experience && parsedData.experience.length > 0
      ? `${parsedData.experience.length}+ years`
      : '';
    
    // Build the candidate object with all available data
    const candidateData = {
      name: parsedData.name || `${parsedData.firstName || ''} ${parsedData.lastName || ''}`.trim() || 'Unknown',
      firstName: parsedData.firstName || parsedData.name?.split(' ')[0] || '',
      lastName: parsedData.lastName || parsedData.name?.split(' ').slice(1).join(' ') || '',
      email: parsedData.email || '',
      phone: parsedData.phone || parsedData.cellPhone || parsedData.homePhone || '',
      cellPhone: parsedData.cellPhone || '',
      homePhone: parsedData.homePhone || '',
      location: parsedData.location || (parsedData.city && parsedData.state ? `${parsedData.city}, ${parsedData.state}` : ''),
      currentJobTitle: parsedData.currentJobTitle || parsedData.experience?.[0]?.title || '',
      currentCompany: parsedData.currentCompany || parsedData.experience?.[0]?.company || '',
      streetAddress: parsedData.streetAddress || '',
      city: parsedData.city || '',
      state: parsedData.state || '',
      zip: parsedData.zip || '',
      summary: parsedData.summary || '',
      jobType: parsedData.jobType || '', // Include job type
      // Convert experience array to a string for display
      experience: experienceYears,
      // Store the detailed experience array separately
      experienceDetails: parsedData.experience || [],
      education: parsedData.education || [],
      skills: parsedData.skills || [],
      normalizedSkills: parsedData.normalizedSkills || [], // Include normalized skills
      certifications: parsedData.certifications || [],
      languages: parsedData.languages || [],
      // Store the resume URL from Supabase Storage
      resumeUrl: resumeUrl,
      resumeFileName: file?.name || '',
    };

    
    console.log('===== BEFORE SAVING CANDIDATE =====');
    console.log('candidateData.skills:', candidateData.skills);
    console.log('candidateData.normalizedSkills:', candidateData.normalizedSkills);
    console.log('Full candidate data being saved:', candidateData);
    console.log('Resume URL in candidate data:', candidateData.resumeUrl);
    console.log('====================================');
    
    onParsed(candidateData);
  };




  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e);
  };


  const isProcessing = loading;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resume Parser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center w-full">
          <label
            htmlFor="resume-upload"
            className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-10 h-10 mb-3 text-gray-400" />
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">PDF or DOCX recommended (MAX. 10MB)</p>
              <p className="text-xs text-red-500 mt-1 font-medium">⚠️ Old .doc files (Word 97-2003) are NOT supported</p>
              <p className="text-xs text-gray-400">Please convert .doc files to .docx or PDF format</p>
            </div>
            <input
              id="resume-upload"
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx"
              onChange={handleFileSelect}
              disabled={isProcessing}
            />
          </label>
        </div>


        {file && (
          <div className="text-center">
            {/* Display different icon based on file type */}
            {file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? (
              // PDF Icon - Red
              <svg className="h-12 w-12 mx-auto mb-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#DC2626" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <text x="12" y="16" fontSize="6" fill="white" textAnchor="middle" fontWeight="bold" fontFamily="Arial, sans-serif">PDF</text>
              </svg>
            ) : (
              // Word Document Icon - Blue
              <svg className="h-12 w-12 mx-auto mb-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" fill="#2563EB" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 2V8H20" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <text x="12" y="16" fontSize="5" fill="white" textAnchor="middle" fontWeight="bold" fontFamily="Arial, sans-serif">DOC</text>
              </svg>
            )}
            <p className="text-sm font-medium">{file.name}</p>
          </div>
        )}


        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {file && !parsedData && (
          <Button onClick={parseResume} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Parsing Resume...
              </>
            ) : (
              'Parse Resume'
            )}
          </Button>
        )}
        {parsedData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Review and edit the information below before adding the candidate.</p>
            
            {/* Job Type Selection - MOVED TO TOP AND MADE PROMINENT */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <Label htmlFor="jobType" className="text-base font-semibold text-blue-900">Job Type * (Required)</Label>
              <Select 
                value={parsedData.jobType || ''}
                onValueChange={(value) => {
                  console.log('Selected job type:', value);
                  setParsedData(prev => prev ? {...prev, jobType: value} : null);
                }}
              >
                <SelectTrigger id="jobType" className="mt-2">
                  <SelectValue placeholder="Select a job type" />
                </SelectTrigger>
                <SelectContent>
                  {/* Active Job Types Section */}
                  {activeJobTypes.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-sm font-semibold text-green-700 bg-green-50 pointer-events-none">
                        Active Job Types
                      </div>
                      {activeJobTypes.map((jobType) => (
                        <SelectItem key={`active-${jobType}`} value={jobType}>
                          {jobType}
                        </SelectItem>
                      ))}
                      <div className="my-1 h-px bg-gray-300 pointer-events-none" />
                    </>
                  )}
                  
                  {/* All Job Types Section */}
                  <div className="px-2 py-1.5 text-sm font-semibold text-gray-700 pointer-events-none">
                    All Job Types
                  </div>
                  {ALL_JOB_TYPES.map((jobType) => (
                    <SelectItem key={`all-${jobType}`} value={jobType}>
                      {jobType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input 
                  id="firstName"
                  value={parsedData.firstName || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, firstName: e.target.value} : null)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input 
                  id="lastName"
                  value={parsedData.lastName || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, lastName: e.target.value} : null)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cellPhone">Cell Phone</Label>
                <Input 
                  id="cellPhone"
                  value={parsedData.cellPhone || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, cellPhone: e.target.value} : null)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="homePhone">Home Phone</Label>
                <Input 
                  id="homePhone"
                  value={parsedData.homePhone || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, homePhone: e.target.value} : null)}
                />
              </div>
              
              
              <div className="space-y-2 col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email"
                  value={parsedData.email || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, email: e.target.value} : null)}
                />
              </div>

              
              <div className="space-y-2 col-span-2">
                <Label htmlFor="streetAddress">Street Address</Label>
                <Input 
                  id="streetAddress"
                  value={parsedData.streetAddress || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, streetAddress: e.target.value} : null)}
                />
              </div>
              
              {/* City field spans both columns */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="city">City</Label>
                <Input 
                  id="city"
                  value={parsedData.city || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, city: e.target.value} : null)}
                />
              </div>

              
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input 
                  id="state"
                  value={parsedData.state || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, state: e.target.value} : null)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="zip">Zip Code</Label>
                <Input 
                  id="zip"
                  value={parsedData.zip || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, zip: e.target.value} : null)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="currentJobTitle">Current Job Title</Label>
                <Input 
                  id="currentJobTitle"
                  value={parsedData.currentJobTitle || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, currentJobTitle: e.target.value} : null)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="currentCompany">Current Company</Label>
                <Input 
                  id="currentCompany"
                  value={parsedData.currentCompany || ''} 
                  onChange={(e) => setParsedData(prev => prev ? {...prev, currentCompany: e.target.value} : null)}
                />
              </div>
              {/* Skills Section - Editable */}
              {parsedData.skills && parsedData.skills.length > 0 && (
                <div className="space-y-2 col-span-2">
                  <Label>Healthcare Skills</Label>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.skills.map((skill, index) => (
                      <Input
                        key={index}
                        value={skill}
                        onChange={(e) => {
                          const newSkills = [...(parsedData.skills || [])];
                          newSkills[index] = e.target.value;
                          setParsedData(prev => prev ? {...prev, skills: newSkills} : null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            // Add a new skill
                            const newSkills = [...(parsedData.skills || []), ''];
                            setParsedData(prev => prev ? {...prev, skills: newSkills} : null);
                          } else if (e.key === 'Backspace' && e.currentTarget.value === '' && index > 0) {
                            // Remove empty skill
                            const newSkills = parsedData.skills?.filter((_, i) => i !== index);
                            setParsedData(prev => prev ? {...prev, skills: newSkills} : null);
                          }
                        }}
                        className="w-auto min-w-[100px] px-3 py-1 h-8 text-sm"
                        placeholder="Type skill..."
                      />
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newSkills = [...(parsedData.skills || []), ''];
                        setParsedData(prev => prev ? {...prev, skills: newSkills} : null);
                      }}
                      className="h-8 px-3"
                    >
                      + Add Skill
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Click on skills to edit them. Press Enter to add new skill, Backspace to remove empty ones.</p>
                </div>
              )}
            </div>
          </div>
        )}


        <div className="flex gap-3">
          {onCancel && <Button variant="outline" onClick={onCancel}>Cancel</Button>}
          <Button onClick={handleSubmit} disabled={!parsedData || !parsedData.jobType}>Add Candidate</Button>
        </div>
      </CardContent>
    </Card>
  );
};