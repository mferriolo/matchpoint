import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Job } from '@/types/callprompt';

interface EditJobDialogProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (jobId: string, updates: Partial<Job>) => void;
}

const EditJobDialog: React.FC<EditJobDialogProps> = ({ job, isOpen, onClose, onSave }) => {
  const [title, setTitle] = useState(job?.title || '');
  const [company, setCompany] = useState(job?.company || '');

  React.useEffect(() => {
    if (job) {
      setTitle(job.title);
      setCompany(job.company);
    }
  }, [job]);

  const handleSave = () => {
    if (job && title.trim() && company.trim()) {
      onSave(job.id, { title: title.trim(), company: company.trim() });
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Job</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-title">Job Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-company">Company</Label>
            <Input
              id="edit-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditJobDialog;