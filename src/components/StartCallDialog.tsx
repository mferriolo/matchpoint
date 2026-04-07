import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Phone, Video, Loader2 } from 'lucide-react';
import { useCallPrompt } from '@/contexts/CallPromptContext';
import { CallMethod } from '@/types/callprompt';
import { supabase } from '@/lib/supabase';
import { Candidate } from '@/types/candidate';
import { useToast } from '@/hooks/use-toast';


interface StartCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCallStarted?: () => void;
  prePopulatedCandidate?: {
    name: string;
    candidateId: string;
  };
}


export const StartCallDialog: React.FC<StartCallDialogProps> = ({ 
  open, 
  onOpenChange, 
  onCallStarted,
  prePopulatedCandidate
}) => {
  const { startCall, jobs } = useCallPrompt();
  const { toast } = useToast();
  const [contactName, setContactName] = useState('');
  const [callTypes, setCallTypes] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [callConfig, setCallConfig] = useState({
    callCategory: 'candidate',
    callType: '',
    callMethod: 'zoom',
    jobId: '',
    jobReferenceId: '' // For candidate calls to reference knockout questions
  });
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);


  useEffect(() => {
    if (open && prePopulatedCandidate) {
      console.log('=== PRE-POPULATING CANDIDATE ===');
      console.log('prePopulatedCandidate:', prePopulatedCandidate);
      console.log('name:', prePopulatedCandidate.name);
      
      setContactName(prePopulatedCandidate.name);
      setCallConfig(prev => ({
        ...prev,
        callCategory: 'candidate' // Auto-set to candidate since we have a candidate
      }));
      
      console.log('✅ Contact name set to:', prePopulatedCandidate.name);
    } else if (open && !prePopulatedCandidate) {
      // Reset when opening without pre-population
      console.log('No pre-populated candidate, resetting form');
      setContactName('');
      setCallConfig({
        callCategory: 'candidate',
        callType: '',
        callMethod: 'zoom',
        jobId: '',
        jobReferenceId: ''
      });
    }
  }, [open, prePopulatedCandidate]);


  useEffect(() => {
    if (callConfig.callCategory) {
      fetchCallTypesByCategory(callConfig.callCategory);
    }
  }, [callConfig.callCategory]);

  // Fetch jobs every time dialog opens
  useEffect(() => {
    if (open) {
      console.log('=== DIALOG OPENED - FETCHING JOBS ===');
      loadCandidates();
      fetchAvailableJobs();
    }
  }, [open]);

  const fetchAvailableJobs = async () => {
    console.log('=== FETCHING JOBS FOR DROPDOWN ===');
    
    const { data, error } = await supabase
      .from('job_orders')
      .select('id, job_title, company, status')
      .order('job_title');
    
    console.log('Jobs query response:', { data, error });
    console.log('Number of jobs returned:', data?.length);
    
    if (error) {
      console.error('❌ Error fetching jobs:', error);
      return;
    }
    
    // CRITICAL: Remove duplicates by ID
    const uniqueJobs = data?.filter((job, index, self) =>
      index === self.findIndex((j) => j.id === job.id)
    ) || [];
    
    console.log('After deduplication:', uniqueJobs.length);
    
    if (uniqueJobs.length !== data?.length) {
      console.warn('⚠️ Duplicates found! Original:', data?.length, 'Unique:', uniqueJobs.length);
    }
    
    console.log('✅ Setting available jobs:', uniqueJobs.length || 0);
    setAvailableJobs(uniqueJobs);
  };



  const loadCandidates = async () => {
    if (prePopulatedCandidate) {
      console.log('Skipping candidate fetch - using pre-populated candidate');
      return;
    }
    
    console.log('=== FETCHING CANDIDATES FOR DROPDOWN ===');
    console.log('Called from: Homepage or Jobs Dashboard');
    setIsLoadingCandidates(true);
    
    try {
      console.log('Executing query...');
      
      const { data, error } = await supabase
        .from('candidates')
        .select('id, first_name, last_name, email, current_job_title, phone')
        .order('first_name');

      console.log('=== QUERY RESULT ===');
      console.log('Error:', error);
      console.log('Data:', data);
      console.log('Number of records:', data?.length);
      
      if (data && data.length > 0) {
        console.log('=== FIRST CANDIDATE DETAILS ===');
        console.log('Full object:', JSON.stringify(data[0], null, 2));
        console.log('ID:', data[0].id);
        console.log('first_name:', data[0].first_name);
        console.log('last_name:', data[0].last_name);
        console.log('email:', data[0].email);
        console.log('current_job_title:', data[0].current_job_title);
        
        console.log('=== ALL CANDIDATES ===');
        data.forEach((candidate, index) => {
          console.log(`Candidate ${index + 1}:`, {
            id: candidate.id,
            first_name: candidate.first_name,
            last_name: candidate.last_name,
            email: candidate.email,
            current_job_title: candidate.current_job_title,
            fullName: `${candidate.first_name} ${candidate.last_name}`
          });
        });
      }
      
      if (error) {
        console.error('❌ Query error:', error);
        toast({
          title: "Error",
          description: "Failed to load candidates",
          variant: "destructive"
        });
        return;
      }
      
      console.log('Setting availableCandidates state...');
      setCandidates(data || []);
      console.log('✅ State updated with', data?.length || 0, 'candidates');
      
    } catch (error) {
      console.error('❌ Exception fetching candidates:', error);
    } finally {
      setIsLoadingCandidates(false);
    }
  };



  const fetchCallTypesByCategory = async (category: string) => {
    const tableName = category === 'candidate' ? 'call_types' : 'client_call_types';
    const { data } = await supabase.from(tableName).select('name').eq('is_active', true).order('name');
    if (data) setCallTypes(data.map(ct => ct.name));
  };

  const handleStartCall = async () => {
    if (!contactName.trim() || !callConfig.callType) return;
    if (callConfig.callCategory === 'client' && !callConfig.jobId) return;

    if (callConfig.callCategory === 'candidate' && !candidates.find(c => `${c.first_name} ${c.last_name}`.toLowerCase() === contactName.toLowerCase())) {

      const newCandidate: Candidate = {
        id: crypto.randomUUID(),
        name: contactName,
        email: '',
        phone: '',
        status: 'New Lead',
        source: 'Live Call',
        createdAt: new Date().toISOString(),
        notes: `Created from ${callConfig.callType} call`
      };
      const updated = [...candidates, newCandidate];
      setCandidates(updated);
      localStorage.setItem('candidates', JSON.stringify(updated));
      window.dispatchEvent(new Event('candidatesUpdated'));
    }


    const jobId = callConfig.callCategory === 'client' ? callConfig.jobId : '';
    
    // Start the call using the context, passing jobReferenceId for candidate calls
    await startCall(
      jobId, 
      contactName, 
      callConfig.callMethod as CallMethod, 
      callConfig.callType, 
      callConfig.callCategory,
      callConfig.jobReferenceId // Pass the job reference ID
    );
    
    // Notify parent that call has started
    if (onCallStarted) {
      onCallStarted();
    }

    // Reset form and close dialog
    setContactName('');
    setCallConfig({ callCategory: 'candidate', callType: '', callMethod: 'zoom', jobId: '', jobReferenceId: '' });
    onOpenChange(false);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start New Call</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Call Category</Label>
            <RadioGroup 
              value={callConfig.callCategory} 
              onValueChange={(v) => {
                console.log('=== CALL CATEGORY CHANGED ===');
                console.log('From:', callConfig.callCategory);
                console.log('To:', v);
                console.log('Current contactName:', contactName);
                console.log('prePopulatedCandidate:', prePopulatedCandidate);
                
                // CRITICAL FIX: Clear contact name when switching categories
                // UNLESS there's a pre-populated candidate and we're switching to candidate
                if (prePopulatedCandidate && v === 'candidate') {
                  console.log('Keeping pre-populated candidate name');
                  setCallConfig({...callConfig, callCategory: v, callType: '', jobId: ''});
                } else {
                  console.log('Clearing contact name');
                  setContactName(''); // Clear the contact name
                  setCallConfig({...callConfig, callCategory: v, callType: '', jobId: ''});
                }
              }}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="candidate" id="candidate" />
                <Label htmlFor="candidate">Candidate</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="client" id="client" />
                <Label htmlFor="client">Client</Label>
              </div>
            </RadioGroup>
          </div>

          
          <div>
            <Label>{callConfig.callCategory === 'candidate' ? 'Candidate Name' : 'Client Contact'}</Label>
            {callConfig.callCategory === 'candidate' ? (
              <>
                {/* Show pre-populated candidate name if available */}
                {prePopulatedCandidate ? (
                  <div className="p-3 border rounded-md bg-accent mt-2">
                    <p className="font-medium">{prePopulatedCandidate.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Pre-selected from candidate dashboard
                    </p>
                  </div>
                ) : (
                  <>
                    {isLoadingCandidates ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-md mt-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading candidates...
                      </div>
                    ) : candidates.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50 mt-2">
                        No candidates available. Type a name below to create a new candidate.
                      </div>
                    ) : (
                      <>
                        <Select 
                          value={contactName} 
                          onValueChange={(value) => {
                            console.log('Candidate selected:', value);
                            setContactName(value);
                          }}
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Select candidate" />
                          </SelectTrigger>
                          <SelectContent>
                            {candidates.map((c, index) => {
                              const fullName = `${c.first_name} ${c.last_name}`;
                              console.log(`Rendering option ${index + 1}:`, {
                                id: c.id,
                                first_name: c.first_name,
                                last_name: c.last_name,
                                display: fullName
                              });
                              
                              return (
                                <SelectItem key={c.id} value={fullName}>
                                  {fullName}
                                  {c.current_job_title && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      - {c.current_job_title}
                                    </span>
                                  )}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Input 
                          placeholder="Or type new name" 
                          value={contactName} 
                          onChange={(e) => setContactName(e.target.value)} 
                          className="mt-2" 
                        />
                      </>
                    )}
                  </>
                )}
              </>

            ) : (
              <Input 
                value={contactName} 
                onChange={(e) => setContactName(e.target.value)} 
                placeholder="Enter name"
                className="mt-2" 
              />
            )}
          </div>



          
          {callConfig.callCategory === 'client' && (
            <div>
              <Label>Job</Label>
              <Select 
                value={callConfig.jobId} 
                onValueChange={(v) => setCallConfig({...callConfig, jobId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select job" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.filter(j => j.isActive !== false).map(job => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title} - {job.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div>
            <Label>Call Type</Label>
            <Select 
              value={callConfig.callType} 
              onValueChange={(v) => setCallConfig({...callConfig, callType: v, jobReferenceId: ''})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {callTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Reference for Initial Screening or Full Interview */}
          {callConfig.callCategory === 'candidate' && (callConfig.callType === 'Initial Screening' || callConfig.callType === 'Full Interview') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Job Reference</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    console.log('Manual refresh clicked');
                    fetchAvailableJobs();
                  }}
                  className="h-6 text-xs"
                >
                  Refresh
                </Button>
              </div>
              
              {availableJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50">
                  No jobs available. Create a job first.
                </p>
              ) : (
                <>
                  <Select 
                    value={callConfig.jobReferenceId} 
                    onValueChange={(v) => {
                      console.log('Job selected:', v);
                      setCallConfig({...callConfig, jobReferenceId: v});
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select job for knockout questions" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableJobs.map(job => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.job_title || 'Untitled'} {job.company ? `- ${job.company}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a job to include its knockout questions in the call
                  </p>
                </>
              )}
            </div>
          )}




          
          <div>
            <Label>Method</Label>
            <Select 
              value={callConfig.callMethod} 
              onValueChange={(v) => setCallConfig({...callConfig, callMethod: v})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zoom">
                  <div className="flex items-center">
                    <Video className="mr-2 h-4 w-4" />
                    Zoom
                  </div>
                </SelectItem>
                <SelectItem value="twilio">
                  <div className="flex items-center">
                    <Phone className="mr-2 h-4 w-4" />
                    Twilio
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={handleStartCall} 
            className="w-full" 
            disabled={!contactName.trim() || !callConfig.callType || (callConfig.callCategory === 'client' && !callConfig.jobId)}
          >
            Start Call
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StartCallDialog;