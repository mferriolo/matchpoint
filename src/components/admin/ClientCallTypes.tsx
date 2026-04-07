import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Edit, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/use-toast';

interface ClientCallType {
  id: string;
  name: string;
  description: string;
  category: 'candidate' | 'client';
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

export const ClientCallTypes: React.FC = () => {
  const { toast } = useToast();
  const [clientTypes, setClientTypes] = useState<ClientCallType[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedType, setSelectedType] = useState<ClientCallType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<Partial<ClientCallType>>({});
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question>>({});

  // Component state initialization continues...

  useEffect(() => {
    // Only fetch existing call types from database - no automatic creation
    fetchClientTypes();
  }, []);

  useEffect(() => {
    if (selectedType) {
      fetchQuestions(selectedType.id);
    }
  }, [selectedType]);

  const fetchClientTypes = async () => {
    // Client call types are in client_call_types table (no category filter needed)
    const { data, error } = await supabase
      .from('client_call_types')
      .select('*')
      .order('name');
    if (!error && data) setClientTypes(data);
  };



  const fetchQuestions = async (typeId: string) => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('type_id', typeId)
      .eq('question_type', 'client_call_type')
      .order('sort_order');
    if (!error && data) setQuestions(data);
  };

  const saveType = async () => {
    console.log('=== ADMIN CREATING NEW CALL TYPE ===');
    console.log('Name:', editingType.name);
    console.log('Description:', editingType.description);
    console.log('Category:', editingType.category);
    
    // Protect Job Order Call from being edited
    if (editingType.id && editingType.name === 'Job Order Call') {
      toast({
        title: "Cannot Edit",
        description: "Job Order Call is a protected system call type and cannot be edited",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (editingType.id) {
        // Update existing
        const { data, error } = await supabase
          .from('client_call_types')
          .update(editingType)
          .eq('id', editingType.id)
          .select()
          .single();
        
        if (error) {
          console.error('Error updating call type:', error);
          toast({
            title: "Error",
            description: "Failed to update call type",
            variant: "destructive"
          });
          return;
        }
        
        console.log('Call type updated successfully:', data);
        toast({
          title: "Success",
          description: `Call type "${editingType.name}" updated successfully`
        });
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('client_call_types')
          .insert([{ 
            ...editingType, 
            is_active: true,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();
        
        if (error) {
          console.error('Error creating call type:', error);
          toast({
            title: "Error",
            description: "Failed to create call type",
            variant: "destructive"
          });
          return;
        }
        
        console.log('Call type created successfully with ID:', data?.id);
        toast({
          title: "Success",
          description: `Call type "${editingType.name}" created successfully`
        });
      }
      
      fetchClientTypes();
      setIsDialogOpen(false);
      setEditingType({});
    } catch (error) {
      console.error('Exception in saveType:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    }
  };

  const deleteType = async (id: string, name: string) => {
    // Protect Job Order Call from being deleted
    if (name === 'Job Order Call') {
      toast({
        title: "Cannot Delete",
        description: "Job Order Call is a protected system call type and cannot be deleted",
        variant: "destructive"
      });
      return;
    }
    
    await supabase.from('client_call_types').delete().eq('id', id);
    toast({
      title: "Success",
      description: `Call type "${name}" deleted successfully`
    });
    fetchClientTypes();
    if (selectedType?.id === id) setSelectedType(null);
  };


  const saveQuestion = async () => {
    const maxOrder = Math.max(...questions.map(q => q.sort_order), 0);
    const questionData = {
      ...editingQuestion,
      type_id: selectedType?.id,
      question_type: 'client_call_type',
      sort_order: editingQuestion.sort_order || maxOrder + 1,
      is_active: true
    };
    
    if (editingQuestion.id) {
      await supabase.from('questions').update(questionData).eq('id', editingQuestion.id);
    } else {
      await supabase.from('questions').insert([questionData]);
    }
    fetchQuestions(selectedType!.id);
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
    
    fetchQuestions(selectedType!.id);
  };

  const moveQuestion = async (questionId: string, direction: 'up' | 'down') => {
    const currentIndex = questions.findIndex(q => q.id === questionId);
    if ((direction === 'up' && currentIndex === 0) || 
        (direction === 'down' && currentIndex === questions.length - 1)) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const currentQ = questions[currentIndex];
    const swapQ = questions[newIndex];
    
    await supabase.from('questions').update({ sort_order: swapQ.sort_order }).eq('id', currentQ.id);
    await supabase.from('questions').update({ sort_order: currentQ.sort_order }).eq('id', swapQ.id);
    
    fetchQuestions(selectedType!.id);
  };

  const duplicateQuestion = async (question: Question) => {
    const maxOrder = Math.max(...questions.map(q => q.sort_order), 0);
    await supabase.from('questions').insert([{
      question_text: question.question_text + ' (Copy)',
      category: question.category,
      sort_order: maxOrder + 1,
      type_id: selectedType?.id,
      question_type: 'client_call_type',
      is_active: true
    }]);
    fetchQuestions(selectedType!.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Client Call Types</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingType({ category: 'client' })}>
                <Plus className="w-4 h-4 mr-2" />Add Type
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingType.id ? 'Edit' : 'Add'} Client Call Type</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Type Name"
                  value={editingType.name || ''}
                  onChange={(e) => setEditingType({...editingType, name: e.target.value})}
                />
                <Textarea
                  placeholder="Description"
                  value={editingType.description || ''}
                  onChange={(e) => setEditingType({...editingType, description: e.target.value})}
                />
                 <div>
                   <Label>Category</Label>
                   <Select 
                     value={editingType.category || 'client'} 
                     onValueChange={(v) => setEditingType({...editingType, category: v as 'candidate' | 'client'})}
                   >
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="candidate">Candidate</SelectItem>
                       <SelectItem value="client">Client</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 <Button onClick={saveType}>Save</Button>
               </div>
             </DialogContent>
           </Dialog>
         </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {clientTypes.map((type) => {
              const isProtected = type.name === 'Job Order Call';
              return (
                <div key={type.id} className={`flex items-center justify-between p-3 border rounded cursor-pointer transition-colors ${selectedType?.id === type.id ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}>
                  <div className="flex-1" onClick={() => setSelectedType(type)}>
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{type.name}</div>
                      {isProtected && (
                        <Badge variant="outline" className="text-xs">Protected</Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{type.description}</div>
                    <div className="text-xs text-gray-400 mt-1">Category: {type.category || 'Not set'}</div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={type.is_active ? "default" : "secondary"}>
                      {type.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {isProtected ? (
                      <div className="text-xs text-gray-400 px-2">System Type</div>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditingType(type); setIsDialogOpen(true); }}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteType(type.id, type.name); }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>


        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{selectedType ? `Questions for ${selectedType.name}` : 'Questions'}</CardTitle>
          {selectedType && (
            <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingQuestion({})}>
                  <Plus className="w-4 h-4 mr-2" />Add Question
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingQuestion.id ? 'Edit' : 'Add'} Question</DialogTitle>
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
                  <Button onClick={saveQuestion}>Save</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {selectedType ? (
            <>
              <div className="mb-4 text-sm text-gray-600">Total Questions: {questions.length}</div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {questions.map((question, index) => (
                  <div key={question.id} className="flex items-start justify-between p-3 border rounded">
                    <div className="flex-1 pr-2">
                      <div className="text-sm text-gray-500 mb-1">#{question.sort_order}</div>
                      <div className="font-medium text-sm">{question.question_text}</div>
                      {question.category && <Badge variant="outline" className="mt-1 text-xs">{question.category}</Badge>}
                    </div>
                    <div className="flex flex-col space-y-1">
                      <div className="flex space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => moveQuestion(question.id, 'up')} disabled={index === 0}>
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => moveQuestion(question.id, 'down')} disabled={index === questions.length - 1}>
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex space-x-1">
                        <Button size="sm" variant="ghost" onClick={() => duplicateQuestion(question)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingQuestion(question); setIsQuestionDialogOpen(true); }}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteQuestion(question.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">Select a call type to manage questions</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
