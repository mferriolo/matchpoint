import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Briefcase, Building, Calendar, Eye, Loader2, Copy, Trash2, Edit2, Minus, Search, CheckSquare, Square, Phone, GripVertical, RotateCcw, Filter } from 'lucide-react';
import { useCallPrompt } from '@/contexts/CallPromptContext';
import { Job, JobType } from '@/types/callprompt';
import { useChatGPT } from '@/hooks/useChatGPT';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getJobTypePrompts } from '@/utils/jobTypePrompts';
import { useJobTypes } from '@/contexts/JobTypesContext';
import { useToast } from '@/hooks/use-toast';
import { StartCallDialog } from '@/components/StartCallDialog';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileJobs from '@/components/mobile/MobileJobs';

interface JobsDashboardProps {
  onJobSelect: (job: Job) => void;
  onStartCall?: () => void;
}

// Route entry. Branches on viewport so the heavy desktop component (and
// its dozens of hooks) only mounts when its UI is shown — same pattern
// as MarketingNewJobs.
const JobsDashboard: React.FC<JobsDashboardProps> = (props) => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileJobs onStartCall={props.onStartCall} /> : <DesktopJobsDashboard {...props} />;
};

const DesktopJobsDashboard: React.FC<JobsDashboardProps> = ({ onJobSelect, onStartCall }) => {
  const { jobs, addJob, duplicateJob, deleteJob, renameJob, isAnalyzing, setAnalyzing, toggleJobActive, updateJob, reorderJobs } = useCallPrompt();
  const { analyzeJob } = useChatGPT();
  const { activeJobTypes } = useJobTypes();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showStartCallDialog, setShowStartCallDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editingJobTypeId, setEditingJobTypeId] = useState<string | null>(null);
  const [editJobType, setEditJobType] = useState<JobType | ''>('');
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [deleteJobTitle, setDeleteJobTitle] = useState<string>('');
  const [filterText, setFilterText] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [formData, setFormData] = useState({
    title: '',
    company: '',
    description: '',
    jobType: '' as JobType | '',
    clientContactFirstName: '',
    clientContactLastName: ''
  });
  const handleCallStarted = () => {
    console.log('=== JOBS DASHBOARD - CALL STARTED ===');
    console.log('handleCallStarted called');
    console.log('onStartCall prop exists?', !!onStartCall);
    
    // Close dialog first
    setShowStartCallDialog(false);
    console.log('Dialog closed');
    
    // Navigate to live call view
    if (onStartCall) {
      console.log('Calling onStartCall to navigate to live-call view...');
      onStartCall();
      console.log('✅ Navigation function called');
    } else {
      console.error('❌ onStartCall prop is not defined!');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSaving || isAnalyzing) {
      console.log('Already saving or analyzing, ignoring duplicate click');
      return;
    }
    
    if (!formData.title || !formData.company || !formData.jobType || formData.description.length < 10) return;

    // Set both flags to prevent double-clicks
    setIsSaving(true);
    setAnalyzing(true);

    try {
      let questions: string[] = [];
      let sellingPoints: string[] = [];
      let objections: string[] = [];
      let summary = '';

      // Always get job-type-specific prompts as base questions
      if (formData.jobType) {
        const jobTypePrompts = getJobTypePrompts(formData.jobType);
        questions = jobTypePrompts.questions;
        sellingPoints = jobTypePrompts.sellingPoints;
        objections = jobTypePrompts.objections;
        console.log('Got job-type-specific prompts for:', formData.jobType);
      }

      if (questions.length === 0) {
        questions = [
          "What's your current notice period?",
          "Are you open to remote work?",
          "What's your salary expectation?",
          "Why are you looking to leave your current role?"
        ];
      }
      
      // Categorize questions into sections
      const categorizedQuestions = {
        specificJobQuestions: questions.slice(0, Math.floor(questions.length / 3)),
        candidateNeeds: questions.slice(Math.floor(questions.length / 3), Math.floor(2 * questions.length / 3)),
        candidateQualifications: questions.slice(Math.floor(2 * questions.length / 3))
      };

      if (sellingPoints.length === 0) {
        sellingPoints = [
          "Competitive salary package",
          "Flexible working arrangements",
          "Career growth opportunities",
          "Great company culture"
        ];
      }

      if (objections.length === 0) {
        objections = [
          "Salary concerns",
          "Location preferences",
          "Career progression doubts",
          "Work-life balance questions"
        ];
      }

      // Generate AI summary if job description is provided
      if (formData.description && formData.description.trim()) {
        try {
          console.log('Generating AI summary for job description...');
          const result = await analyzeJob(formData.description);
          if (result?.content) {
            summary = result.content;
            console.log('Generated AI summary:', summary);
          }
        } catch (error) {
          console.error('Error generating AI summary:', error);
          // Continue without summary if AI fails
        }
      }

      console.log('Adding job with data:', {
        ...formData,
        summary,
        questions,
        sellingPoints,
        objections
      });
      
      await addJob({
        ...formData,
        summary,
        questions,
        sellingPoints,
        objections,
        categorizedQuestions
      });

      setFormData({ title: '', company: '', description: '', jobType: '', clientContactFirstName: '', clientContactLastName: '' });
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error adding job:', error);
    } finally {
      setIsSaving(false);
      setAnalyzing(false);
    }
  };


  const handleRename = (jobId: string, currentTitle: string) => {
    setEditingJobId(jobId);
    setEditTitle(currentTitle);
  };

  const handleSaveRename = (jobId: string) => {
    if (editTitle.trim()) {
      renameJob(jobId, editTitle.trim());
    }
    setEditingJobId(null);
    setEditTitle('');
  };

  const handleCancelRename = () => {
    setEditingJobId(null);
    setEditTitle('');
  };

  const handleEditJobType = (jobId: string, currentJobType: JobType | undefined) => {
    setEditingJobTypeId(jobId);
    setEditJobType(currentJobType || '');
  };

  const handleSaveJobType = (jobId: string) => {
    if (editJobType) {
      updateJob(jobId, { jobType: editJobType as JobType });
    }
    setEditingJobTypeId(null);
    setEditJobType('');
  };

  const handleCancelJobTypeEdit = () => {
    setEditingJobTypeId(null);
    setEditJobType('');
  };

  // Selection functions
  const toggleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedJobs);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedJobs(newSelected);
  };

  const selectAllJobs = () => {
    setSelectedJobs(new Set(filteredJobs.map(j => j.id)));
  };

  const deselectAllJobs = () => {
    setSelectedJobs(new Set());
  };

  // Bulk delete function
  const handleDeleteMultipleJobs = async () => {
    if (selectedJobs.size === 0) return;
    
    console.log('Deleting multiple jobs:', Array.from(selectedJobs));
    
    try {
      // Delete each selected job
      for (const jobId of Array.from(selectedJobs)) {
        deleteJob(jobId);
      }
      
      toast({
        title: "Success",
        description: `${selectedJobs.size} job(s) deleted successfully`
      });
      
      // Clear selection
      setSelectedJobs(new Set());
      
    } catch (error) {
      console.error('Exception deleting jobs:', error);
      toast({
        title: "Error",
        description: "An error occurred while deleting jobs",
        variant: "destructive"
      });
    } finally {
      setShowBulkDeleteConfirm(false);
    }
  };

  // Single job delete function
  const handleDeleteSingleJob = async () => {
    if (!deleteJobId) return;
    
    deleteJob(deleteJobId);
    
    toast({
      title: "Success",
      description: "Job deleted successfully"
    });
    
    setDeleteJobId(null);
    setDeleteJobTitle('');
  };
  // Handle drag end
  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    
    const items = Array.from(filteredJobs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    // Update the jobs array with new order using the context method
    reorderJobs(items);
  };

  // Reset filters function
  const handleResetFilters = () => {
    setFilterText('');
    setJobTypeFilter('all');
    setDateFilter('all');
  };

  // Check if any filters are active
  const hasActiveFilters = filterText !== '' || jobTypeFilter !== 'all' || dateFilter !== 'all';

  // Get unique job types for filter
  const uniqueJobTypes = Array.from(new Set(jobs.map(j => j.jobType).filter(Boolean))) as string[];

  // Filter jobs (without sorting since we use drag-and-drop for ordering)
  const filteredJobs = jobs
    .filter(job => {
      // Search filter
      if (filterText) {
        const searchLower = filterText.toLowerCase();
        const matchesSearch = 
          job.title?.toLowerCase().includes(searchLower) ||
          job.company?.toLowerCase().includes(searchLower) ||
          job.jobType?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      // Job type filter
      if (jobTypeFilter !== 'all' && job.jobType !== jobTypeFilter) {
        return false;
      }
      
      // Date filter
      if (dateFilter !== 'all') {
        const jobDate = job.createdAt;
        const now = new Date();
        
        switch(dateFilter) {
          case 'today':
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (jobDate < today) return false;
            break;
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (jobDate < weekAgo) return false;
            break;
          case 'month':
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            if (jobDate < monthAgo) return false;
            break;
        }
      }
      
      return true;
    });

  const allSelected = filteredJobs.length > 0 && selectedJobs.size === filteredJobs.length;
  return (
    <div className="p-6 space-y-6">
      {/* Header with logo and bulk actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <img 
            src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761676387442_b759d2c1.jpg" 
            alt="MatchPoint Logo" 
            className="w-12 h-12 object-contain"
          />
          <h1 className="text-3xl font-bold">Jobs Dashboard</h1>
        </div>

        
        <div className="flex items-center gap-3">
          {/* Start Call Button */}
          {/* Bulk actions when items selected */}
          {selectedJobs.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedJobs.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={deselectAllJobs}
              >
                Clear Selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedJobs.size})
              </Button>
            </>
          )}
          
          {/* Start Call Button */}
          {/* Start Call Button */}
          <Button 
            size="lg" 
            onClick={() => setShowStartCallDialog(true)}
            className="bg-[#911406] hover:bg-[#911406]/90 text-white font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-all"
          >
            <Phone className="w-5 h-5 mr-2" />
            Start New Call
          </Button>
          
          {/* Add new button */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-[#911406] hover:bg-[#911406]/90 text-white font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-all">
                <Plus className="w-5 h-5 mr-2" />
                Add Job
              </Button>

            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Job</DialogTitle>
                <DialogDescription>
                  Create a new job posting with AI-powered analysis and job-type specific questions.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="title">Job Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Senior Software Engineer"
                  />
                </div>
                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={formData.company}
                    onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                    placeholder="TechCorp Inc."
                  />
                </div>
                <div>
                  <Label htmlFor="jobType">Job Type</Label>
                  <Select value={formData.jobType} onValueChange={(value) => setFormData(prev => ({ ...prev, jobType: value as JobType }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select job type" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeJobTypes.map((jobType) => (
                        <SelectItem key={jobType} value={jobType}>
                          {jobType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="clientContactFirstName">Client Contact First Name</Label>
                    <Input
                      id="clientContactFirstName"
                      value={formData.clientContactFirstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, clientContactFirstName: e.target.value }))}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientContactLastName">Client Contact Last Name</Label>
                    <Input
                      id="clientContactLastName"
                      value={formData.clientContactLastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, clientContactLastName: e.target.value }))}
                      placeholder="Smith"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Job Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Paste job description here..."
                    rows={4}
                  />
                  {formData.description.length < 10 && formData.description.length > 0 && (
                    <p className="text-sm text-red-500 mt-1">Job description must be at least 10 characters</p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className={`w-full ${(!formData.title || !formData.company || !formData.jobType || formData.description.length < 10) ? 'bg-gray-400 cursor-not-allowed' : ''}`} 
                  disabled={isAnalyzing || !formData.title || !formData.company || !formData.jobType || formData.description.length < 10}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing with AI...
                    </>
                  ) : (
                    'Add Job'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          

        </div>
      </div>

      {/* Filter and Sort Controls */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          {/* Search/Filter */}
          <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4" />
            <Input
              placeholder="Search jobs..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          
          {/* Job Type Filter */}
          <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Job Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Job Types</SelectItem>
              {uniqueJobTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reset Filters Button */}
        {hasActiveFilters && (
          <div className="flex justify-end">
            <Button 
              onClick={handleResetFilters}
              variant="outline"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        )}
      </div>

      {/* Select All */}
      {filteredJobs.length > 0 && (
        <div className="flex items-center gap-2 p-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={allSelected ? deselectAllJobs : selectAllJobs}
            className="flex items-center gap-2"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 text-gray-700 stroke-[2.5]" />
            )}
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {filteredJobs.length} item(s)
          </span>
        </div>
      )}
      {/* Jobs Grid */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No jobs found</p>
          {filterText && (
            <p className="text-sm mt-1">Try adjusting your search criteria</p>
          )}
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="jobs">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredJobs.map((job, index) => (
                  <Draggable key={job.id} draggableId={job.id} index={index}>
                    {(provided, snapshot) => (
                      <Card 
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`hover:shadow-xl transition-all duration-300 border-0 shadow-lg bg-white/80 backdrop-blur-sm relative ${
                          snapshot.isDragging ? 'shadow-2xl opacity-90 rotate-1' : ''
                        }`}
                      >
                        {/* Checkbox for selection */}
                        <div className="absolute top-3 left-3 z-10">
                          <Checkbox 
                            checked={selectedJobs.has(job.id)} 
                            onCheckedChange={(checked) => toggleSelect(job.id, checked as boolean)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <CardHeader className="pb-3 relative pl-12">
                          <div className="absolute top-2 right-2 flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRename(job.id, job.title);
                              }}
                              className="h-6 w-6 p-0 hover:bg-green-100"
                            >
                              <Edit2 className="h-3 w-3 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                duplicateJob(job.id);
                              }}
                              className="h-6 w-6 p-0 hover:bg-gray-100"
                            >
                              <Copy className="h-3 w-3 text-gray-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteJobId(job.id);
                                setDeleteJobTitle(job.title);
                              }}
                              className="h-6 w-6 p-0 hover:bg-red-100"
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </div>
                          <div className="flex items-start justify-between pr-24">
                            <div className="flex items-center gap-2">
                              <div {...provided.dragHandleProps}>
                                <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                              </div>
                              <div className="flex-1">
                                {editingJobId === job.id ? (
                                  <div className="flex items-center gap-2 mb-1">
                                    <Input
                                      value={editTitle}
                                      onChange={(e) => setEditTitle(e.target.value)}
                                      className="text-lg font-semibold"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveRename(job.id);
                                        } else if (e.key === 'Escape') {
                                          handleCancelRename();
                                        }
                                      }}
                                      autoFocus
                                    />
                                  </div>
                                ) : (
                                  <CardTitle className="text-lg font-semibold text-gray-900 mb-1 max-w-[200px] break-words">
                                    {job.title}
                                  </CardTitle>
                                )}
                                <div className="flex items-center text-sm text-gray-600 mb-2">
                                  <Building className="mr-1 h-3 w-3" />
                                  {job.company}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant="secondary" 
                                className={job.isActive !== false ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}
                              >
                                {job.isActive !== false ? "Active" : "Inactive"}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleJobActive(job.id);
                                }}
                                className={`h-6 w-6 p-0 ${job.isActive !== false ? 'hover:bg-red-100' : 'hover:bg-green-100'}`}
                                title={job.isActive !== false ? "Make Inactive" : "Make Active"}
                              >
                                {job.isActive !== false ? (
                                  <Minus className="h-3 w-3 text-red-600" />
                                ) : (
                                  <Plus className="h-3 w-3 text-green-600" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center text-xs text-gray-500 mb-4">
                            <Calendar className="mr-1 h-3 w-3" />
                            Created {job.createdAt.toLocaleDateString()}
                          </div>
                          <div className="space-y-2 mb-4">
                            <div className="flex justify-between items-center text-sm gap-2">
                              <span className="text-gray-600">Job Type:</span>
                              {editingJobTypeId === job.id ? (
                                <div className="flex items-center gap-1 flex-1 justify-end">
                                  <Select 
                                    value={editJobType} 
                                    onValueChange={(value) => setEditJobType(value as JobType)}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-[140px]">
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {activeJobTypes.map((type) => (
                                        <SelectItem key={type} value={type} className="text-xs">
                                          {type}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveJobType(job.id);
                                    }}
                                    className="h-6 w-6 p-0 hover:bg-green-100"
                                  >
                                    <span className="text-green-600 text-xs">✓</span>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCancelJobTypeEdit();
                                    }}
                                    className="h-6 w-6 p-0 hover:bg-red-100"
                                  >
                                    <span className="text-red-600 text-xs">✕</span>
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline">{job.jobType || 'Not Specified'}</Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditJobType(job.id, job.jobType);
                                    }}
                                    className="h-5 w-5 p-0 hover:bg-gray-100"
                                  >
                                    <Edit2 className="h-3 w-3 text-gray-600" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {(job.clientContactFirstName || job.clientContactLastName) && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Client Contact:</span>
                                <Badge variant="outline">{`${job.clientContactFirstName || ''} ${job.clientContactLastName || ''}`.trim()}</Badge>
                              </div>
                            )}
                            {(job.city || job.state) && (
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">City, State:</span>
                                <Badge variant="outline">{`${job.city || ''}, ${job.state || ''}`.replace(/^,\s*|,\s*$/g, '') || 'Not Specified'}</Badge>
                              </div>
                            )}
                          </div>
                          <Button 
                            onClick={() => onJobSelect(job)}
                            className="w-full bg-[#911406] hover:bg-[#911406]/90"
                            size="sm"
                          >
                            <Eye className="mr-2 h-3 w-3" />
                            View Details
                          </Button>

                        </CardContent>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Empty state for no jobs at all */}
      {jobs.length === 0 && (
        <div className="text-center py-16">
          <Briefcase className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs yet</h3>
          <Button onClick={() => setIsDialogOpen(true)} className="bg-[#911406] hover:bg-[#911406]/90">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Job
          </Button>

        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Multiple Jobs?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedJobs.size}</strong> job(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBulkDeleteConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMultipleJobs} className="bg-red-600 hover:bg-red-700">
              Delete {selectedJobs.size} Job(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Job Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteJobId} onOpenChange={(open) => !open && setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteJobTitle}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteJobId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSingleJob} className="bg-red-600 hover:bg-red-700">
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
      />
    </div>

  );
};

export default JobsDashboard;
