import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, Edit, Plus, ChevronDown, ChevronRight, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PREDEFINED_QUESTIONS } from '@/utils/jobTypePrompts';
import { predefinedQuestions } from '@/utils/predefinedQuestions';
import { additionalPredefinedQuestions } from '@/utils/additionalPredefinedQuestions';
import { alliedHealthQuestions } from '@/utils/alliedHealthQuestions';
import { behavioralHealthQuestions } from '@/utils/behavioralHealthQuestions';
import { managementQuestions } from '@/utils/managementQuestions';

interface JobType {
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

interface Question {
  id: string;
  question_text: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

const inactiveJobCategories = {
  'Clinical Roles': [
    'Registered Nurses (RNs)', 'Licensed Practical Nurses (LPNs)', 'Certified Nursing Assistants (CNAs)',
    'Medical Assistants', 'Physician (Specialists)', 'Pharmacists'
  ],
  'Corporate Leadership': [
    'Chief Executive Officer (CEO)', 'Chief Operating Officer (COO)', 'Chief Financial Officer (CFO)',
    'Chief Medical Officer (CMO)', 'Chief Nursing Officer (CNO)', 'Chief Information Officer (CIO)',
    'Chief Compliance Officer (CCO)', 'Chief Human Resources Officer (CHRO)'
  ],
  'Allied Health Professionals': [
    'Physical Therapists (PTs)', 'Occupational Therapists (OTs)', 'Speech-Language Pathologists (SLPs)',
    'Respiratory Therapists', 'Radiologic Technologists', 'Ultrasound Technologists',
    'Medical Laboratory Technologists', 'Dietitians/Nutritionists', 'Audiologists',
    'Genetic Counselors'
  ],
  'Behavioral & Mental Health': [
    'Psychiatrists', 'Psychologists', 'Licensed Clinical Social Workers (LCSWs)',
    'Marriage and Family Therapists (MFTs)', 'Licensed Professional Counselors (LPCs)',
    'Behavioral Health Technicians', 'Substance Abuse Counselors'
  ],
  'Administrative & Support Roles': [
    'Medical Receptionists', 'Medical Coders and Billers', 'Health Information Technicians',
    'Medical Records Clerks', 'Patient Service Representatives', 'Medical Transcriptionists'
  ],
  'Healthcare Management & Leadership': [
    'Practice Administrators', 'Clinic Managers',
    'Hospital Administrators', 'Program Directors', 'Care Coordinators', 'Quality Improvement Managers'
  ],
  'Public Health & Community Roles': [
    'Public Health Nurses', 'Epidemiologists', 'Health Educators',
    'Community Health Workers', 'Infection Control Specialists'
  ],
  'Healthcare Technology & Informatics': [
    'Health Informatics Specialists', 'Clinical Systems Analysts', 'Electronic Medical Records (EMR) Specialists',
    'Telehealth Coordinators', 'Medical Device Technicians'
  ]
};
// Combine all predefined questions - use both old and new mappings
const allPredefinedQuestions = {
  ...predefinedQuestions,
  ...additionalPredefinedQuestions,
  ...behavioralHealthQuestions,
  ...managementQuestions,
  ...PREDEFINED_QUESTIONS,
  ...alliedHealthQuestions  // Put this LAST so it overrides any conflicts
};

// Debug logging - this should show in browser console
console.log('=== DEBUGGING PHYSICAL THERAPISTS QUESTIONS ===');
console.log('All predefined questions keys:', Object.keys(allPredefinedQuestions));
console.log('Allied Health keys specifically:', Object.keys(alliedHealthQuestions));
console.log('PREDEFINED_QUESTIONS keys:', Object.keys(PREDEFINED_QUESTIONS));
console.log('Sample Physical Therapists questions from combined:', allPredefinedQuestions["Physical Therapists (PTs)"]);
console.log('Direct allied health PT questions:', alliedHealthQuestions["Physical Therapists (PTs)"]);
console.log('Direct PREDEFINED_QUESTIONS PT questions:', PREDEFINED_QUESTIONS["Physical Therapists (PTs)"]);

// CRITICAL FIX: Ensure Physical Therapists questions are properly available
if (!allPredefinedQuestions["Physical Therapists (PTs)"]) {
  console.error('CRITICAL: Physical Therapists (PTs) questions are missing!');
  // Force add them from both sources
  allPredefinedQuestions["Physical Therapists (PTs)"] = [
    ...(PREDEFINED_QUESTIONS["Physical Therapists (PTs)"] || []),
    ...(alliedHealthQuestions["Physical Therapists (PTs)"] || [])
  ].filter(Boolean);
  console.log('FIXED: Added Physical Therapists questions:', allPredefinedQuestions["Physical Therapists (PTs)"]);
}

console.log('=== END DEBUG ===');
export const JobTypeManagement: React.FC = () => {
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedJobType, setSelectedJobType] = useState<JobType | null>(null);
  const [selectedInactiveJobName, setSelectedInactiveJobName] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [editingJobType, setEditingJobType] = useState<Partial<JobType>>({});
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question>>({});
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [showQuestionsPopup, setShowQuestionsPopup] = useState(false);

