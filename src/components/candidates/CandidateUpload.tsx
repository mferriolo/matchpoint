import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CleanSelectItem, cleanText } from '@/components/ui/select-clean';


import { User } from 'lucide-react';
import { Candidate } from '@/types/candidate';
import { ResumeParser } from './ResumeParser';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
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

interface CandidateUploadProps {
  onClose: () => void;
  onCandidateAdded?: (candidate: Candidate) => void;
}

const CandidateUpload: React.FC<CandidateUploadProps> = ({ onClose, onCandidateAdded }) => {
  const [manualEntry, setManualEntry] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    name: '',
    email: '',
    phone: '',
    specialty: '',
    experience: '',
    jobType: ''
  });
  const { activeJobTypes } = useJobTypes();
  const { toast } = useToast();

  const handleParsedResume = async (parsedCandidate: any) => {
    console.log('=== SAVING PARSED CANDIDATE TO DATABASE ===');
    console.log('Full parsed candidate data:', JSON.stringify(parsedCandidate, null, 2));
    console.log('Fields in parsed data:', Object.keys(parsedCandidate));
    
    // Check if job type is provided
    if (!parsedCandidate.jobType) {
      toast({
        title: "Job Type Required",
        description: "Please select a job type before adding the candidate",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // CRITICAL: Validate resumeText before saving to prevent binary garbage
      let resumeTextToSave = parsedCandidate.resumeText || null;
      
      if (resumeTextToSave) {
        // Check for binary garbage one more time before saving
        const hasBinaryData = (
          resumeTextToSave.includes('\u0000') ||
          resumeTextToSave.includes('��') ||
          resumeTextToSave.includes('\ufffd') ||
          resumeTextToSave.startsWith('��') ||
          resumeTextToSave.startsWith('\u0011')
        );
        
        if (hasBinaryData) {
          console.error('❌ CRITICAL: Binary data detected in resumeText before database save!');
          console.error('Sample:', resumeTextToSave.substring(0, 100));
          resumeTextToSave = null; // Don't save binary garbage
          toast({
            title: "Warning",
            description: "Resume text contains binary data and will not be saved. File upload will proceed.",
            variant: "default"
          });
        }
      }
      
      // Map all parsed fields to database columns
      const dbData = {
        name: parsedCandidate.name || `${parsedCandidate.firstName || ''} ${parsedCandidate.lastName || ''}`.trim() || 'Unknown',
        first_name: parsedCandidate.firstName || parsedCandidate.name?.split(' ')[0] || null,
        last_name: parsedCandidate.lastName || parsedCandidate.name?.split(' ').slice(1).join(' ') || null,
        email: parsedCandidate.email || null,
        phone: parsedCandidate.phone || parsedCandidate.cellPhone || parsedCandidate.homePhone || null,
        cell_phone: parsedCandidate.cellPhone || null,
        home_phone: parsedCandidate.homePhone || null,
        resume_url: parsedCandidate.resumeUrl || null,
        resume_file_name: parsedCandidate.resumeFileName || null,
        resume_text: resumeTextToSave, // Use validated text
        skills: parsedCandidate.skills || [],
        job_type: parsedCandidate.jobType, // Add job type field
        experience_years: parsedCandidate.experienceYears || null,
        education: parsedCandidate.education ? JSON.stringify(parsedCandidate.education) : null,
        location: parsedCandidate.location || null,
        city: parsedCandidate.city || null,
        state: parsedCandidate.state || null,
        zip: parsedCandidate.zip || null,
        address: parsedCandidate.address || parsedCandidate.streetAddress || null,
        current_job_title: parsedCandidate.currentJobTitle || null,
        current_company: parsedCandidate.currentCompany || null,
        summary: parsedCandidate.summary || null,
        experience_details: parsedCandidate.experienceDetails || [],
        certifications: parsedCandidate.certifications || [],
        languages: parsedCandidate.languages || [],
        linkedin: parsedCandidate.linkedin || null,
        notes: parsedCandidate.notes || null,
        status: parsedCandidate.status || 'New'
      };

      
      console.log('=== DATA TO SAVE TO DATABASE ===');
      console.log('Database data object:', JSON.stringify(dbData, null, 2));
      console.log('Fields being saved:', Object.keys(dbData));
      
      const { data, error } = await supabase
        .from('candidates')
        .insert([dbData])
        .select()
        .single();
      
      console.log('=== DATABASE SAVE RESULT ===');
      console.log('Error:', error);
      console.log('Saved data:', data);
      
      if (error) {
        console.error('❌ Error saving candidate:', error);
        console.error('Error details:', error.message, error.details, error.hint);
        toast({
          title: "Error",
          description: `Failed to save candidate: ${error.message}`,
          variant: "destructive"
        });
        return;
      }
      
      console.log('✅ Candidate saved to database:', data);
      
      // Verify what was actually saved
      console.log('=== VERIFICATION ===');
      const { data: verifyData } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', data.id)
        .single();
      
      console.log('Verified data in database:', verifyData);
      console.log('Fields in database:', Object.keys(verifyData || {}));
      
      // Check which fields are missing or null
      const missingFields = Object.keys(dbData).filter(
        key => !verifyData?.[key] && dbData[key]
      );
      
      if (missingFields.length > 0) {
        console.warn('⚠️ Fields not saved or null in database:', missingFields);
        missingFields.forEach(field => {
          console.warn(`  - ${field}: ${dbData[field]}`);
        });
      } else {
        console.log('✅ All fields saved successfully');
      }
      
      if (onCandidateAdded) {
        console.log('Calling onCandidateAdded callback...');
        onCandidateAdded(data as Candidate);
      }
      
      toast({
        title: "Success",
        description: "Candidate added successfully with all parsed information"
      });
      
      onClose();
    } catch (error) {
      console.error('❌ Exception saving candidate:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };



  const handleManualSubmit = async () => {
    console.log('=== MANUAL CANDIDATE SUBMISSION ===');
    console.log('Form data:', candidateForm);
    
    if (!candidateForm.name) {
      toast({
        title: "Error",
        description: "Please enter a name",
        variant: "destructive"
      });
      return;
    }
    
    if (!candidateForm.jobType) {
      toast({
        title: "Error",
        description: "Please select a job type",
        variant: "destructive"
      });
      return;
    }
    
    // VALIDATE EMAIL FORMAT IF PROVIDED
    if (candidateForm.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(candidateForm.email)) {
        toast({
          title: "Invalid Email",
          description: "Please enter a valid email address (e.g., name@example.com)",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      console.log('Attempting to save manual candidate...');
      
      const nameParts = candidateForm.name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const { data, error } = await supabase
        .from('candidates')
        .insert([{
          name: candidateForm.name,
          first_name: firstName,
          last_name: lastName,
          email: candidateForm.email || null,
          phone: candidateForm.phone || null,
          job_type: candidateForm.jobType, // Add job type field
          notes: candidateForm.specialty ? `Specialty: ${candidateForm.specialty}\nExperience: ${candidateForm.experience}` : null,
          status: 'New'
        }])
        .select()
        .single();
      
      console.log('Database response:', { data, error });

      
      if (error) {
        console.error('❌ Error saving candidate:', error);
        toast({
          title: "Error",
          description: `Failed to save candidate: ${error.message}`,
          variant: "destructive"
        });
        return;
      }
      
      console.log('✅ Candidate saved to database:', data);
      
      if (onCandidateAdded) {
        console.log('Calling onCandidateAdded callback...');
        onCandidateAdded(data as Candidate);
      }
      
      toast({
        title: "Success",
        description: "Candidate added successfully"
      });
      
      onClose();
    } catch (error) {
      console.error('❌ Exception saving candidate:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };



  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Candidate</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Toggle between upload and manual entry */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
            <Button
              variant={!manualEntry ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setManualEntry(false)}
            >
              AI Resume Parser
            </Button>
            <Button
              variant={manualEntry ? "default" : "ghost"}
              className="flex-1"
              onClick={() => setManualEntry(true)}
            >
              <User className="w-4 h-4 mr-2" />
              Manual Entry
            </Button>
          </div>

          {!manualEntry ? (
            <ResumeParser 
              onParsed={handleParsedResume}
              onCancel={onClose}
            />
          ) : (
            /* Manual Entry Form */
            <div className="space-y-4 p-4">
              {/* Job Type Selection - MOVED TO TOP AND MADE PROMINENT */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <Label htmlFor="jobType" className="text-base font-semibold text-blue-900">
                  Job Type * (Required)
                </Label>
                <Select 
                  value={candidateForm.jobType}
                  onValueChange={(value) => {
                    const cleanedValue = cleanText(value); // Clean duplicated text
                    console.log('Selected job type (raw):', value);
                    console.log('Selected job type (cleaned):', cleanedValue);
                    setCandidateForm({...candidateForm, jobType: cleanedValue});
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
                          <CleanSelectItem 
                            key={`active-${jobType}`} 
                            value={jobType}
                          >
                            {jobType}
                          </CleanSelectItem>

                        ))}
                        <div className="my-1 h-px bg-gray-300 pointer-events-none" />
                      </>
                    )}
                    
                    {/* All Job Types Section */}
                    <div className="px-2 py-1.5 text-sm font-semibold text-gray-700 pointer-events-none">
                      All Job Types
                    </div>
                    {ALL_JOB_TYPES.map((jobType) => (
                      <CleanSelectItem 
                        key={`all-${jobType}`} 
                        value={jobType}
                      >
                        {jobType}
                      </CleanSelectItem>
                    ))}
                  </SelectContent>

                </Select>
              </div>


              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={candidateForm.name}
                  onChange={(e) => setCandidateForm({...candidateForm, name: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={candidateForm.email}
                  onChange={(e) => setCandidateForm({...candidateForm, email: e.target.value})}
                  placeholder="john@example.com"
                />
              </div>
              
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={candidateForm.phone}
                  onChange={(e) => setCandidateForm({...candidateForm, phone: e.target.value})}
                  placeholder="555-0100"
                />
              </div>
              
              <div>
                <Label htmlFor="specialty">Specialty</Label>
                <Input
                  id="specialty"
                  value={candidateForm.specialty}
                  onChange={(e) => setCandidateForm({...candidateForm, specialty: e.target.value})}
                  placeholder="e.g., Registered Nurse, Physician, etc."
                />
              </div>
              
              <div>
                <Label htmlFor="experience">Experience</Label>
                <Input
                  id="experience"
                  value={candidateForm.experience}
                  onChange={(e) => setCandidateForm({...candidateForm, experience: e.target.value})}
                  placeholder="e.g., 5+ years"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleManualSubmit}
                  disabled={!candidateForm.name || !candidateForm.jobType}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <User className="w-4 h-4 mr-2" />
                  Add Candidate
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CandidateUpload;