import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  Edit, 
  Phone, 
  Save,
  Video,
  Pencil,
  Check,
  X,
  Upload,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

import { useCallPrompt } from '@/contexts/CallPromptContext';
import { Job, CallMethod, JobType } from '@/types/callprompt';
import JobDetailsTabs from './JobDetailsTabs';
import JobDetailsFieldUpdater from './JobDetailsFieldUpdater';
import { useJobTypes } from '@/contexts/JobTypesContext';


interface JobDetailsProps {
  job: Job;
  onBack: () => void;
  onStartCall: () => void;
}

// Emergency logging to detect infinite render loops
let renderCount = 0;
let firstRenderTime = Date.now();

const JobDetails: React.FC<JobDetailsProps> = ({ job, onBack, onStartCall }) => {
  renderCount++;
  const now = Date.now();
  const timeSinceFirst = now - firstRenderTime;
  
  console.log(`🔄 JobDetails render #${renderCount} (${timeSinceFirst}ms since first render)`);
  
  // Reset counter every 5 seconds
  if (timeSinceFirst > 5000) {
    console.log('✅ Resetting render counter (5 seconds passed)');
    renderCount = 0;
    firstRenderTime = now;
  }
  
  // Only flag as infinite loop if 100+ renders in 5 seconds
  if (renderCount > 100 && timeSinceFirst < 5000) {
    console.error('🚨 INFINITE LOOP DETECTED - 100+ renders in 5 seconds');
    console.trace();
    throw new Error('Infinite loop detected - stopping execution');
  }

  

  const { updateJobWisdom, startCall, updateJob } = useCallPrompt();
  const { activeJobTypes } = useJobTypes();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [callType, setCallType] = useState<string>('');
  const [callMethod, setCallMethod] = useState<string>('');
  const [isCallDialogOpen, setIsCallDialogOpen] = useState(false);
  const [isEditingJobType, setIsEditingJobType] = useState(false);
  const [tempJobType, setTempJobType] = useState<JobType | undefined>(job.jobType);

  // Push to Crelate state
  const [isCrelateDialogOpen, setIsCrelateDialogOpen] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [crelateResult, setCrelateResult] = useState<{
    status: 'idle' | 'success' | 'duplicate' | 'error';
    message: string;
    crelateUrl?: string;
    crelateId?: string;
  }>({ status: 'idle', message: '' });

  
  // Initialize edit data with categorized questions or legacy questions
  const initializeEditData = () => {
    const categorized = job.categorizedQuestions;
    return {
      summary: job.summary || job.description || '',
      description: job.description || job.summary || '',
      compensation: job.compensation || '',
      startDate: job.startDate || new Date().toISOString().split('T')[0],
      numberOfOpenings: job.numberOfOpenings || 1,
      streetAddress: job.streetAddress || '',
      city: job.city || '',
      state: job.state || '',
      zipcode: job.zipcode || '',
      specificJobQuestions: categorized?.specificJobQuestions || [],
      candidateNeeds: categorized?.candidateNeeds || [],
    };
  };


  const [editData, setEditData] = useState(initializeEditData());

  const handleSave = async () => {
    const updates = {
      description: editData.description,
      summary: editData.summary || editData.description,
      compensation: editData.compensation,
      streetAddress: editData.streetAddress,
      city: editData.city,
      state: editData.state,
      zipcode: editData.zipcode,
      location: editData.city && editData.state ? `${editData.city}, ${editData.state}` : job.location
    };
    
    await updateJobWisdom(job.id, updates);
    setIsEditing(false);
  };

  const handleStartCall = () => {
    const fixedCallType = "Job Order Call";
    if (!candidateName.trim() || !callMethod) return;
    startCall(job.id, candidateName, callMethod as CallMethod, fixedCallType, 'client');
    onStartCall();
    setIsCallDialogOpen(false);
    setCandidateName('');
    setCallType('');
    setCallMethod('');
  };

  const handlePushToCrelate = async (updateExisting = false) => {
    setIsPushing(true);
    setCrelateResult({ status: 'idle', message: '' });

    try {
      const jobData = {

        title: job.title,
        company: job.company,
        summary: job.summary || editData.summary || '',
        description: job.description || editData.description || '',
        jobDescription: job.jobDescription || '',
        requirements: job.requirements || '',
        compensation: job.compensation || editData.compensation || '',
        salary: job.salary || '',
        location: job.location || (editData.city && editData.state ? `${editData.city}, ${editData.state}` : ''),
        city: job.city || editData.city || '',
        state: job.state || editData.state || '',
        streetAddress: job.streetAddress || editData.streetAddress || '',
        zipcode: job.zipcode || editData.zipcode || '',
        jobType: job.jobType || '',
        numberOfOpenings: job.numberOfOpenings || editData.numberOfOpenings || 1,
        startDate: job.startDate || editData.startDate || '',
        selling_points: job.sellingPoints || [],
        opportunity_type: 'Business Development Opportunity',
      };

      const { data, error } = await supabase.functions.invoke('push-to-crelate', {
        body: {
          action: 'push_job',
          jobData,
          updateExisting,
        }
      });

      if (error) throw new Error(error.message || 'Failed to push to Crelate');

      if (data?.duplicate && !updateExisting) {
        setCrelateResult({
          status: 'duplicate',
          message: data.message || 'Job already exists in Crelate',
          crelateUrl: data.crelateUrl,
          crelateId: data.existingJobId,
        });
      } else if (data?.success) {
        setCrelateResult({
          status: 'success',
          message: data.message || 'Job pushed to Crelate successfully',
          crelateUrl: data.crelateUrl,
          crelateId: data.crelateId,
        });
        toast({
          title: "Pushed to Crelate",
          description: `Job "${job.title}" ${data.action === 'updated' ? 'updated' : 'created'} in Crelate successfully.`,
        });
      } else {
        setCrelateResult({
          status: 'error',
          message: data?.error || data?.results?.[0]?.message || 'Unknown error',
        });
      }
    } catch (err: any) {
      console.error('Push to Crelate error:', err);
      setCrelateResult({
        status: 'error',
        message: err.message || 'Failed to push to Crelate',
      });
    } finally {
      setIsPushing(false);
    }
  };

  const updateEditData = useCallback((updates: Partial<typeof editData>) => {
    setEditData(prev => ({ ...prev, ...updates }));
  }, []);

  const addItem = useCallback((type: keyof typeof editData) => {
    setEditData(prev => {
      if (Array.isArray(prev[type])) {
        return { ...prev, [type]: [...(prev[type] as string[]), ''] };
      }
      return prev;
    });
  }, []);

  const updateItem = useCallback((type: keyof typeof editData, index: number, value: string) => {
    setEditData(prev => {
      if (Array.isArray(prev[type])) {
        return { ...prev, [type]: (prev[type] as string[]).map((item, i) => i === index ? value : item) };
      }
      return prev;
    });
  }, []);

  const removeItem = useCallback((type: keyof typeof editData, index: number) => {
    setEditData(prev => {
      if (Array.isArray(prev[type])) {
        return { ...prev, [type]: (prev[type] as string[]).filter((_, i) => i !== index) };
      }
      return prev;
    });
  }, []);

  const handleSaveJobType = async () => {
    if (tempJobType) {
      await updateJob(job.id, { jobType: tempJobType });
      setIsEditingJobType(false);
    }
  };

  const handleCancelJobType = () => {
    setTempJobType(job.jobType);
    setIsEditingJobType(false);
  };

  const stableJob = useMemo(() => job, [job.id]);

  return (
    <div className="p-8 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <Button variant="ghost" onClick={onBack} className="mr-4 hover:bg-white/50">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{job.title}</h1>
              <p className="text-gray-600 mt-1">{job.company}</p>
              
              {/* Job Type - Editable inline */}
              <div className="flex items-center gap-2 mt-2">
                {!isEditingJobType ? (
                  <>
                    <Badge 
                      variant="secondary" 
                      className="text-sm px-3 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                      onClick={() => setIsEditingJobType(true)}
                    >
                      {job.jobType || 'No Job Type'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingJobType(true)}
                      className="h-6 w-6 p-0 hover:bg-blue-100"
                    >
                      <Pencil className="h-3 w-3 text-blue-600" />
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select 
                      value={tempJobType || ''} 
                      onValueChange={(value) => setTempJobType(value as JobType)}
                    >
                      <SelectTrigger className="w-[250px] h-8">
                        <SelectValue placeholder="Select job type" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeJobTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={handleSaveJobType} className="h-8 w-8 p-0 hover:bg-green-100">
                      <Check className="h-4 w-4 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancelJobType} className="h-8 w-8 p-0 hover:bg-red-100">
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          
          <div className="flex gap-3 flex-wrap justify-end">
            <Button
              variant="outline"
              onClick={() => setIsEditing(!isEditing)}
              className="hover:bg-white/50"
            >
              <Edit className="mr-2 h-4 w-4" />
              {isEditing ? 'Cancel' : 'Edit'}
            </Button>
            
            {isEditing && (
              <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            )}

            {/* Push to Crelate Button */}
            <Dialog open={isCrelateDialogOpen} onOpenChange={(open) => {
              setIsCrelateDialogOpen(open);
              if (!open) setCrelateResult({ status: 'idle', message: '' });
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400">
                  <Upload className="mr-2 h-4 w-4" />
                  Push to Crelate
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                      <Upload className="w-4 h-4 text-white" />
                    </div>
                    Push Job to Crelate
                  </DialogTitle>
                  <DialogDescription>
                    Push this job order to your Crelate ATS as a job posting. Duplicate detection will check by job title and company name.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  {/* Job Preview */}
                  <div className="bg-gray-50 rounded-lg border p-4 space-y-2">
                    <h4 className="font-semibold text-gray-900">{job.title}</h4>
                    <p className="text-sm text-gray-600">{job.company}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div><span className="font-medium">Location:</span> {job.location || editData.city && editData.state ? `${editData.city}, ${editData.state}` : 'Not set'}</div>
                      <div><span className="font-medium">Type:</span> {job.jobType || 'Not set'}</div>
                      <div><span className="font-medium">Compensation:</span> {job.compensation || editData.compensation || 'Not set'}</div>
                      <div><span className="font-medium">Openings:</span> {job.numberOfOpenings || editData.numberOfOpenings || 1}</div>
                    </div>
                    {(job.summary || editData.summary) && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-2">{(job.summary || editData.summary || '').substring(0, 150)}...</p>
                    )}
                  </div>

                  {/* Field Mapping Info */}
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-indigo-800 mb-1">Fields that will be pushed:</p>
                    <div className="text-xs text-indigo-700 grid grid-cols-2 gap-1">
                      <span>Name (Title)</span>
                      <span>Description + Summary</span>
                      <span>Location (City/State)</span>
                      <span>Salary / Compensation</span>
                      <span>Number of Openings</span>
                      <span>Start Date</span>
                      <span>Company Link (auto)</span>
                      <span>Job Type (as Tag)</span>
                    </div>
                  </div>

                  {/* Result Display */}
                  {crelateResult.status === 'success' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-green-800">{crelateResult.message}</p>
                        {crelateResult.crelateUrl && (
                          <a href={crelateResult.crelateUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-green-700 underline flex items-center gap-1 mt-1 hover:text-green-900">
                            <ExternalLink className="w-3 h-3" /> View in Crelate
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {crelateResult.status === 'duplicate' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-800">Duplicate Detected</p>
                          <p className="text-xs text-amber-700 mt-1">{crelateResult.message}</p>
                          {crelateResult.crelateUrl && (
                            <a href={crelateResult.crelateUrl} target="_blank" rel="noopener noreferrer"
                              className="text-xs text-amber-700 underline flex items-center gap-1 mt-1 hover:text-amber-900">
                              <ExternalLink className="w-3 h-3" /> View existing job in Crelate
                            </a>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => handlePushToCrelate(true)}
                        disabled={isPushing}
                        variant="outline"
                        size="sm"
                        className="w-full border-amber-300 text-amber-800 hover:bg-amber-100"
                      >
                        {isPushing ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Upload className="mr-2 h-3 w-3" />}
                        Update Existing Job in Crelate
                      </Button>
                    </div>
                  )}

                  {crelateResult.status === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                      <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-800">Push Failed</p>
                        <p className="text-xs text-red-700 mt-1">{crelateResult.message}</p>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {crelateResult.status !== 'success' && (
                    <div className="flex gap-3 pt-2">
                      <Button variant="outline" onClick={() => setIsCrelateDialogOpen(false)} className="flex-1">
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handlePushToCrelate(false)}
                        disabled={isPushing}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {isPushing ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pushing...</>
                        ) : (
                          <><Upload className="mr-2 h-4 w-4" /> Push to Crelate</>
                        )}
                      </Button>
                    </div>
                  )}

                  {crelateResult.status === 'success' && (
                    <Button onClick={() => setIsCrelateDialogOpen(false)} className="w-full">
                      Done
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={isCallDialogOpen} onOpenChange={setIsCallDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 shadow-lg">
                  <Phone className="mr-2 h-4 w-4" />
                  Start Job Order Call
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start New Job Order Call</DialogTitle>
                  <DialogDescription>
                    Configure your call settings and candidate information before starting.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="candidate">Client Contact Name</Label>
                    <Input
                      id="candidate"
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="Enter client contact name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="callMethod">Call Method</Label>
                    <Select value={callMethod} onValueChange={setCallMethod}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select call method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zoom">
                          <div className="flex items-center">
                            <Video className="mr-2 h-4 w-4" />
                            Zoom Video Call
                          </div>
                        </SelectItem>
                        <SelectItem value="twilio">
                          <div className="flex items-center">
                            <Phone className="mr-2 h-4 w-4" />
                            Twilio Call
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleStartCall} 
                    className="w-full" 
                    disabled={!candidateName.trim() || !callMethod}
                  >
                    Start {callMethod === 'zoom' ? 'Zoom' : 'Twilio'} Call
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Field Updater Component */}
        <JobDetailsFieldUpdater job={job} updateEditData={updateEditData} />

        {/* Tabbed Interface */}
        <JobDetailsTabs
          job={stableJob}
          isEditing={isEditing}
          editData={editData}
          updateEditData={updateEditData}
          addItem={addItem}
          updateItem={updateItem}
          removeItem={removeItem}
        />
      </div>
    </div>
  );
};

export default JobDetails;
