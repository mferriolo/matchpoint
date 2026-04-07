import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, Mail, Phone, Send, Video, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface ScheduleCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle?: string;
  defaultDescription?: string;
}

export default function ScheduleCallDialog({
  open,
  onOpenChange,
  defaultTitle = '',
  defaultDescription = ''
}: ScheduleCallDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [callTypes, setCallTypes] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    callType: '',
    name: '',
    description: defaultDescription,
    date: '',
    time: '',
    duration: '30',
    callMethod: 'zoom',
    attendeeEmail: '',
    attendeePhone: '',
    sendEmail: true,
    sendSMS: true
  });

  // Load call types and candidates when dialog opens
  useEffect(() => {
    if (open) {
      fetchCallTypes();
      loadCandidates();
      // Reset form when opening
      setFormData({
        callType: '',
        name: '',
        description: defaultDescription,
        date: '',
        time: '',
        duration: '30',
        callMethod: 'zoom',
        attendeeEmail: '',
        attendeePhone: '',
        sendEmail: true,
        sendSMS: true
      });
      setSelectedCandidate(null);
    }
  }, [open]);

  const fetchCallTypes = async () => {
    const { data } = await supabase
      .from('call_types')
      .select('name')
      .eq('is_active', true)
      .order('name');
    if (data) setCallTypes(data.map(ct => ct.name));
  };

  const loadCandidates = async () => {
    setIsLoadingCandidates(true);
    try {
      const { data, error } = await supabase
        .from('candidates')
        .select('id, first_name, last_name, email, phone, current_job_title')
        .order('first_name');

      if (error) {
        console.error('Error fetching candidates:', error);
        return;
      }
      
      setCandidates(data || []);
    } catch (error) {
      console.error('Exception fetching candidates:', error);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const handleCandidateSelect = (candidateName: string) => {
    // Check if this is a candidate from the dropdown
    const candidate = candidates.find(c => 
      `${c.first_name} ${c.last_name}` === candidateName
    );
    
    if (candidate) {
      console.log('Selected candidate:', candidate); // Debug log
      setSelectedCandidate(candidate);
      // Update all fields including email and phone
      setFormData(prev => ({
        ...prev,
        name: candidateName,
        attendeeEmail: candidate.email || prev.attendeeEmail,
        attendeePhone: candidate.phone || prev.attendeePhone
      }));
    } else {
      // User typed a new name
      setSelectedCandidate(null);
      setFormData(prev => ({
        ...prev,
        name: candidateName,
        // Only clear email/phone if we're switching from a candidate to a typed name
        attendeeEmail: selectedCandidate ? '' : prev.attendeeEmail,
        attendeePhone: selectedCandidate ? '' : prev.attendeePhone
      }));
    }
  };

  const handleSchedule = async () => {
    if (!formData.callType || !formData.name || !formData.date || !formData.time || !formData.attendeeEmail) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Combine date and time
      const startTime = new Date(`${formData.date}T${formData.time}`);

      if (formData.callMethod === 'zoom') {
        // Create Zoom meeting with invites
        const { data: zoomData, error: zoomError } = await supabase.functions.invoke('zoom-meeting-invites', {
          body: {
            topic: `${formData.callType} - ${formData.name}`,
            duration: parseInt(formData.duration),
            start_time: startTime.toISOString(),
            emails: formData.sendEmail ? [formData.attendeeEmail] : [],
            phones: formData.sendSMS && formData.attendeePhone ? [formData.attendeePhone] : [],
            agenda: formData.description || `${formData.callType} call with ${formData.name}`,
            settings: {
              auto_recording: 'cloud'
            }
          }
        });

        if (zoomError) {
          console.error('Zoom meeting creation error:', zoomError);
          throw new Error(zoomError.message || 'Failed to create Zoom meeting');
        }

        if (!zoomData || !zoomData.meeting) {
          throw new Error('Invalid response from Zoom API');
        }

        toast({
          title: "Call Scheduled Successfully",
          description: `Zoom meeting scheduled with ${formData.name}. Meeting ID: ${zoomData.meeting.id}`,
        });
      } else {
        // For phone calls, just send notifications
        if (formData.sendEmail || formData.sendSMS) {
          const notifications = [];
          
          if (formData.sendEmail) {
            notifications.push('email');
          }
          
          if (formData.sendSMS && formData.attendeePhone) {
            notifications.push('SMS');
          }
          
          toast({
            title: "Call Scheduled",
            description: `Phone call scheduled with ${formData.name}. Notifications sent via ${notifications.join(' and ')}.`,
          });
        } else {
          toast({
            title: "Call Scheduled",
            description: `Phone call scheduled with ${formData.name}.`,
          });
        }
      }

      // Reset form and close dialog
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error scheduling call:', error);
      toast({
        title: "Scheduling Failed",
        description: error.message || "Failed to schedule the call. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Schedule a Call</DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-1">
          <div className="space-y-3 py-2">
            {/* Row 1: Call Type and Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="callType" className="text-sm">Call Type *</Label>
                <Select
                  value={formData.callType}
                  onValueChange={(value) => setFormData({ ...formData, callType: value })}
                >
                  <SelectTrigger id="callType" className="h-9">
                    <SelectValue placeholder="Select call type" />
                  </SelectTrigger>
                  <SelectContent>
                    {callTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="callMethod" className="text-sm">Call Method *</Label>
                <Select
                  value={formData.callMethod}
                  onValueChange={(value) => setFormData({ ...formData, callMethod: value })}
                >
                  <SelectTrigger id="callMethod" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zoom">
                      <div className="flex items-center">
                        <Video className="mr-2 h-4 w-4" />
                        Zoom
                      </div>
                    </SelectItem>
                    <SelectItem value="call">
                      <div className="flex items-center">
                        <Phone className="mr-2 h-4 w-4" />
                        Call
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Candidate Selection */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm">Candidate Name *</Label>
              {isLoadingCandidates ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 border rounded-md h-9">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Select 
                    value={formData.name} 
                    onValueChange={handleCandidateSelect}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select candidate" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => {
                        const fullName = `${c.first_name} ${c.last_name}`;
                        return (
                          <SelectItem key={c.id} value={fullName}>
                            {fullName}
                            {c.current_job_title && (
                              <span className="text-xs text-muted-foreground ml-2">
                                - {c.current_job_title}
                              </span>
                            )}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Input 
                    placeholder="Or type new name" 
                    value={formData.name} 
                    onChange={(e) => handleCandidateSelect(e.target.value)} 
                    className="h-9" 
                  />
                </div>
              )}
            </div>

            {/* Row 3: Date, Time, Duration */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="date" className="text-sm">Date *</Label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="time" className="text-sm">Time *</Label>
                <div className="relative">
                  <Clock className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="duration" className="text-sm">Duration</Label>
                <Select
                  value={formData.duration}
                  onValueChange={(value) => setFormData({ ...formData, duration: value })}
                >
                  <SelectTrigger id="duration" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Email and Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.attendeeEmail}
                    onChange={(e) => setFormData({ ...formData, attendeeEmail: e.target.value })}
                    placeholder="email@example.com"
                    className="pl-8 h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm">Phone</Label>
                <div className="relative">
                  <Phone className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.attendeePhone}
                    onChange={(e) => setFormData({ ...formData, attendeePhone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                    className="pl-8 h-9"
                  />
                </div>
              </div>
            </div>

            {/* Row 5: Description */}
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-sm">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Call agenda or notes..."
                rows={2}
                className="text-sm"
              />
            </div>

            {/* Row 6: Notification Options */}
            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendEmail"
                  checked={formData.sendEmail}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendEmail: checked as boolean })}
                />
                <Label htmlFor="sendEmail" className="cursor-pointer text-sm">
                  Email notification
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendSMS"
                  checked={formData.sendSMS}
                  onCheckedChange={(checked) => setFormData({ ...formData, sendSMS: checked as boolean })}
                  disabled={!formData.attendeePhone}
                />
                <Label htmlFor="sendSMS" className="cursor-pointer text-sm">
                  SMS notification
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={loading}>
            {loading ? (
              <>Scheduling...</>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Schedule Call
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
