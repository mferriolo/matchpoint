import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, AlertCircle } from 'lucide-react';

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  candidateEmail: string;
}

export const SendEmailDialog: React.FC<SendEmailDialogProps> = ({
  open,
  onOpenChange,
  candidateName,
  candidateEmail
}) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      setError('Please fill in both subject and message');
      return;
    }

    setSending(true);
    setError('');

    // ADD DETAILED LOGGING FOR DEBUGGING
    console.log('=== SEND EMAIL DEBUG (Frontend) ===');
    console.log('candidateName prop:', candidateName);
    console.log('candidateEmail prop:', candidateEmail);
    console.log('subject state:', subject);
    console.log('message state:', message);
    console.log('About to send request body:', {
      to: candidateEmail,
      subject: subject,
      html: `<div>Hello ${candidateName}...</div>`
    });
    console.log('=================================');

    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: candidateEmail,
          subject: subject,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Hello ${candidateName},</h2>
              <div style="color: #555; line-height: 1.6; white-space: pre-wrap;">${message}</div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #888; font-size: 12px;">
                This email was sent from our recruitment platform.
              </p>
            </div>
          `
        }
      });


      if (error) throw error;
      
      // Check if the function returned an error in the response data
      if (data?.error) {
        throw new Error(data.error);
      }


      toast({
        title: "Email Sent",
        description: `Email successfully sent to ${candidateName}`,
      });

      // Reset form and close dialog
      setSubject('');
      setMessage('');
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error sending email:', err);
      setError(err.message || 'Failed to send email');
      toast({
        title: "Error",
        description: err.message || "Failed to send email",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (!sending) {
      setSubject('');
      setMessage('');
      setError('');
      onOpenChange(false);
    }
  };

  // Pre-populate with common templates
  const templates = [
    {
      name: 'Interview Invitation',
      subject: 'Interview Invitation - [Position]',
      message: `I hope this email finds you well.

We were impressed with your background and would like to invite you for an interview for the [Position] role.

Please let us know your availability for the coming week, and we'll schedule a convenient time.

Looking forward to speaking with you.

Best regards,
[Your Name]`
    },
    {
      name: 'Follow Up',
      subject: 'Following Up on Your Application',
      message: `Thank you for your interest in the [Position] role.

We wanted to follow up on your application and see if you have any questions about the position or our company.

Please feel free to reach out if you'd like to discuss further.

Best regards,
[Your Name]`
    }
  ];

  const applyTemplate = (template: typeof templates[0]) => {
    setSubject(template.subject);
    setMessage(template.message);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send Email to {candidateName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Quick Templates */}
          <div className="flex gap-2">
            <Label>Quick Templates:</Label>
            {templates.map((template) => (
              <Button
                key={template.name}
                variant="outline"
                size="sm"
                onClick={() => applyTemplate(template)}
                disabled={sending}
              >
                {template.name}
              </Button>
            ))}
          </div>

          {/* To Field (read-only) */}
          <div className="space-y-2">
            <Label>To</Label>
            <Input value={candidateEmail} disabled />
          </div>

          {/* Subject Field */}
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              placeholder="Enter email subject..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={sending}
            />
          </div>

          {/* Message Field */}
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Type your message here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={10}
              className="resize-none"
            />
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !message.trim()}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};