import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Users, Phone, FileText, Upload, Search, Filter, Calendar, RotateCcw } from 'lucide-react';
import { Candidate } from '@/types/candidate';
import CandidateList from './CandidateList';
import CandidateUpload from './CandidateUpload';
import CandidateDetails from './CandidateDetails';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileCandidates from '@/components/mobile/MobileCandidates';

interface CandidateDashboardProps {
  onStartCall?: () => void;
}

const CandidateDashboard: React.FC<CandidateDashboardProps> = (props) => {
  const isMobile = useIsMobile();
  return isMobile ? <MobileCandidates onStartCall={props.onStartCall} /> : <DesktopCandidateDashboard {...props} />;
};

const DesktopCandidateDashboard: React.FC<CandidateDashboardProps> = ({ onStartCall }) => {

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [activeJobs, setActiveJobs] = useState(0);
  const [callsToday, setCallsToday] = useState(0);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [jobTypeFilter, setJobTypeFilter] = useState('all');
  const [skillsFilter, setSkillsFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  
  const { toast } = useToast();

  // Load candidates from database on mount
  useEffect(() => {
    const loadCandidates = async () => {
      console.log('=== LOADING CANDIDATES (CandidateDashboard) ===');
      
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false });
      
      console.log('Load candidates response:', { 
        data, 
        error, 
        count: data?.length 
      });
      
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
      if (data && data.length > 0) {
        console.log('First candidate:', data[0]);
      }
      
      setCandidates(data || []);
    };
    
    loadCandidates();

    // Load stats from localStorage
    const storedJobs = localStorage.getItem('activeJobs');
    const storedCalls = localStorage.getItem('callsToday');
    
    if (storedJobs) setActiveJobs(parseInt(storedJobs, 10) || 0);
    if (storedCalls) setCallsToday(parseInt(storedCalls, 10) || 0);
  }, []);

  // Extract unique job types and skills for filter dropdowns
  const uniqueJobTypes = useMemo(() => {
    const types = new Set<string>();
    candidates.forEach(candidate => {
      if (candidate.job_type) types.add(candidate.job_type);
    });
    return Array.from(types).sort();
  }, [candidates]);

  const uniqueSkills = useMemo(() => {
    const skills = new Set<string>();
    candidates.forEach(candidate => {
      if (candidate.skills && Array.isArray(candidate.skills)) {
        candidate.skills.forEach(skill => skills.add(skill));
      }
    });
    return Array.from(skills).sort();
  }, [candidates]);

  const handleAddCandidate = () => {
    setShowUpload(true);
  };

  const handleCandidateAdded = (newCandidate: Candidate) => {
    console.log('=== CANDIDATE ADDED CALLBACK ===');
    console.log('New candidate:', newCandidate);
    
    setCandidates(prev => {
      const updated = [newCandidate, ...prev];
      console.log('Updated candidates array length:', updated.length);
      return updated;
    });
    
    // Dispatch event for CandidateList to reload
    window.dispatchEvent(new Event('candidatesUpdated'));
    
    setShowUpload(false);
  };

  // Reset all filters function
  const handleResetFilters = () => {
    setSearchTerm('');
    setJobTypeFilter('all');
    setSkillsFilter('all');
    setDateFilter('all');
  };

  // Check if any filters are active
  const hasActiveFilters = searchTerm !== '' || 
    jobTypeFilter !== 'all' || 
    skillsFilter !== 'all' || 
    dateFilter !== 'all';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with MedCentric Branding */}
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <img 
              src="https://d64gsuwffb70l.cloudfront.net/688a62022b0804ff55b70568_1761676387442_b759d2c1.jpg" 
              alt="MatchPoint Logo" 
              className="h-12 w-12 object-contain"
            />


            <div>
              <h1 className="text-2xl font-bold text-gray-900">MedCentric</h1>
              <p className="text-sm text-gray-600">Candidate Processor</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="px-6 py-4 bg-white border-b">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Stats</h2>
          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              <span className="text-sm text-gray-600">Active Jobs:</span>
              <span className="text-sm font-bold text-gray-900">{activeJobs}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-green-500" />
              <span className="text-sm text-gray-600">Calls Today:</span>
              <span className="text-sm font-bold text-gray-900">{callsToday}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 py-6">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Candidate Dashboard</h2>
              <p className="text-gray-600 mt-1">Manage and analyze candidate profiles</p>
            </div>
            <Button 
              onClick={handleAddCandidate}
              className="bg-[#911406] hover:bg-[#911406]/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Candidate
            </Button>
          </div>


          {/* Filters Section */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Search Box */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      type="text"
                      placeholder="Search candidates..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Job Type Filter */}
                  <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Candidate Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Candidate Types</SelectItem>
                      {uniqueJobTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Skills Filter */}
                  <Select value={skillsFilter} onValueChange={setSkillsFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Skills" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Skills</SelectItem>
                      {uniqueSkills.slice(0, 20).map(skill => (
                        <SelectItem key={skill} value={skill}>{skill}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Date Filter */}
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger>
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
            </CardContent>
          </Card>

          {/* Candidates Section */}
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Total candidates in state: <strong>{candidates.length}</strong>
            </p>
          </div>
          
          {candidates.length === 0 ? (
            <Card className="p-12">
              <CardContent className="text-center">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  No candidates yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Get started by adding your first candidate profile
                </p>
                <Button 
                  onClick={handleAddCandidate}
                  className="bg-[#911406] hover:bg-[#911406]/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Candidate
                </Button>

              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <CandidateList 
                  searchTerm={searchTerm}
                  jobTypeFilter={jobTypeFilter}
                  skillsFilter={skillsFilter}
                  dateFilter={dateFilter}
                  onSelectCandidate={setSelectedCandidate}
                  selectedCandidate={selectedCandidate}
                  viewMode="grid"
                  onStartCall={onStartCall}
                />
              </div>

              
              <div className="lg:col-span-1">
                {selectedCandidate ? (
                  <CandidateDetails 
                    candidate={selectedCandidate}
                    onClose={() => setSelectedCandidate(null)}
                  />
                ) : (
                  <Card className="h-full min-h-[400px] flex items-center justify-center">
                    <CardContent className="text-center p-8">
                      <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Select a candidate to view details</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <CandidateUpload 
          onClose={() => setShowUpload(false)}
          onCandidateAdded={handleCandidateAdded}
        />
      )}
    </div>
  );
};

export default CandidateDashboard;