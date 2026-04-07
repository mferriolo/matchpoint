import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Sparkles, FileText, Home, Save, Copy as CopyIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { callAI } from '@/lib/aiPrompts';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import ConfirmationDialog from '@/components/ui/confirmation-dialog';
import PresentationsList from '@/components/presentations/PresentationsList';
import EditPresentationDialog from '@/components/presentations/EditPresentationDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  current_job_title: string;
  current_company?: string;
  location?: string;
  summary?: string;
  experience?: any;
  education?: any;
  skills?: any;
}

interface Job {
  id: string;
  title: string;
  company: string;
  description?: string;
  job_ad?: string;
  summary?: string;
  knockout_questions?: any;
}

interface Presentation {
  id: string;
  presentation_name: string;
  presentation_content: string;
  candidate_name: string;
  job_title: string;
  company: string;
  created_at: string;
  updated_at: string;
}

const Presentations = () => {
  const { toast } = useToast();
  const { isOpen, dialogConfig, showConfirmation, hideConfirmation } = useConfirmDialog();
  
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [presentation, setPresentation] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // New states for saved presentations
  const [savedPresentations, setSavedPresentations] = useState<Presentation[]>([]);
  const [isLoadingPresentations, setIsLoadingPresentations] = useState(false);
  const [editingPresentation, setEditingPresentation] = useState<Presentation | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentCandidate, setCurrentCandidate] = useState<Candidate | null>(null);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  
  useEffect(() => {
    loadCandidates();
    loadJobs();
    loadSavedPresentations();
  }, []);
  
  const loadCandidates = async () => {
    const { data } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, current_job_title')
      .order('first_name');
    setCandidates(data || []);
  };
  
  const loadJobs = async () => {
    const { data } = await supabase
      .from('job_orders')
      .select('id, title, company')
      .order('title');
    setJobs(data || []);
  };
  
  const loadSavedPresentations = async () => {
    try {
      setIsLoadingPresentations(true);
      const { data, error } = await supabase
        .from('candidate_presentations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSavedPresentations(data || []);
    } catch (error) {
      console.error('Error loading presentations:', error);
    } finally {
      setIsLoadingPresentations(false);
    }
  };
  
  const handleMatch = async () => {
    if (!selectedCandidateId || !selectedJobId) {
      toast({
        title: "Selection Required",
        description: "Please select both a candidate and a job",
        variant: "destructive"
      });
      return;
    }
    
    setIsGenerating(true);
    setPresentation('');
    
    try {
      const { data: candidateData } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', selectedCandidateId)
        .single();
      
      const { data: jobData } = await supabase
        .from('job_orders')
        .select('*')
        .eq('id', selectedJobId)
        .single();
      
      setCurrentCandidate(candidateData);
      setCurrentJob(jobData);
      
      const result = await callAI('generate_candidate_presentation', {
        CANDIDATE_NAME: `${candidateData.first_name} ${candidateData.last_name}`,
        CURRENT_TITLE: candidateData.current_job_title || 'Not specified',
        LOCATION: candidateData.location || 'Not specified',
        YEARS_EXPERIENCE: candidateData.years_experience || 'Not specified',
        JOB_TITLE: jobData.title || 'Not specified',
        COMPANY: jobData.company || 'Not specified',
        JOB_REQUIREMENTS: jobData.requirements || jobData.description || 'Not specified',
        CANDIDATE_BACKGROUND: candidateData.summary || 'Not specified',
        SKILLS: Array.isArray(candidateData.skills) ? candidateData.skills.join(', ') : 'Not specified',
        EDUCATION: candidateData.education || 'Not specified',
        WORK_HISTORY: candidateData.experience || 'Not specified',
        INTERVIEW_NOTES: candidateData.interview_notes || 'Not specified'
      });
      
      setPresentation(result);
      toast({
        title: "Success!",
        description: "Presentation generated successfully"
      });
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate presentation",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleSavePresentation = () => {
    if (!currentCandidate || !currentJob) return;
    
    showConfirmation({
      title: 'Save Presentation?',
      message: `Save this presentation for ${currentCandidate.first_name} ${currentCandidate.last_name} - ${currentJob.title}?`,
      confirmText: 'Save',
      cancelText: 'Cancel',
      confirmButtonColor: 'blue',
      isDestructive: false,
      onConfirm: async () => {
        try {
          const presentationName = `${currentCandidate.first_name} ${currentCandidate.last_name} - ${currentJob.title} - ${new Date().toLocaleDateString()}`;
          
          const { error } = await supabase
            .from('candidate_presentations')
            .insert({
              candidate_id: selectedCandidateId,
              job_id: selectedJobId,
              presentation_name: presentationName,
              presentation_content: presentation,
              candidate_name: `${currentCandidate.first_name} ${currentCandidate.last_name}`,
              job_title: currentJob.title,
              company: currentJob.company
            });
          
          if (error) throw error;
          
          toast({
            title: "Saved!",
            description: "Presentation saved successfully"
          });
          
          loadSavedPresentations();
        } catch (error) {
          console.error('Error saving:', error);
          toast({
            title: "Error",
            description: "Failed to save presentation",
            variant: "destructive"
          });
        }
      }
    });
  };
  
  const handleEdit = (pres: Presentation) => {
    setEditingPresentation(pres);
    setIsEditModalOpen(true);
  };
  
  const handleDuplicate = async (pres: Presentation) => {
    showConfirmation({
      title: 'Duplicate Presentation?',
      message: `Create a copy of "${pres.presentation_name}"?`,
      confirmText: 'Duplicate',
      cancelText: 'Cancel',
      confirmButtonColor: 'blue',
      isDestructive: false,
      onConfirm: async () => {
        try {
          const newName = `${pres.presentation_name} (Copy)`;
          const { error } = await supabase
            .from('candidate_presentations')
            .insert({
              presentation_name: newName,
              presentation_content: pres.presentation_content,
              candidate_name: pres.candidate_name,
              job_title: pres.job_title,
              company: pres.company,
              candidate_id: null,
              job_id: null
            });
          
          if (error) throw error;
          
          toast({
            title: "Duplicated!",
            description: "Presentation copied successfully"
          });
          
          loadSavedPresentations();
        } catch (error) {
          console.error('Error duplicating:', error);
          toast({
            title: "Error",
            description: "Failed to duplicate presentation",
            variant: "destructive"
          });
        }
      }
    });
  };
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            Candidate Presentations
          </h1>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
        
        <Tabs defaultValue="generate" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">Generate Presentation</TabsTrigger>
            <TabsTrigger value="saved">Saved Presentations ({savedPresentations.length})</TabsTrigger>
          </TabsList>
          
          <TabsContent value="generate" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Match Candidate to Job</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="candidate">Select Candidate</Label>
                    <Select value={selectedCandidateId} onValueChange={setSelectedCandidateId}>
                      <SelectTrigger id="candidate">
                        <SelectValue placeholder="Choose a candidate..." />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map(candidate => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            {candidate.first_name} {candidate.last_name} - {candidate.current_job_title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="job">Select Job</Label>
                    <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                      <SelectTrigger id="job">
                        <SelectValue placeholder="Choose a job..." />
                      </SelectTrigger>
                      <SelectContent>
                        {jobs.map(job => (
                          <SelectItem key={job.id} value={job.id}>
                            {job.title} - {job.company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    onClick={handleMatch}
                    disabled={isGenerating || !selectedCandidateId || !selectedJobId}
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating Presentation...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate AI Presentation
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Generated Presentation</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={presentation}
                    onChange={(e) => setPresentation(e.target.value)}
                    placeholder="AI-generated presentation will appear here..."
                    className="min-h-[400px] font-mono text-sm"
                  />
                  {presentation && (
                    <div className="mt-4 space-y-2">
                      <Button 
                        className="w-full"
                        onClick={handleSavePresentation}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save Presentation
                      </Button>
                      <Button 
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          navigator.clipboard.writeText(presentation);
                          toast({
                            title: "Copied!",
                            description: "Presentation copied to clipboard"
                          });
                        }}
                      >
                        <CopyIcon className="mr-2 h-4 w-4" />
                        Copy to Clipboard
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="saved">
            <PresentationsList
              presentations={savedPresentations}
              onRefresh={loadSavedPresentations}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
            />
          </TabsContent>
        </Tabs>
        
        <EditPresentationDialog
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          presentation={editingPresentation}
          onSave={loadSavedPresentations}
        />
        
        <ConfirmationDialog
          isOpen={isOpen}
          onClose={hideConfirmation}
          onConfirm={dialogConfig.onConfirm}
          title={dialogConfig.title}
          message={dialogConfig.message}
          confirmText={dialogConfig.confirmText}
          cancelText={dialogConfig.cancelText}
          confirmButtonColor={dialogConfig.confirmButtonColor}
          isDestructive={dialogConfig.isDestructive}
        />
      </div>
    </div>
  );
};

export default Presentations;
