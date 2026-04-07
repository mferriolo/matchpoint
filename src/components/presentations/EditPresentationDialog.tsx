import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

interface Presentation {
  id: string;
  presentation_name: string;
  presentation_content: string;
  candidate_name: string;
  job_title: string;
  company: string;
}

interface EditPresentationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  presentation: Presentation | null;
  onSave: () => void;
}

export default function EditPresentationDialog({
  isOpen,
  onClose,
  presentation,
  onSave
}: EditPresentationDialogProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    presentation_name: '',
    presentation_content: '',
    candidate_name: '',
    job_title: '',
    company: ''
  });

  useEffect(() => {
    if (presentation) {
      setFormData({
        presentation_name: presentation.presentation_name || '',
        presentation_content: presentation.presentation_content || '',
        candidate_name: presentation.candidate_name || '',
        job_title: presentation.job_title || '',
        company: presentation.company || ''
      });
    }
  }, [presentation]);

  const handleSave = async () => {
    if (!presentation) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('candidate_presentations')
        .update({
          ...formData,
          updated_at: new Date().toISOString()
        })
        .eq('id', presentation.id);

      if (error) throw error;

      toast({
        title: "Presentation updated",
        description: "Your changes have been saved successfully."
      });

      onSave();
      onClose();
    } catch (error) {
      console.error('Error updating presentation:', error);
      toast({
        title: "Error",
        description: "Failed to update presentation",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Presentation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="name">Presentation Name</Label>
            <Input
              id="name"
              value={formData.presentation_name}
              onChange={(e) => setFormData({ ...formData, presentation_name: e.target.value })}
              placeholder="Enter presentation name..."
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="candidate">Candidate Name</Label>
              <Input
                id="candidate"
                value={formData.candidate_name}
                onChange={(e) => setFormData({ ...formData, candidate_name: e.target.value })}
                placeholder="Candidate name..."
              />
            </div>

            <div>
              <Label htmlFor="job">Job Title</Label>
              <Input
                id="job"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                placeholder="Job title..."
              />
            </div>

            <div>
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="Company name..."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="content">Presentation Content</Label>
            <Textarea
              id="content"
              value={formData.presentation_content}
              onChange={(e) => setFormData({ ...formData, presentation_content: e.target.value })}
              placeholder="Enter presentation content..."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}