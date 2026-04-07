import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { JOB_ORDER_QUESTIONS } from '@/utils/jobOrderQuestions';
import { useJobTypes } from '@/contexts/JobTypesContext';
import { JOB_CATEGORIES } from '@/utils/jobTypesData';

export const JobOrderQuestionsManagement: React.FC = () => {
  const { activeJobTypes } = useJobTypes();
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [questions, setQuestions] = useState(JOB_ORDER_QUESTIONS);
  const [editingQuestion, setEditingQuestion] = useState<{jobType: string, index: number} | null>(null);
  const [editText, setEditText] = useState('');

  const toggleCategory = (jobType: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [jobType]: !prev[jobType]
    }));
  };

  const addQuestion = (jobType: string) => {
    const newQuestion = "New question - click edit to modify";
    setQuestions(prev => ({
      ...prev,
      [jobType]: [...(prev[jobType] || []), newQuestion]
    }));
  };

  const removeQuestion = (jobType: string, index: number) => {
    setQuestions(prev => ({
      ...prev,
      [jobType]: prev[jobType].filter((_, i) => i !== index)
    }));
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Job Order Questions by Job Type</CardTitle>
          <p className="text-sm text-gray-600">
            These questions are specific to each job type and appear in the job order section. Click edit to modify questions or add new ones.
          </p>
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
                            <div key={index} className="flex items-start space-x-3 p-3 bg-red-50 border-l-4 border-red-200 rounded">
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full min-w-[24px] text-center font-medium">
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
                                    <div className="text-sm text-red-800 leading-relaxed flex-1">
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
                            onClick={() => addQuestion(jobType)}
                            className="ml-8"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Question
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
    </div>
  );
};