import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Mail, MessageSquare, Check, Link } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface ShareableLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingUrl: string;
  meetingId?: string;
  passcode?: string;
}

export default function ShareableLinkDialog({
  open,
  onOpenChange,
  meetingUrl,
  meetingId,
  passcode
}: ShareableLinkDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [sendEmail, setSendEmail] = useState('');
  const [sendPhone, setSendPhone] = useState('');
  const [sending, setSending] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(meetingUrl);
      setCopied(true);
      toast({
        title: "Link Copied",
        description: "Meeting link has been copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard",
        variant: "destructive"
      });
    }
  };

  const handleSendEmail = async () => {
    if (!sendEmail) return;
    
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('zoom-meeting-invites', {
        body: {
          emails: [sendEmail],
          topic: 'Join Our Zoom Meeting',
          meeting: {
            join_url: meetingUrl,
            id: meetingId,
            password: passcode
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Email Sent",
        description: `Meeting link sent to ${sendEmail}`,
      });
      setSendEmail('');
    } catch (error) {
      toast({
        title: "Send Failed",
        description: "Failed to send email invitation",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!sendPhone) return;
    
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('zoom-meeting-invites', {
        body: {
          phones: [sendPhone],
          topic: 'Join Our Zoom Meeting',
          meeting: {
            join_url: meetingUrl,
            id: meetingId,
            password: passcode
          }
        }
      });

      if (error) throw error;

      toast({
        title: "SMS Sent",
        description: `Meeting link sent to ${sendPhone}`,
      });
      setSendPhone('');
    } catch (error) {
      toast({
        title: "Send Failed",
        description: "Failed to send SMS",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Share Meeting Link
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>Meeting Link</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={meetingUrl}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {meetingId && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-xs text-gray-600">Meeting ID</Label>
                <p className="font-mono text-sm font-medium">{meetingId}</p>
              </div>
              {passcode && (
                <div>
                  <Label className="text-xs text-gray-600">Passcode</Label>
                  <p className="font-mono text-sm font-medium">{passcode}</p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div>
              <Label htmlFor="email">Send via Email</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="email"
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="recipient@example.com"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSendEmail}
                  disabled={!sendEmail || sending}
                >
                  <Mail className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="phone">Send via SMS</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="phone"
                  type="tel"
                  value={sendPhone}
                  onChange={(e) => setSendPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleSendSMS}
                  disabled={!sendPhone || sending}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}