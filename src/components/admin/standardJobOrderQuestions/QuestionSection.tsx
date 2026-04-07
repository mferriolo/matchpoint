import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Save, X, ArrowUp, ArrowDown } from 'lucide-react';
import { QuestionSection as QuestionSectionType } from './types';

interface Props {
  section: QuestionSectionType;
  onUpdateQuestions: (key: string, questions: string[]) => void;
}

export const QuestionSectionComponent: React.FC<Props> = ({ section, onUpdateQuestions }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newQuestion, setNewQuestion] = useState('');

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(section.questions[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editValue.trim()) {
      const updated = [...section.questions];
      updated[editingIndex] = editValue.trim();
      onUpdateQuestions(section.key, updated);
      setEditingIndex(null);
      setEditValue('');
    }
  };

  const handleDelete = (index: number) => {
    const updated = section.questions.filter((_, i) => i !== index);
    onUpdateQuestions(section.key, updated);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= section.questions.length) return;
    const updated = [...section.questions];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onUpdateQuestions(section.key, updated);
  };

  const handleAddQuestion = () => {
    if (newQuestion.trim()) {
      onUpdateQuestions(section.key, [...section.questions, newQuestion.trim()]);
      setNewQuestion('');
    }
  };

  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50">
            <CardTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                {section.title}
              </span>
              <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {section.questions.length} questions
              </span>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <p className="text-gray-600 text-sm mb-4">{section.description}</p>
            <div className="space-y-2">
              {section.questions.map((q, idx) => (
                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-50 rounded border">
                  <span className="text-gray-500 font-medium min-w-[24px]">{idx + 1}.</span>
                  {editingIndex === idx ? (
                    <div className="flex-1 flex gap-2">
                      <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1" rows={2} />
                      <Button size="sm" onClick={handleSaveEdit}><Save className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1">{q}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleMove(idx, 'up')} disabled={idx === 0}><ArrowUp className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleMove(idx, 'down')} disabled={idx === section.questions.length - 1}><ArrowDown className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(idx)}><Edit2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(idx)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Textarea placeholder="Add a new question..." value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} rows={2} className="flex-1" />
              <Button onClick={handleAddQuestion} disabled={!newQuestion.trim()}><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
