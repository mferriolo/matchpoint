import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Mail, Phone, MapPin, Briefcase, Star, 
  Calendar, ChevronRight, FileText, User, Trash2, PhoneCall, CheckSquare, Square, ArrowUpDown, GripVertical
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { StartCallDialog } from '@/components/StartCallDialog';
import { SendEmailDialog } from './SendEmailDialog';
import { CandidateTags } from '@/components/ui/ClinicalTag';


interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  location?: string;
  specialty?: string;
  currentJobTitle?: string;
  current_job_title?: string; // Add snake_case version from database
  job_type?: string; // Add job_type field
  currentCompany?: string;
  experience?: string;
  skills?: string[];
  status: string;
  matchScore?: number;
  createdAt?: string;
  created_at?: string; // Add database field
  resumeUrl?: string;
  resume_url?: string;
  state_licenses?: string[];
  clinical_specialty?: string[];
  clinical_subspecialty?: string[];
}




interface CandidateListProps {
  searchTerm: string;
  jobTypeFilter?: string;
  skillsFilter?: string;
  dateFilter?: string;
  viewMode: 'grid' | 'list';
  onSelectCandidate: (candidate: Candidate) => void;
  selectedCandidate: Candidate | null;
  onStartCall?: () => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  searchTerm,
  jobTypeFilter,
  skillsFilter,
  dateFilter,
  viewMode,
  onSelectCandidate,
  selectedCandidate,
  onStartCall
}) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showStartCallDialog, setShowStartCallDialog] = useState(false);
  const [selectedCandidateForCall, setSelectedCandidateForCall] = useState<Candidate | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [deleteCandidateName, setDeleteCandidateName] = useState<string>('');
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [selectedCandidateForEmail, setSelectedCandidateForEmail] = useState<Candidate | null>(null);
  const { toast } = useToast();


  // Load candidates from Supabase database
  useEffect(() => {
    const loadCandidates = async () => {
      console.log('=== LOADING CANDIDATES (CandidateList) ===');
      
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false });
      
      console.log('=== CANDIDATE DATA DEBUG ===');
      if (data && data.length > 0) {
        console.log('Total candidates loaded:', data.length);
        console.log('First candidate full object:', data[0]);
        console.log('All field names in first candidate:', Object.keys(data[0]));
        
        // Look specifically for Nesren Anton
        const nesren = data.find(c => 
          (c.first_name?.toLowerCase() === 'nesren' && c.last_name?.toLowerCase() === 'anton') ||
          c.name?.toLowerCase().includes('nesren anton')
        );
        
        if (nesren) {
          console.log('=== NESREN ANTON DATA ===');
          console.log('Full Nesren object:', nesren);
          console.log('Nesren email field:', nesren.email);
          console.log('Nesren email type:', typeof nesren.email);
          console.log('Nesren email truthy?:', !!nesren.email);
          console.log('All Nesren fields:', Object.entries(nesren).map(([key, value]) => `${key}: ${value}`));
        } else {
          console.log('Nesren Anton not found in candidates');
        }
        
        // Log all candidates with their emails
        console.log('=== ALL CANDIDATES EMAIL CHECK ===');
        data.forEach(candidate => {
          const name = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || candidate.name || 'Unknown';
          console.log(`${name}: email="${candidate.email}" (type: ${typeof candidate.email}, truthy: ${!!candidate.email})`);
        });
      }
      
      if (error) {
        console.error('❌ Error loading candidates:', error);
        toast({
          title: "Error",
          description: "Failed to load candidates from database",
          variant: "destructive"
        });
        return;
      }
      
      console.log('✅ Candidates loaded:', data?.length || 0);
      setCandidates(data || []);
    };

    // Load initially
    loadCandidates();

    // Listen for custom event for same-window updates
    window.addEventListener('candidatesUpdated', loadCandidates);

    return () => {
      window.removeEventListener('candidatesUpdated', loadCandidates);
    };
  }, []);


  const getStatusColor = (status: string) => {
    switch(status) {
      case 'new': return 'bg-blue-100 text-blue-700';
      case 'screening': return 'bg-yellow-100 text-yellow-700';
      case 'interviewed': return 'bg-purple-100 text-purple-700';
      case 'offered': return 'bg-green-100 text-green-700';
      case 'hired': return 'bg-green-600 text-white';
      case 'rejected': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };



  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };



  // Selection functions
  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedCandidates);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedCandidates(newSelected);
  };



  // Bulk delete function
  const handleDeleteMultipleCandidates = async () => {
    if (selectedCandidates.size === 0) return;
    
    console.log('Deleting multiple candidates:', Array.from(selectedCandidates));
    
    try {
      const { error } = await supabase
        .from('candidates')
        .delete()
        .in('id', Array.from(selectedCandidates));
      
      if (error) {
        console.error('Error deleting candidates:', error);
        toast({
          title: "Error",
          description: "Failed to delete candidates",
          variant: "destructive"
        });
        return;
      }
      
      // Remove from local state
      setCandidates(prev => prev.filter(c => !selectedCandidates.has(c.id)));
      
      // Dispatch event to update other components
      window.dispatchEvent(new Event('candidatesUpdated'));
      
      toast({
        title: "Success",
        description: `${selectedCandidates.size} candidate(s) deleted successfully`
      });
      
      // Clear selection
      setSelectedCandidates(new Set());
      
    } catch (error) {
      console.error('Exception deleting candidates:', error);
      toast({
        title: "Error",
        description: "An error occurred while deleting candidates",
        variant: "destructive"
      });
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  // Drag and drop handler
  const handleDragEnd = (result: any) => {
    console.log('=== DRAG END (Candidates) ===');
    console.log('Source:', result.source);
    console.log('Destination:', result.destination);
    
    // Dropped outside the list
    if (!result.destination) {
      console.log('Dropped outside list');
      return;
    }
    
    // No movement
    if (result.destination.index === result.source.index) {
      console.log('No movement');
      return;
    }
    
    console.log('Reordering candidates...');
    
    // Reorder the array
    const items = Array.from(filteredCandidates);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    console.log('New order:', items.map(c => `${c.first_name} ${c.last_name}`));
    
    // Update the main candidates array to maintain the new order
    setCandidates(prevCandidates => {
      // Create a map of the new order for filtered candidates
      const orderMap = new Map(items.map((item, index) => [item.id, index]));
      
      // Sort all candidates, keeping non-filtered ones at the end
      return [...prevCandidates].sort((a, b) => {
        const aIndex = orderMap.get(a.id);
        const bIndex = orderMap.get(b.id);
        
        if (aIndex !== undefined && bIndex !== undefined) {
          return aIndex - bIndex;
        }
        if (aIndex !== undefined) return -1;
        if (bIndex !== undefined) return 1;
        return 0;
      });
    });
    
    // Silently update without toast notification
  };

  // Filter candidates with all filters
  const filteredCandidates = candidates
    .filter(candidate => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const fullName = `${candidate.first_name} ${candidate.last_name}`.toLowerCase();
        const matchesSearch = fullName.includes(searchLower) ||
          candidate.email?.toLowerCase().includes(searchLower) ||
          candidate.specialty?.toLowerCase().includes(searchLower) ||
          candidate.skills?.some(skill => skill.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Job type filter
      if (jobTypeFilter && jobTypeFilter !== 'all') {
        if (!candidate.job_type || candidate.job_type !== jobTypeFilter) return false;
      }
      
      // Skills filter
      if (skillsFilter && skillsFilter !== 'all') {
        if (!candidate.skills || !candidate.skills.includes(skillsFilter)) return false;
      }
      
      // Date filter
      if (dateFilter && dateFilter !== 'all') {
        const candidateDate = candidate.created_at || candidate.createdAt;
        if (!candidateDate) return false;
        
        const date = new Date(candidateDate);
        const now = new Date();
        
        switch(dateFilter) {
          case 'today':
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (date < today) return false;
            break;
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (date < weekAgo) return false;
            break;
          case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            if (date < monthAgo) return false;
            break;
        }
      }
      
      return true;
    });

  // Selection helper functions (must be after filteredCandidates)
  const selectAllCandidates = () => {
    setSelectedCandidates(new Set(filteredCandidates.map(c => c.id)));
  };

  const deselectAllCandidates = () => {
    setSelectedCandidates(new Set());
  };

  const allSelected = filteredCandidates.length > 0 && selectedCandidates.size === filteredCandidates.length;



  const handleResumeClick = (candidate: Candidate) => {
    console.log('=== RESUME CLICK DEBUG ===');
    console.log('Full candidate object:', candidate);
    
    // Check all possible field names for resume URL
    const resumeUrl = candidate.resumeUrl || candidate.resume_url || (candidate as any).resumeLink || (candidate as any).resume_link;
    
    console.log('Resume URL found:', resumeUrl);
    
    if (!resumeUrl || resumeUrl.trim() === '') {
      toast({
        title: "No Resume",
        description: "No resume file available for this candidate",
        variant: "destructive",
      });
      return;
    }
    
    // Get file extension
    const fileExtension = resumeUrl.split('.').pop()?.toLowerCase();
    console.log('File extension:', fileExtension);
    
    let finalUrl = resumeUrl;
    
    // CRITICAL FIX: For Word documents, use Google Docs Viewer with proper URL encoding
    // This ensures both DOC and DOCX files can be viewed
    if (fileExtension === 'doc' || fileExtension === 'docx') {
      // Google Docs Viewer works best with publicly accessible URLs
      // Make sure the URL is properly encoded
      finalUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(resumeUrl)}&embedded=true`;
      console.log('Using Google Docs Viewer for Word document:', finalUrl);
      
      // Alternative: Use Office Online Viewer as fallback
      // finalUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(resumeUrl)}`;
    } else if (fileExtension === 'pdf') {
      // For PDFs, open directly - browsers handle these natively
      console.log('Opening PDF directly:', resumeUrl);
      finalUrl = resumeUrl;
    } else {
      console.log('Unknown file type, opening directly:', resumeUrl);
      finalUrl = resumeUrl;
    }
    
    console.log('Final URL to open:', finalUrl);
    
    // Create and click a link to avoid popup blockers
    const link = document.createElement('a');
    link.href = finalUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteSingleCandidate = async () => {
    if (!deleteCandidateId) return;
    
    try {
      const { error } = await supabase
        .from('candidates')
        .delete()
        .eq('id', deleteCandidateId);
      
      if (error) {
        console.error('Error deleting candidate:', error);
        toast({
          title: "Error",
          description: "Failed to delete candidate",
          variant: "destructive",
        });
        return;
      }
      
      // Remove from local state
      setCandidates(prev => prev.filter(c => c.id !== deleteCandidateId));
      
      // Dispatch event to update other components
      window.dispatchEvent(new Event('candidatesUpdated'));
      
      toast({
        title: "Success",
        description: "Candidate deleted successfully",
      });
      
      setDeleteCandidateId(null);
      setDeleteCandidateName('');
    } catch (error) {
      console.error('Exception deleting candidate:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const handleStartCallWithCandidate = (candidate: Candidate, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('=== START CALL WITH CANDIDATE ===');
    console.log('Pre-populating with candidate:', candidate);
    
    setSelectedCandidateForCall(candidate);
    setShowStartCallDialog(true);
  };

  const handleCallStarted = () => {
    console.log('=== CALL STARTED - NAVIGATING TO LIVE CALL ===');
    setShowStartCallDialog(false);
    
    // Navigate to live call view
    if (onStartCall) {
      console.log('Calling onStartCall callback to navigate');
      onStartCall();
    } else {
      console.warn('⚠️ onStartCall callback not provided');
    }
  };

  const handleSendEmail = (candidate: Candidate, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // ADD DETAILED LOGGING FOR DEBUGGING
    console.log('=== HANDLE SEND EMAIL (CandidateList) ===');
    console.log('Full candidate object:', candidate);
    console.log('candidate.first_name:', candidate.first_name);
    console.log('candidate.last_name:', candidate.last_name);
    console.log('candidate.email:', candidate.email);
    console.log('candidate.email type:', typeof candidate.email);
    
    // VALIDATE EMAIL FORMAT
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const candidateEmail = candidate.email || '';
    
    if (!candidateEmail || !emailRegex.test(candidateEmail)) {
      console.error('❌ INVALID EMAIL DETECTED:', candidateEmail);
      toast({
        title: "Invalid Email Address",
        description: `Cannot send email. The email field for ${candidate.first_name} ${candidate.last_name} contains invalid data: "${candidateEmail}". Please update the candidate record with a valid email address.`,
        variant: "destructive"
      });
      return;
    }
    
    console.log('✅ Email validation passed');
    console.log('Passing to SendEmailDialog:');
    console.log('  - candidateName:', `${candidate.first_name} ${candidate.last_name}`);
    console.log('  - candidateEmail:', candidateEmail);
    console.log('==========================================');
    
    setSelectedCandidateForEmail(candidate);
    setShowEmailDialog(true);
  };








  if (filteredCandidates.length === 0) {
    return (
      <Card className="p-8">
        <CardContent className="text-center">
          <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No candidates found</p>
          {searchTerm && (
            <p className="text-sm text-gray-400 mt-1">
              Try adjusting your search criteria
            </p>
          )}
        </CardContent>
      </Card>
    );
  }


  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Header with bulk actions */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Candidates ({filteredCandidates.length})
          </h2>
          <div className="flex gap-2 items-center">
            {selectedCandidates.size > 0 && (
              <>
                <span className="text-sm text-muted-foreground">
                  {selectedCandidates.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deselectAllCandidates}
                >
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete ({selectedCandidates.size})
                </Button>
              </>
            )}
            <div className="text-sm text-muted-foreground">
              <GripVertical className="w-4 h-4 inline mr-1" />
              Drag to reorder
            </div>
          </div>
        </div>

        {/* Select All checkbox */}
        {filteredCandidates.length > 0 && (
          <div className="flex items-center gap-2 p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={allSelected ? deselectAllCandidates : selectAllCandidates}
              className="flex items-center gap-2"
            >
              {allSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4 text-gray-700 stroke-[2.5]" />
              )}
              <span className="text-sm">
                {allSelected ? 'Deselect All' : 'Select All'}
              </span>
            </Button>
          </div>
        )}
        
        {/* Draggable candidates list */}
        <Droppable droppableId="candidates-list">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-3"
            >
              {filteredCandidates.map((candidate, index) => {
                return (
                  <Draggable key={candidate.id} draggableId={candidate.id} index={index}>
                    {(provided, snapshot) => (
                      <Card 
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`transition-all ${
                          snapshot.isDragging ? 'shadow-xl ring-2 ring-primary z-50' : ''
                        } ${
                          selectedCandidate?.id === candidate.id ? 'ring-2 ring-blue-500' : ''
                        } cursor-default`}
                        onClick={() => onSelectCandidate(candidate)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Drag handle */}
                            <div
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing text-gray-600 hover:text-primary p-1 mt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GripVertical className="h-5 w-5" />
                            </div>
                            
                            {/* Checkbox for selection */}
                            <Checkbox 
                              checked={selectedCandidates.has(candidate.id)} 
                              onCheckedChange={(checked) => toggleSelect(candidate.id, checked as boolean)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1"
                            />
                            
                            <div className="flex-1 flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-lg font-semibold">
                                    {candidate.first_name} {candidate.last_name}
                                  </h3>
                                  <Badge className={getStatusColor(candidate.status)}>
                                    {candidate.status}
                                  </Badge>
                                </div>

                                {candidate.job_type && (
                                  <p className="text-sm font-medium text-gray-700 mb-1">
                                    {candidate.job_type}
                                  </p>
                                )}

                                <p className="text-sm text-gray-600 mb-2">
                                  {candidate.current_job_title || candidate.currentJobTitle || 'No job title available'}
                                </p>

                                <div className="space-y-2 mb-3">
                                  {/* Phone and Email stacked vertically */}
                                  <div className="space-y-1">
                                    {candidate.phone && (
                                      <div className="flex items-center gap-1 text-sm text-gray-500">
                                        <Phone className="w-3 h-3" />
                                        {candidate.phone}
                                      </div>
                                    )}
                                    {candidate.email && (
                                      <div className="flex items-center gap-1 text-sm text-gray-500">
                                        <Mail className="w-3 h-3" />
                                        {candidate.email}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Location and Experience horizontal */}
                                  <div className="flex flex-wrap gap-4">
                                    {candidate.location && (
                                      <span className="flex items-center gap-1 text-sm text-gray-500">
                                        <MapPin className="w-3 h-3" />
                                        {candidate.location}
                                      </span>
                                    )}
                                    {candidate.experience && (
                                      <span className="flex items-center gap-1 text-sm text-gray-500">
                                        <Briefcase className="w-3 h-3" />
                                        {candidate.experience}
                                      </span>
                                    )}
                                  </div>
                                </div>


                                <CandidateTags
                                  jobType={candidate.job_type}
                                  stateLicenses={candidate.state_licenses}
                                  clinicalSpecialty={candidate.clinical_specialty}
                                  clinicalSubspecialty={candidate.clinical_subspecialty}
                                  skills={candidate.skills}
                                  maxDisplay={5}
                                  size="sm"
                                />

                              </div>


                              <div className="flex items-center gap-2 ml-4">
                                {/* Email button */}
                                {candidate.email && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-3 text-xs font-medium bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
                                    onClick={(e) => handleSendEmail(candidate, e)}
                                    title="Send Email"
                                  >
                                    <Mail className="w-3 h-3 mr-1" />
                                    Email
                                  </Button>
                                )}
                                
                                {/* Start Call button */}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-3 text-xs font-medium bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                                  onClick={(e) => handleStartCallWithCandidate(candidate, e)}
                                  title="Start Live Call"
                                >
                                  <PhoneCall className="w-3 h-3 mr-1" />
                                  Call
                                </Button>
                                
                                {/* Resume icon button */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResumeClick(candidate);
                                  }}
                                  title="View Resume"
                                >
                                  <FileText className="w-4 h-4 text-blue-600" />
                                </Button>
                                
                                {/* Delete button */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteCandidateId(candidate.id);
                                    setDeleteCandidateName(`${candidate.first_name} ${candidate.last_name}`);
                                  }}
                                  title="Delete Candidate"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </Button>
                                
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>

                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>

       
       {/* Bulk Delete Confirmation Dialog */}
       <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Multiple Candidates?</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete <strong>{selectedCandidates.size}</strong> candidate(s)? This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleDeleteMultipleCandidates} className="bg-red-600 hover:bg-red-700">
               Delete {selectedCandidates.size} Candidate(s)
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

       {/* Single Candidate Delete Confirmation Dialog */}
       <AlertDialog open={!!deleteCandidateId} onOpenChange={(open) => !open && setDeleteCandidateId(null)}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Delete Candidate?</AlertDialogTitle>
             <AlertDialogDescription>
               Are you sure you want to delete <strong>{deleteCandidateName}</strong>? This action cannot be undone.
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel onClick={() => setDeleteCandidateId(null)}>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={handleDeleteSingleCandidate} className="bg-red-600 hover:bg-red-700">
               Delete
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
       
       {/* Start Call Dialog */}
       <StartCallDialog 
         open={showStartCallDialog}
         onOpenChange={setShowStartCallDialog}
         onCallStarted={handleCallStarted}
         prePopulatedCandidate={selectedCandidateForCall ? {
           name: `${selectedCandidateForCall.first_name} ${selectedCandidateForCall.last_name}`,
           candidateId: selectedCandidateForCall.id
         } : undefined}
         />

       {/* Send Email Dialog */}
       {selectedCandidateForEmail && (
         <SendEmailDialog
           open={showEmailDialog}
           onOpenChange={setShowEmailDialog}
           candidateName={`${selectedCandidateForEmail.first_name} ${selectedCandidateForEmail.last_name}`}
           candidateEmail={selectedCandidateForEmail.email || ''}
         />
       )}

      </div>
    </DragDropContext>
  );
};

export default CandidateList;