  useEffect(() => {
    fetchJobTypes();
  }, []);

  useEffect(() => {
    if (selectedJobType) {
      fetchQuestions(selectedJobType.id);
      setShowQuestionsPopup(true);
    } else if (selectedInactiveJobName) {
      // Show predefined questions for inactive job type
      const predefinedQs = allPredefinedQuestions[selectedInactiveJobName as keyof typeof allPredefinedQuestions] || [];

      if (predefinedQs.length > 0) {
        const mockQuestions: Question[] = predefinedQs.map((q, index) => ({
          id: `predefined-${index}`,
          question_text: q,
          category: '',
          sort_order: index + 1,
          is_active: true
        }));
        setQuestions(mockQuestions);
        setShowQuestionsPopup(true);
      } else {
        setQuestions([]);
        setShowQuestionsPopup(false);
      }
    } else {
      // Clear questions when no job type is selected
      setQuestions([]);
      setShowQuestionsPopup(false);
    }
  }, [selectedJobType, selectedInactiveJobName]);

  // Check if job type has questions
  const hasQuestions = (jobName: string) => {
    const questions = allPredefinedQuestions[jobName as keyof typeof allPredefinedQuestions];
    const hasQs = questions && questions.length > 0;
    console.log(`=== DETAILED QUESTION CHECK FOR "${jobName}" ===`);
    console.log('Questions found:', hasQs, questions?.length || 0, 'questions');
    console.log('Actual questions array:', questions);
    console.log('All available keys:', Object.keys(allPredefinedQuestions));
    console.log('Exact key match check:', allPredefinedQuestions.hasOwnProperty(jobName));
    console.log('Keys containing similar text:', Object.keys(allPredefinedQuestions).filter(k => 
      k.toLowerCase().includes(jobName.toLowerCase().split(' ')[0]) || 
      jobName.toLowerCase().includes(k.toLowerCase().split(' ')[0])
    ));
    console.log('=== END DETAILED CHECK ===');
    return hasQs;
  };
  const fetchJobTypes = async () => {
    const { data, error } = await supabase
      .from('job_types')
      .select('*')
      .order('created_at', { ascending: true }); // Order by creation time to maintain activation order
    if (!error && data) {
      // Separate active and inactive, keep active jobs in creation order
      const activeJobs = data.filter(jt => jt.is_active);
      const inactiveJobs = data.filter(jt => !jt.is_active).sort((a, b) => a.name.localeCompare(b.name));
      setJobTypes([...activeJobs, ...inactiveJobs]);
    }
  };

  const fetchQuestions = async (jobTypeId: string) => {
    try {
      const { data, error } = await supabase
        .from('questions')
        .select('*')
        .eq('type_id', jobTypeId)
        .eq('question_type', 'job_type')
        .order('sort_order');
      if (!error && data) {
        setQuestions(data);
      } else {
        console.error('Error fetching questions:', error);
        setQuestions([]);
      }
    } catch (err) {
      console.error('Error in fetchQuestions:', err);
      setQuestions([]);
    }
  };

