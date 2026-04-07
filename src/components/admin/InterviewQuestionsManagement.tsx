import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Save, X, PlusCircle } from 'lucide-react';
import { INTERVIEW_QUESTIONS } from '@/utils/interviewQuestions';
import { useJobTypes } from '@/contexts/JobTypesContext';
import { JOB_CATEGORIES } from '@/utils/jobTypesData';
import { useToast } from '@/hooks/use-toast';

export const InterviewQuestionsManagement: React.FC = () => {
  const { activeJobTypes } = useJobTypes();
  const { toast } = useToast();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState(INTERVIEW_QUESTIONS);
  const [editingQuestion, setEditingQuestion] = useState<{jobType: string, index: number} | null>(null);
  const [editText, setEditText] = useState('');
  
  // Add Question Dialog State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedJobType, setSelectedJobType] = useState('');
  const [newQuestionText, setNewQuestionText] = useState('');
  const [questionCategory, setQuestionCategory] = useState('general');

  const toggleCategory = (jobType: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [jobType]: !prev[jobType]
    }));
  };

  const openAddDialog = (jobType: string) => {
    setSelectedJobType(jobType);
    setNewQuestionText('');
    setQuestionCategory('general');
    setIsAddDialogOpen(true);
  };

  const addQuestion = () => {
    if (!newQuestionText.trim()) {
      toast({
        title: "Error",
        description: "Please enter a question",
        variant: "destructive"
      });
      return;
    }

    const formattedQuestion = `[${questionCategory.toUpperCase()}] ${newQuestionText.trim()}`;
    
    setQuestions(prev => ({
      ...prev,
      [selectedJobType]: [...(prev[selectedJobType] || []), formattedQuestion]
    }));

    toast({
      title: "Question Added",
      description: `New question added to ${selectedJobType}`,
    });

    setIsAddDialogOpen(false);
    setNewQuestionText('');
    setQuestionCategory('general');
  };

  const removeQuestion = (jobType: string, index: number) => {
    setQuestions(prev => ({
      ...prev,
      [jobType]: prev[jobType].filter((_, i) => i !== index)
    }));
    
    toast({
      title: "Question Removed",
      description: "The question has been deleted",
    });
  };

  const startEdit = (jobType: string, index: number, currentText: string) => {
    setEditingQuestion({jobType, index});
    setEditText(currentText);
  };

  const saveEdit = () => {
    if (!editingQuestion) return;
    const {jobType, index} = editingQuestion;
    
    setQuestions(prev => ({
      ...prev,
      [jobType]: prev[jobType].map((q, i) => i === index ? editText : q)
    }));
    
    toast({
      title: "Question Updated",
      description: "The question has been saved",
    });
    
    setEditingQuestion(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditingQuestion(null);
    setEditText('');
  };

  // Create dynamic job type categories with Active Jobs from context
  const jobTypeCategories = {
    'Active Jobs': activeJobTypes,
    ...Object.fromEntries(
      Object.entries(JOB_CATEGORIES).filter(([key]) => key !== 'Active Jobs')
    )
  };

  // Get all job types for the dropdown
  const allJobTypes = Object.values(jobTypeCategories).flat();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Interview Questions by Job Type</CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Manage interview questions for each profession. Add, edit, or remove questions as needed.
              </p>
            </div>
            <Button 
              onClick={() => {
                if (allJobTypes.length > 0) {
                  openAddDialog(allJobTypes[0]);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add New Question
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(jobTypeCategories).map(([category, jobTypes]) => (
              <div key={category} className="border rounded-lg">
                <div className={`px-4 py-2 font-medium text-sm border-b ${
                  category === 'Active Jobs' 
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-800' 
                    : 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-800'
                }`}>
                  {category}
                </div>
                <div className="p-2 space-y-2">
                  {jobTypes.map((jobType) => {
                    const jobQuestions = questions[jobType] || [];
                    
                    return (
                      <Collapsible key={jobType}>
                        <CollapsibleTrigger 
                          className={`flex items-center justify-between w-full p-3 text-left hover:bg-gray-50 rounded ${
                            jobQuestions.length === 0 ? 'bg-red-50 border border-red-200' : ''
                          }`}
                          onClick={() => toggleCategory(jobType)}
                        >
                          <span className={`font-medium text-sm ${
                            jobQuestions.length === 0 ? 'text-red-700' : ''
                          }`}>
                            {jobType}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className={`text-xs ${
                              jobQuestions.length === 0 ? 'text-red-500' : 'text-gray-500'
                            }`}>
                              {jobQuestions.length} question{jobQuestions.length !== 1 ? 's' : ''}
                            </span>
                            {expandedCategories[jobType] ? 
                              <ChevronDown className="w-4 h-4" /> : 
                              <ChevronRight className="w-4 h-4" />
                            }
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="ml-4 mt-2 space-y-3">
                          {jobQuestions.map((question, index) => (
                            <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 border-l-4 border-blue-200 rounded">
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full min-w-[24px] text-center font-medium">
                                {index + 1}
                              </span>
                              <div className="flex-1">
                                {editingQuestion?.jobType === jobType && editingQuestion?.index === index ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editText}
                                      onChange={(e) => setEditText(e.target.value)}
                                      className="text-sm"
                                      rows={3}
                                    />
                                    <div className="flex space-x-2">
                                      <Button size="sm" onClick={saveEdit}>
                                        <Save className="w-3 h-3 mr-1" />
                                        Save
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={cancelEdit}>
                                        <X className="w-3 h-3 mr-1" />
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between">
                                    <div className="text-sm text-blue-800 leading-relaxed flex-1">
                                      {question}
                                    </div>
                                    <div className="flex space-x-1 ml-2">
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => startEdit(jobType, index, question)}
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        variant="ghost"
                                        onClick={() => removeQuestion(jobType, index)}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => openAddDialog(jobType)}
                            className="ml-8 bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Question to {jobType}
                          </Button>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Question Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Interview Question</DialogTitle>
            <DialogDescription>
              Create a new interview question for the selected profession.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profession">Profession</Label>
              <Select value={selectedJobType} onValueChange={setSelectedJobType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a profession" />
                </SelectTrigger>
                <SelectContent>
                  {allJobTypes.map((jobType) => (
                    <SelectItem key={jobType} value={jobType}>
                      {jobType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Question Category</Label>
              <Select value={questionCategory} onValueChange={setQuestionCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="behavioral">Behavioral</SelectItem>
                  <SelectItem value="situational">Situational</SelectItem>
                  <SelectItem value="experience">Experience</SelectItem>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="leadership">Leadership</SelectItem>
                  <SelectItem value="teamwork">Teamwork</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="question">Question Text</Label>
              <Textarea
                id="question"
                placeholder="Enter your interview question here..."
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-gray-500">
                Write a clear, open-ended question that will help assess the candidate's qualifications.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addQuestion} className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};