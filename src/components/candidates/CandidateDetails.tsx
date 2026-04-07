import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ClinicalTag } from '@/components/ui/ClinicalTag';
import { 
  X, Download, Mail, Phone, MapPin, Linkedin, 
  Calendar, Briefcase, GraduationCap, Plus, Trash2,
  MessageSquare, Home, Edit2
} from 'lucide-react';
import { Candidate } from '@/types/candidate';
import { supabase } from '@/lib/supabase';


interface Activity {
  id: string;
  note: string;
  created_at: string;
  activity_type: string;
}

interface CandidateDetailsProps {
  candidate: Candidate;
  onClose: () => void;
  onStartCall?: () => void;
  onMatchJobs?: () => void;
}

const CandidateDetails: React.FC<CandidateDetailsProps> = ({ 
  candidate, 
  onClose, 
  onStartCall, 
  onMatchJobs
}) => {
  const { toast } = useToast();
  const [skills, setSkills] = useState<string[]>(candidate.skills || []);
  const [newSkill, setNewSkill] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [activityNote, setActivityNote] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactType, setContactType] = useState<'email' | 'phone' | 'address'>('email');
  const [contactValue, setContactValue] = useState('');
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [additionalPhones, setAdditionalPhones] = useState<string[]>([]);
  const [additionalAddresses, setAdditionalAddresses] = useState<string[]>([]);
  const [editingContactIndex, setEditingContactIndex] = useState<number | null>(null);
  const [editingContactType, setEditingContactType] = useState<'email' | 'phone' | 'address' | null>(null);
  const [editingPrimaryEmail, setEditingPrimaryEmail] = useState(false);
  const [editingPrimaryPhone, setEditingPrimaryPhone] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState(candidate.email || '');
  const [primaryPhone, setPrimaryPhone] = useState(candidate.phone || '');
  useEffect(() => {
    setSkills(candidate.skills || []);
    fetchActivities();
    loadAdditionalContactInfo();
  }, [candidate]);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('candidate_activities')
        .select('*')
        .eq('candidate_id', candidate.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching activities:', error);
      } else {
        setActivities(data || []);
      }
    } catch (error) {
      console.error('Exception fetching activities:', error);
    }
  };

  const loadAdditionalContactInfo = () => {
    // Load additional contact info from candidate metadata if available
    const metadata = candidate.metadata || {};
    setAdditionalEmails(metadata.additionalEmails || []);
    setAdditionalPhones(metadata.additionalPhones || []);
    setAdditionalAddresses(metadata.additionalAddresses || []);
  };

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      const updatedSkills = [...skills, newSkill.trim()];
      setSkills(updatedSkills);
      updateCandidateSkills(updatedSkills);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (index: number) => {
    const updatedSkills = skills.filter((_, i) => i !== index);
    setSkills(updatedSkills);
    updateCandidateSkills(updatedSkills);
  };

  const updateCandidateSkills = async (updatedSkills: string[]) => {
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ skills: updatedSkills, updated_at: new Date().toISOString() })
        .eq('id', candidate.id);
      
      if (error) {
        console.error('Error updating candidate skills:', error);
        toast({
          title: "Error",
          description: "Failed to update skills",
          variant: "destructive"
        });
      } else {
        window.dispatchEvent(new Event('candidatesUpdated'));
      }
    } catch (error) {
      console.error('Exception updating skills:', error);
    }
  };

  const handleAddActivity = async () => {
    if (!activityNote.trim()) {
      toast({
        title: "Error",
        description: "Please enter an activity note",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('candidate_activities')
        .insert({
          candidate_id: candidate.id,
          note: activityNote.trim(),
          activity_type: 'note'
        });

      if (error) {
        console.error('Error adding activity:', error);
        toast({
          title: "Error",
          description: "Failed to add activity",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Activity added successfully"
        });
        setActivityNote('');
        setShowAddActivity(false);
        fetchActivities();
      }
    } catch (error) {
      console.error('Exception adding activity:', error);
    }
  };

  const handleAddContactInfo = async () => {
    if (!contactValue.trim()) {
      toast({
        title: "Error",
        description: "Please enter contact information",
        variant: "destructive"
      });
      return;
    }

    try {
      let updatedMetadata = { ...candidate.metadata } || {};
      
      if (contactType === 'email') {
        const emails = updatedMetadata.additionalEmails || [];
        emails.push(contactValue.trim());
        updatedMetadata.additionalEmails = emails;
        setAdditionalEmails(emails);
      } else if (contactType === 'phone') {
        const phones = updatedMetadata.additionalPhones || [];
        phones.push(contactValue.trim());
        updatedMetadata.additionalPhones = phones;
        setAdditionalPhones(phones);
      } else if (contactType === 'address') {
        const addresses = updatedMetadata.additionalAddresses || [];
        addresses.push(contactValue.trim());
        updatedMetadata.additionalAddresses = addresses;
        setAdditionalAddresses(addresses);
      }

      const { error } = await supabase
        .from('candidates')
        .update({ 
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', candidate.id);

      if (error) {
        console.error('Error adding contact info:', error);
        toast({
          title: "Error",
          description: "Failed to add contact information",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Contact information added successfully"
        });
        setContactValue('');
        setShowAddContact(false);
        window.dispatchEvent(new Event('candidatesUpdated'));
      }
    } catch (error) {
      console.error('Exception adding contact info:', error);
    }
  };

  const handleDeleteContactInfo = async (type: 'email' | 'phone' | 'address', index: number) => {
    try {
      let updatedMetadata = { ...candidate.metadata } || {};
      
      if (type === 'email') {
        const emails = [...(updatedMetadata.additionalEmails || [])];
        emails.splice(index, 1);
        updatedMetadata.additionalEmails = emails;
        setAdditionalEmails(emails);
      } else if (type === 'phone') {
        const phones = [...(updatedMetadata.additionalPhones || [])];
        phones.splice(index, 1);
        updatedMetadata.additionalPhones = phones;
        setAdditionalPhones(phones);
      } else if (type === 'address') {
        const addresses = [...(updatedMetadata.additionalAddresses || [])];
        addresses.splice(index, 1);
        updatedMetadata.additionalAddresses = addresses;
        setAdditionalAddresses(addresses);
      }

      const { error } = await supabase
        .from('candidates')
        .update({ 
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', candidate.id);

      if (error) {
        console.error('Error deleting contact info:', error);
        toast({
          title: "Error",
          description: "Failed to delete contact information",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Contact information deleted successfully"
        });
        window.dispatchEvent(new Event('candidatesUpdated'));
      }
    } catch (error) {
      console.error('Exception deleting contact info:', error);
    }
  };

  const handleEditContactInfo = (type: 'email' | 'phone' | 'address', index: number, value: string) => {
    setEditingContactType(type);
    setEditingContactIndex(index);
    setContactValue(value);
    setContactType(type);
    setShowAddContact(true);
  };

  const handleUpdateContactInfo = async () => {
    if (!contactValue.trim() || editingContactIndex === null || !editingContactType) return;

    try {
      let updatedMetadata = { ...candidate.metadata } || {};
      
      if (editingContactType === 'email') {
        const emails = [...(updatedMetadata.additionalEmails || [])];
        emails[editingContactIndex] = contactValue;
        updatedMetadata.additionalEmails = emails;
        setAdditionalEmails(emails);
      } else if (editingContactType === 'phone') {
        const phones = [...(updatedMetadata.additionalPhones || [])];
        phones[editingContactIndex] = contactValue;
        updatedMetadata.additionalPhones = phones;
        setAdditionalPhones(phones);
      } else if (editingContactType === 'address') {
        const addresses = [...(updatedMetadata.additionalAddresses || [])];
        addresses[editingContactIndex] = contactValue;
        updatedMetadata.additionalAddresses = addresses;
        setAdditionalAddresses(addresses);
      }

      const { error } = await supabase
        .from('candidates')
        .update({ 
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', candidate.id);

      if (error) {
        console.error('Error updating contact info:', error);
        toast({
          title: "Error",
          description: "Failed to update contact information",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Contact information updated successfully"
        });
        setShowAddContact(false);
        setContactValue('');
        setEditingContactIndex(null);
        setEditingContactType(null);
        window.dispatchEvent(new Event('candidatesUpdated'));
      }
    } catch (error) {
      console.error('Exception updating contact info:', error);
    }
  };
  const handleUpdatePrimaryEmail = async () => {
    if (!primaryEmail.trim()) {
      toast({
        title: "Error",
        description: "Email cannot be empty",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('candidates')
        .update({ 
          email: primaryEmail.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', candidate.id);

      if (error) {
        console.error('Error updating email:', error);
        toast({
          title: "Error",
          description: "Failed to update email",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Email updated successfully"
        });
        setEditingPrimaryEmail(false);
        candidate.email = primaryEmail.trim(); // Update local state
        window.dispatchEvent(new Event('candidatesUpdated'));
      }
    } catch (error) {
      console.error('Exception updating email:', error);
    }
  };

  const handleUpdatePrimaryPhone = async () => {
    if (!primaryPhone.trim()) {
      toast({
        title: "Error",
        description: "Phone cannot be empty",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('candidates')
        .update({ 
          phone: primaryPhone.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', candidate.id);

      if (error) {
        console.error('Error updating phone:', error);
        toast({
          title: "Error",
          description: "Failed to update phone",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success",
          description: "Phone updated successfully"
        });
        setEditingPrimaryPhone(false);
        candidate.phone = primaryPhone.trim(); // Update local state
        window.dispatchEvent(new Event('candidatesUpdated'));
      }
    } catch (error) {
      console.error('Exception updating phone:', error);
    }
  };

  const handleDownloadResume = () => {
    if (candidate.resumeUrl) {
      window.open(candidate.resumeUrl, '_blank');
    } else {
      toast({
        title: "No Resume",
        description: "No resume file available for this candidate",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{candidate.first_name} {candidate.last_name}</CardTitle>
            {candidate.job_type && (
              <p className="text-sm font-medium text-gray-700 mt-1">
                {candidate.job_type}
              </p>
            )}
            <p className="text-sm text-gray-600 mt-1">
              {candidate.currentJobTitle || candidate.current_job_title || 'No job title available'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs defaultValue="contact" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="contact">Contact Info</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>

          <TabsContent value="contact" className="space-y-3 mt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium">Contact Information</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddContact(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Contact Info
              </Button>
            </div>
            
            {/* Primary Email - Editable */}
            <div className="flex items-center gap-2 group">
              <Mail className="w-4 h-4 text-gray-400" />
              {editingPrimaryEmail ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={primaryEmail}
                    onChange={(e) => setPrimaryEmail(e.target.value)}
                    className="h-7 text-sm"
                    placeholder="Enter email address"
                  />
                  <Button size="sm" variant="ghost" onClick={handleUpdatePrimaryEmail}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingPrimaryEmail(false);
                    setPrimaryEmail(candidate.email || '');
                  }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm">{candidate.email || 'No email address'}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                    onClick={() => setEditingPrimaryEmail(true)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
            
            {additionalEmails.map((email, index) => (
              <div key={`email-${index}`} className="flex items-center gap-2 ml-6">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{email}</span>
              </div>
            ))}
            
            {/* Primary Phone - Editable */}
            <div className="flex items-center gap-2 group">
              <Phone className="w-4 h-4 text-gray-400" />
              {editingPrimaryPhone ? (
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    value={primaryPhone}
                    onChange={(e) => setPrimaryPhone(e.target.value)}
                    className="h-7 text-sm"
                    placeholder="Enter phone number"
                  />
                  <Button size="sm" variant="ghost" onClick={handleUpdatePrimaryPhone}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingPrimaryPhone(false);
                    setPrimaryPhone(candidate.phone || '');
                  }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-sm">{candidate.phone || 'No phone number'}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                    onClick={() => setEditingPrimaryPhone(true)}
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                </>
              )}
            </div>
            
            {additionalPhones.map((phone, index) => (
              <div key={`phone-${index}`} className="flex items-center gap-2 ml-6">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{phone}</span>
              </div>
            ))}
            
            {candidate.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{candidate.location}</span>
              </div>
            )}
            
            {additionalAddresses.map((address, index) => (
              <div key={`address-${index}`} className="flex items-center gap-2 ml-6">
                <Home className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{address}</span>
              </div>
            ))}
            
            {candidate.experience && (
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-gray-400" />
                <span className="text-sm">{candidate.experience}</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="skills" className="mt-4">
            <div className="space-y-6">
              {/* Profession Tag */}
              {candidate.job_type && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Profession</h4>
                  <ClinicalTag label={candidate.job_type} category="profession" size="md" />
                </div>
              )}
              
              {/* State Licenses */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">State Licenses</h4>
                {candidate.state_licenses && candidate.state_licenses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {candidate.state_licenses.map((license, index) => (
                      <ClinicalTag 
                        key={index} 
                        label={license} 
                        category="state_license" 
                        size="md"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No state licenses tagged</p>
                )}
              </div>
              
              {/* Clinical Specialty */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Clinical Specialty</h4>
                {candidate.clinical_specialty && candidate.clinical_specialty.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {candidate.clinical_specialty.map((specialty, index) => (
                      <ClinicalTag 
                        key={index} 
                        label={specialty} 
                        category="clinical_specialty" 
                        size="md"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No specialties tagged</p>
                )}
              </div>
              
              {/* Clinical Subspecialty */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Clinical Subspecialty</h4>
                {candidate.clinical_subspecialty && candidate.clinical_subspecialty.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {candidate.clinical_subspecialty.map((subspecialty, index) => (
                      <ClinicalTag 
                        key={index} 
                        label={subspecialty} 
                        category="clinical_subspecialty" 
                        size="md"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No subspecialties tagged</p>
                )}
              </div>
              
              {/* General Skills (existing functionality preserved) */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Other Skills</h4>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a skill..."
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
                    />
                    <Button size="sm" onClick={handleAddSkill}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {skills.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill, index) => (
                          <ClinicalTag
                            key={index}
                            label={skill}
                            category="skill"
                            size="md"
                            removable
                            onRemove={() => handleRemoveSkill(index)}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No additional skills listed</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>


          <TabsContent value="activities" className="mt-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium">Activity History</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddActivity(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Activity
                </Button>
              </div>
              
              {activities.length > 0 ? (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div key={activity.id} className="border rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm">{activity.note}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(activity.created_at).toLocaleDateString()} at{' '}
                            {new Date(activity.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No activities recorded yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-4">
          {onStartCall && (
            <Button className="flex-1" size="sm" onClick={onStartCall}>
              Start Interview
            </Button>
          )}
          {onMatchJobs && (
            <Button className="flex-1" size="sm" variant="outline" onClick={onMatchJobs}>
              Match Jobs
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadResume}>
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>

      {/* Add Activity Dialog */}
      <Dialog open={showAddActivity} onOpenChange={setShowAddActivity}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Activity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="activity-note">Activity Note</Label>
              <Textarea
                id="activity-note"
                placeholder="Enter activity details..."
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                className="mt-1"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddActivity(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddActivity}>
              Add Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Info Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="contact-type">Contact Type</Label>
              <Select value={contactType} onValueChange={(value: 'email' | 'phone' | 'address') => setContactType(value)}>
                <SelectTrigger id="contact-type" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="address">Address</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="contact-value">
                {contactType === 'email' ? 'Email Address' : 
                 contactType === 'phone' ? 'Phone Number' : 'Address'}
              </Label>
              <Input
                id="contact-value"
                placeholder={
                  contactType === 'email' ? 'email@example.com' : 
                  contactType === 'phone' ? '(555) 123-4567' : 
                  '123 Main St, City, State ZIP'
                }
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContact(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddContactInfo}>
              Add Contact Info
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CandidateDetails;