  const saveJobType = async () => {
    if (editingJobType.id) {
      await supabase
        .from('job_types')
        .update(editingJobType)
        .eq('id', editingJobType.id);
    } else {
      await supabase
        .from('job_types')
        .insert([editingJobType]);
    }
    fetchJobTypes();
    setIsDialogOpen(false);
    setEditingJobType({});
  };

  const deleteJobType = async (id: string) => {
    await supabase.from('job_types').delete().eq('id', id);
    fetchJobTypes();
  };

  const saveQuestion = async () => {
    const questionData = {
      ...editingQuestion,
      type_id: selectedJobType?.id,
      question_type: 'job_type'
    };
    
    if (editingQuestion.id) {
      await supabase
        .from('questions')
        .update(questionData)
        .eq('id', editingQuestion.id);
    } else {
      await supabase
        .from('questions')
        .insert([questionData]);
    }
    fetchQuestions(selectedJobType!.id);
    setIsQuestionDialogOpen(false);
    setEditingQuestion({});
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from('questions').delete().eq('id', id);
    fetchQuestions(selectedJobType!.id);
  };
  const activateJobType = async (jobName: string) => {
    // Find existing job type or create new one
    let jobType = jobTypes.find(jt => jt.name === jobName);
    
    if (jobType) {
      // Update existing job type to active
      await supabase
        .from('job_types')
        .update({ is_active: true })
        .eq('id', jobType.id);
        
      // Auto-populate with predefined questions if they exist and no questions exist yet
      const { data: existingQuestions } = await supabase
        .from('questions')
        .select('id')
        .eq('type_id', jobType.id)
        .eq('question_type', 'job_type');
        
      if ((!existingQuestions || existingQuestions.length === 0) && 
          allPredefinedQuestions[jobName as keyof typeof allPredefinedQuestions]) {
        await addPredefinedQuestionsToJobType(jobType.id, jobName);
      }
    } else {
      // Create new job type as active
      const { data: newJobType } = await supabase
        .from('job_types')
        .insert([{
          name: jobName,
          description: `${jobName} role`,
          is_active: true
        }])
        .select()
        .single();
      
      if (newJobType) {
        jobType = newJobType;
        // Auto-populate with predefined questions if they exist
        if (allPredefinedQuestions[jobName as keyof typeof allPredefinedQuestions]) {
          await addPredefinedQuestionsToJobType(newJobType.id, jobName);
        }
      }
    }
    
    // Update selected job type to show the newly activated job
    if (jobType) {
      setSelectedJobType(jobType);
      setSelectedInactiveJobName(null);
    }
    
    fetchJobTypes();
  };

  const addPredefinedQuestionsToJobType = async (jobTypeId: string, jobTypeName: string) => {
    const questionsToInsert = allPredefinedQuestions[jobTypeName as keyof typeof allPredefinedQuestions]?.map((questionText, index) => ({
      question_text: questionText,
      type_id: jobTypeId,
      question_type: 'job_type',
      sort_order: index + 1,
      is_active: true,
      category: ''
    }));

    if (questionsToInsert && questionsToInsert.length > 0) {
      await supabase
        .from('questions')
        .insert(questionsToInsert);
    }
  };

  const replaceQuestionsForJobType = async (jobTypeName: string) => {
    // Find the job type
    let jobType = jobTypes.find(jt => jt.name === jobTypeName);
    
    if (!jobType) {
      // Create the job type if it doesn't exist
      const { data: newJobType, error: createError } = await supabase
        .from('job_types')
        .insert([{
          name: jobTypeName,
          description: `${jobTypeName} role`,
          is_active: true
        }])
        .select()
        .single();
      
      if (createError || !newJobType) return;
      jobType = newJobType;
    }

    // Delete existing questions for this job type
    await supabase
      .from('questions')
      .delete()
      .eq('type_id', jobType.id)
      .eq('question_type', 'job_type');

    // Insert new questions
    const questionsToInsert = allPredefinedQuestions[jobTypeName as keyof typeof allPredefinedQuestions]?.map((questionText, index) => ({
      question_text: questionText,
      type_id: jobType!.id,
      question_type: 'job_type',
      sort_order: index + 1,
      is_active: true,
      category: ''
    }));

    if (questionsToInsert && questionsToInsert.length > 0) {
      await supabase
        .from('questions')
        .insert(questionsToInsert);
    }

    // Refresh data
    fetchJobTypes();
    if (selectedJobType?.id === jobType.id) {
      fetchQuestions(jobType.id);
    }
  };

