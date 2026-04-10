import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, RotateCcw, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { QuestionSectionComponent } from './standardJobOrderQuestions/QuestionSection';
import { QuestionSection, DEFAULT_SECTIONS } from './standardJobOrderQuestions/types';
import { COMPANY_SECTION, HIRING_SECTION } from './standardJobOrderQuestions/defaultSections2';

const STORAGE_KEY = 'standardJobOrderQuestions';

export const StandardJobOrderQuestionsManagement: React.FC = () => {
  const { toast } = useToast();
  const [sections, setSections] = useState<QuestionSection[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [...DEFAULT_SECTIONS, COMPANY_SECTION, HIRING_SECTION];
      }
    }
    return [...DEFAULT_SECTIONS, COMPANY_SECTION, HIRING_SECTION];
  });
  const [hasChanges, setHasChanges] = useState(false);

  const handleUpdateQuestions = (key: string, questions: string[]) => {
    setSections(prev => prev.map(s => s.key === key ? { ...s, questions } : s));
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
    setHasChanges(false);
    toast({ title: 'Saved', description: 'Standard job order questions have been saved.' });
  };

  const handleReset = () => {
    const defaults = [...DEFAULT_SECTIONS, COMPANY_SECTION, HIRING_SECTION];
    setSections(defaults);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    setHasChanges(false);
    toast({ title: 'Reset', description: 'Questions have been reset to defaults.' });
  };

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Standard Job Order Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 mb-4">
            Manage the standard questions that appear on every job order across all 4 categories.
            These questions apply to all job types. Job-type specific questions are managed in the "Q's by Job Type" tab.
          </p>
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm text-gray-500">
              Total: <span className="font-semibold text-gray-800">{totalQuestions}</span> questions across {sections.length} sections
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges} className={hasChanges ? 'bg-green-600 hover:bg-green-700' : ''}>
                <Save className="h-4 w-4 mr-2" /> Save Changes
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {sections.map(section => (
        <QuestionSectionComponent
          key={section.key}
          section={section}
          onUpdateQuestions={handleUpdateQuestions}
        />
      ))}

      {hasChanges && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-2 rounded-lg shadow-lg">
          You have unsaved changes
        </div>
      )}
    </div>
  );
};
