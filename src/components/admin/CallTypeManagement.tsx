import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, Plus, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ClientCallTypes } from './ClientCallTypes';


interface CallType {
  id: string;
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

export const CallTypeManagement: React.FC = () => {
  const [callTypes, setCallTypes] = useState<CallType[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedCallType, setSelectedCallType] = useState<CallType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [editingCallType, setEditingCallType] = useState<Partial<CallType>>({});
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question>>({});

  useEffect(() => {
    fetchCallTypes();
  }, []);

  useEffect(() => {
    if (selectedCallType) {
      fetchQuestions(selectedCallType.id);
    }
  }, [selectedCallType]);

  const fetchCallTypes = async () => {
    // Candidate call types are in the call_types table (NOT client_call_types)
    const { data, error } = await supabase
      .from('call_types')
      .select('*')
      .order('name');
    if (!error && data) {
      const sortOrder = ['Initial Screening', 'Full Interview', 'Debrief', 'Reference Check'];
      const sortedData = data.sort((a, b) => {
        const aIndex = sortOrder.indexOf(a.name);
        const bIndex = sortOrder.indexOf(b.name);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });
      setCallTypes(sortedData);
    }
  };



  const fetchQuestions = async (callTypeId: string) => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('type_id', callTypeId)
      .eq('question_type', 'call_type')
      .order('sort_order');
    if (!error && data) setQuestions(data);
  };

  const saveCallType = async () => {
    // Save to call_types table (for candidate call types)
    const callTypeData = {
      ...editingCallType,
      is_active: editingCallType.is_active !== undefined ? editingCallType.is_active : true
    };
    
    if (editingCallType.id) {
      await supabase
        .from('call_types')
        .update(callTypeData)
        .eq('id', editingCallType.id);
    } else {
      await supabase
        .from('call_types')
        .insert([callTypeData]);
    }
    fetchCallTypes();
    setIsDialogOpen(false);
    setEditingCallType({});
  };

  const deleteCallType = async (id: string) => {
    await supabase.from('call_types').delete().eq('id', id);
    fetchCallTypes();
  };



  const saveQuestion = async () => {
    const maxOrder = Math.max(...questions.map(q => q.sort_order), 0);
    const questionData = {
      ...editingQuestion,
      type_id: selectedCallType?.id,
      question_type: 'call_type',
      sort_order: editingQuestion.sort_order || maxOrder + 1
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
    fetchQuestions(selectedCallType!.id);
    setIsQuestionDialogOpen(false);
    setEditingQuestion({});
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from('questions').delete().eq('id', id);
    
    // Renumber remaining questions
    const remainingQuestions = questions.filter(q => q.id !== id);
    for (let i = 0; i < remainingQuestions.length; i++) {
      await supabase.from('questions')
        .update({ sort_order: i + 1 })
        .eq('id', remainingQuestions[i].id);
    }
    
    fetchQuestions(selectedCallType!.id);
  };


  const moveQuestion = async (questionId: string, direction: 'up' | 'down') => {
    const currentIndex = questions.findIndex(q => q.id === questionId);
    if ((direction === 'up' && currentIndex === 0) || 
        (direction === 'down' && currentIndex === questions.length - 1)) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const currentQ = questions[currentIndex];
    const swapQ = questions[newIndex];
    
    await supabase.from('questions')
      .update({ sort_order: swapQ.sort_order })
      .eq('id', currentQ.id);
    
    await supabase.from('questions')
      .update({ sort_order: currentQ.sort_order })
      .eq('id', swapQ.id);
    
    fetchQuestions(selectedCallType!.id);
  };

  const duplicateQuestion = async (question: Question) => {
    const maxOrder = Math.max(...questions.map(q => q.sort_order), 0);
    const newQuestion = {
      question_text: question.question_text + ' (Copy)',
      category: question.category,
      sort_order: maxOrder + 1,
      type_id: selectedCallType?.id,
      question_type: 'call_type'
    };
    
    await supabase.from('questions').insert([newQuestion]);
    fetchQuestions(selectedCallType!.id);
  };

  return (
    <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Candidate Call Types</CardTitle>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingCallType({})}>
                <Plus className="w-4 h-4 mr-2" />
                Add Call Type
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCallType.id ? 'Edit' : 'Add'} Call Type
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Call Type Name"
                  value={editingCallType.name || ''}
                  onChange={(e) => setEditingCallType({...editingCallType, name: e.target.value})}
                />
                <Textarea
                  placeholder="Description"
                  value={editingCallType.description || ''}
                  onChange={(e) => setEditingCallType({...editingCallType, description: e.target.value})}
                />
                <Button onClick={saveCallType}>Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {callTypes.map((callType) => (
              <div key={callType.id} className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-colors ${selectedCallType?.id === callType.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}>
                <div 
                  className="flex-1"
                  onClick={() => setSelectedCallType(callType)}
                >
                  <div className="font-medium">{callType.name}</div>
                  <div className="text-sm text-gray-500">{callType.description}</div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={callType.is_active ? "default" : "secondary"}>
                    {callType.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCallType(callType);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCallType(callType.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {selectedCallType ? `Questions for ${selectedCallType.name}` : 'Questions'}
          </CardTitle>
          {selectedCallType && (
            <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingQuestion({})}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Question
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
                    placeholder="Question Text"
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
                    value={editingQuestion.sort_order || ''}
                    onChange={(e) => setEditingQuestion({...editingQuestion, sort_order: parseInt(e.target.value) || 0})}
                  />
                  <Button onClick={saveQuestion}>Save</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {selectedCallType ? (
            <>
              <div className="mb-4 text-sm text-gray-600">
                Total Questions: {questions.length}
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {questions.map((question, index) => (
                  <div key={question.id} className="flex items-start justify-between p-3 border rounded">
                    <div className="flex-1 pr-2">
                      <div className="text-sm text-gray-500 mb-1">#{question.sort_order}</div>
                      <div className="font-medium text-sm">{question.question_text}</div>
                      {question.category && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {question.category}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-col space-y-1">
                      <div className="flex space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveQuestion(question.id, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveQuestion(question.id, 'down')}
                          disabled={index === questions.length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => duplicateQuestion(question)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingQuestion(question);
                            setIsQuestionDialogOpen(true);
                          }}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteQuestion(question.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Call Type</h3>
              <p className="text-gray-500 mb-4">
                Choose a call type from the left panel to view and manage its questions.
              </p>
              <div className="text-sm text-gray-400">
                You can add, edit, reorder, and duplicate questions for each call type.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    <ClientCallTypes />
    </div>
  );
};