  const initializePredefinedJobTypes = async () => {
    for (const jobTypeName of Object.keys(allPredefinedQuestions)) {
      await replaceQuestionsForJobType(jobTypeName);
    }
  };


  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const activeJobTypes = jobTypes.filter(jt => jt.is_active);
  const inactiveJobTypes = jobTypes.filter(jt => !jt.is_active);

  return (
    <div className="relative">
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Job Types</CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingJobType({})}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Job Type
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingJobType.id ? 'Edit' : 'Add'} Job Type
                  </DialogTitle>
                </DialogHeader>
                 <div className="space-y-4">
                  <Input
                    placeholder="Job Type Name"
                    value={editingJobType.name || ''}
                    onChange={(e) => setEditingJobType({...editingJobType, name: e.target.value})}
                  />
                  <Textarea
                    placeholder="Description"
                    value={editingJobType.description || ''}
                    onChange={(e) => setEditingJobType({...editingJobType, description: e.target.value})}
                  />
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={editingJobType.is_active || false}
                      onChange={(e) => setEditingJobType({...editingJobType, is_active: e.target.checked})}
                    />
                    <label htmlFor="is_active" className="text-sm font-medium">
                      Active
                    </label>
                  </div>
                  <Button onClick={saveJobType}>Save</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {/* Initialize Predefined Job Types Button */}
            <div className="mb-4">
              <Button 
                onClick={initializePredefinedJobTypes}
                variant="outline"
                className="w-full"
              >
                Initialize Predefined Job Types & Questions
              </Button>
               <p className="text-xs text-gray-500 mt-1">
                 This will create/update all predefined job types with their respective interview questions.
               </p>
            </div>

