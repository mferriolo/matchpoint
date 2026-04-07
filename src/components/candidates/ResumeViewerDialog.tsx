import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText } from 'lucide-react';

interface ResumeViewerDialogProps {
  open: boolean;
  onClose: () => void;
  candidateName: string;
  resumeUrl?: string;
  resumeText?: string;
}

const ResumeViewerDialog: React.FC<ResumeViewerDialogProps> = ({
  open,
  onClose,
  candidateName,
  resumeUrl,
  resumeText
}) => {
  console.log('=== RESUME VIEWER DIALOG ===');
  console.log('Dialog open:', open);
  console.log('Candidate Name:', candidateName);
  console.log('Resume URL:', resumeUrl);
  console.log('Resume URL type:', typeof resumeUrl);
  console.log('Resume URL exists:', !!resumeUrl);
  console.log('Resume URL is valid string:', typeof resumeUrl === 'string' && resumeUrl.trim() !== '');
  console.log('Resume Text available:', !!resumeText);
  console.log('Resume Text length:', resumeText?.length);

  const handleOpenResume = () => {
    console.log('=== OPEN RESUME BUTTON CLICKED ===');
    console.log('Attempting to open URL:', resumeUrl);
    if (resumeUrl && resumeUrl.trim() !== '') {
      const fileExtension = resumeUrl.split('.').pop()?.toLowerCase();
      
      let viewUrl = resumeUrl;
      
      // Use Google Docs Viewer for Word documents
      if (fileExtension === 'doc' || fileExtension === 'docx') {
        viewUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(resumeUrl)}&embedded=true`;
        console.log('Word document detected, using Google Docs Viewer:', viewUrl);
      }
      
      // Use direct link instead of window.open to avoid popup blocker
      const link = document.createElement('a');
      link.href = viewUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
      console.log('Link clicked, opening in new tab...');
    } else {
      console.error('No valid resume URL to open');
    }
  };



  // Determine the URL to use for iframe display
  const getDisplayUrl = () => {
    if (!resumeUrl) return '';
    
    const fileExtension = resumeUrl.split('.').pop()?.toLowerCase();
    
    // Use Google Docs Viewer for Word documents
    if (fileExtension === 'doc' || fileExtension === 'docx') {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(resumeUrl)}&embedded=true`;
    }
    
    return resumeUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Resume - {candidateName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          {resumeUrl ? (
            <div className="space-y-4">
              <button
                onClick={handleOpenResume}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Open Resume in New Tab
              </button>
              <iframe 
                src={getDisplayUrl()} 
                className="w-full h-[600px] border rounded"
                title={`Resume for ${candidateName}`}
              />
            </div>

          ) : resumeText ? (
            <div className="whitespace-pre-wrap bg-gray-50 p-6 rounded border">
              {resumeText}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No resume available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};


export default ResumeViewerDialog;