            {/* Active Job Types Section */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Active Job Types</h3>
              <div className="space-y-2">
                {activeJobTypes.map((jobType) => (
                  <div key={jobType.id} className="flex items-center justify-between p-3 border rounded">
                    <div 
                      className="cursor-pointer flex-1"
                      onClick={() => setSelectedJobType(jobType)}
                    >
                      <div className="font-medium">{jobType.name}</div>
                      <div className="text-sm text-gray-500">{jobType.description}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="default">Active</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingJobType(jobType);
                          setIsDialogOpen(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteJobType(jobType.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inactive Job Types Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Inactive Job Types</h3>
              <div className="space-y-2">
                {Object.entries(inactiveJobCategories).map(([category, jobs]) => (
                  <Collapsible key={category}>
                    <CollapsibleTrigger 
                      className="flex items-center justify-between w-full p-3 border rounded hover:bg-gray-50"
                      onClick={() => toggleCategory(category)}
                    >
                      <span className="font-medium">{category}</span>
                      {expandedCategories[category] ? 
                        <ChevronDown className="w-4 h-4" /> : 
                        <ChevronRight className="w-4 h-4" />
                      }
                    </CollapsibleTrigger>
                     <CollapsibleContent className="ml-4 mt-2 space-y-1">
                        {jobs.map((job) => {
                          const isJobActive = jobTypes.some(jt => jt.name === job && jt.is_active);
                          const existingJobType = jobTypes.find(jt => jt.name === job);
                          if (isJobActive) return null; // Don't show if already active
                          
                           return (
                             <div key={job} className="flex items-center justify-between p-2 text-sm border-l-2 border-gray-200 pl-4 hover:bg-gray-50">
                                <span 
                                   className={`cursor-pointer flex-1 ${!hasQuestions(job) ? 'text-red-600' : 'text-gray-600'}`}
                                   onClick={() => {
                                     console.log('=== CLICK HANDLER START ===');
                                     console.log('Clicked on job:', job);
                                     console.log('existingJobType:', existingJobType);
                                     console.log('Has questions check:', hasQuestions(job));
                                     console.log('Questions for this job:', allPredefinedQuestions[job as keyof typeof allPredefinedQuestions]);
                                     
                                     // CRITICAL FIX: Always treat jobs in inactive categories as inactive
                                     // Even if they exist in database, if they're in this section they should show predefined questions
                                     if (existingJobType && existingJobType.is_active) {
                                       console.log('Setting selectedJobType to ACTIVE job:', existingJobType);
                                       setSelectedJobType(existingJobType);
                                       setSelectedInactiveJobName(null);
                                     } else {
                                       console.log('Setting selectedInactiveJobName to INACTIVE job:', job);
                                       setSelectedJobType(null);
                                       setSelectedInactiveJobName(job);
                                     }
                                     console.log('=== CLICK HANDLER END ===');
                                   }}
                                >
                                  {job}
                                 </span>
                                <div className="flex items-center space-x-2">
                                 {existingJobType && (
                                   <Badge variant="secondary" className="text-xs">Inactive</Badge>
                                 )}
                                 <Button
                                   size="sm"
                                   variant="outline"
                                   onClick={() => activateJobType(job)}
                                   className="ml-2 text-xs"
                                 >
                                   Activate
                                 </Button>
                                </div>
                              </div>
                            );
                         })}
                      </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Floating Questions Popup */}
      {showQuestionsPopup && (selectedJobType || selectedInactiveJobName) && (
        <div className="fixed top-20 right-6 w-96 max-h-[80vh] bg-white border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-sm">
              {selectedJobType ? `Questions for ${selectedJobType.name}` : 
               selectedInactiveJobName ? `Predefined Questions for ${selectedInactiveJobName}` : 
               'Questions'}
            </h3>
            <div className="flex items-center space-x-2">
              {selectedJobType && (
                <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => setEditingQuestion({})}>
                      <Plus className="w-3 h-3 mr-1" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingQuestion.id ? 'Edit' : 'Add'} Question
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="Enter your question text here..."
                        value={editingQuestion.question_text || ''}
                        onChange={(e) => setEditingQuestion({...editingQuestion, question_text: e.target.value})}
                      />
                      <Input
                        placeholder="Category (optional)"
                        value={editingQuestion.category || ''}
                        onChange={(e) => setEditingQuestion({...editingQuestion, category: e.target.value})}
                      />
                      <Input
                        type="number"
                        placeholder="Sort Order"
                        value={editingQuestion.sort_order || 0}
                        onChange={(e) => setEditingQuestion({...editingQuestion, sort_order: parseInt(e.target.value)})}
                      />
                      <Button onClick={saveQuestion}>Save Question</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowQuestionsPopup(false)}
                className="p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
            {questions.length > 0 ? (
              <>
                <div className="text-xs text-gray-600 mb-3">
                  {questions.length} question{questions.length !== 1 ? 's' : ''} 
                  {selectedInactiveJobName ? ' (predefined)' : ' configured'}
                </div>
                <div className="space-y-2">
                  {questions.map((question, index) => (
                    <div key={question.id} className="flex items-start justify-between p-2 border rounded text-xs hover:bg-gray-50">
                      <div className="flex-1">
                        <div className="flex items-start space-x-2">
                          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                            {index + 1}
                          </span>
                          <div className="flex-1">
                            <div className="text-xs leading-relaxed">{question.question_text}</div>
                            {question.category && (
                              <Badge variant="outline" className="mt-1 text-xs">
                                {question.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {selectedJobType && (
                        <div className="flex items-center space-x-1 ml-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingQuestion(question);
                              setIsQuestionDialogOpen(true);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteQuestion(question.id)}
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-sm">No questions configured yet</div>
                <div className="text-xs mt-1">Click "Add" to get started</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};