import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, TrendingUp, MessageSquare, CheckCircle2, Circle, Video, Download } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CallData {
  id: string;
  call_category: string;
  call_type: string;
  candidate_name: string;
  duration: number;
  transcript: string;
  summary: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral' | null;
  score: number | null;
  checklist_items: string[];
  checklist_completed: boolean[];
  created_at: string;
  recording_url: string | null;
  recording_status: string | null;
}


const CALL_TYPE_CHECKLISTS: Record<string, string[]> = {
  'Job Order Call': [
    'Confirm title, reporting structure, and reason for opening',
    'Clarify key responsibilities and required skills/certifications',
    'Verify schedule, work model, travel, and location expectations',
    'Identify must-haves, nice-to-haves, and hard disqualifiers',
    'Review compensation structure (base, bonus, benefits)',
    'Confirm timeline, interview steps, and interviewer names',
    'Identify role selling points and cultural highlights',
    'Align on communication expectations and feedback turnaround'
  ],
  'Debrief': [
    'Confirm interview format, length, and attendees',
    'Capture overall impression and what they liked most',
    'Identify concerns or hesitations',
    'Gather questions to relay back to the client',
    'Review updated compensation expectations',
    'Confirm ranking among other opportunities',
    'Capture perceived culture and team fit',
    'Identify next steps and interview timeline'
  ],
  'Full Interview': [
    'Review professional history, scope, and achievements',
    'Confirm must-have qualifications, certifications, and leadership experience',
    'Explore motivations for change',
    'Understand strengths, development areas, and communication style',
    'Verify compensation expectations',
    'Confirm location preferences, relocation, and travel flexibility',
    'Present the role and assess true interest',
    'Determine competing opportunities and timeline pressures'
  ],
  'Initial Screening': [
    'Confirm current role and key responsibilities',
    'Verify must-have qualifications and certifications',
    'Identify compensation expectations and schedule availability',
    'Confirm location, travel, and relocation needs',
    'Understand basic career goals and interests',
    'Present a high-level overview of the opportunity',
    'Identify deal-breakers',
    'Confirm next steps and obtain resume if needed'
  ],
  'Reference Check': [
    'Confirm reference\'s relationship and timeline with the candidate',
    'Validate responsibilities and performance',
    'Assess communication, teamwork, and leadership',
    'Understand reliability, accountability, and work style',
    'Capture strengths with examples',
    'Identify areas for improvement',
    'Confirm eligibility for rehire and recommendation level',
    'Ask for additional references if appropriate'
  ],
  'Client Check-In': [
    'Review active searches and candidate pipeline',
    'Provide market intelligence and candidate feedback',
    'Collect feedback on recent submissions or interviews',
    'Identify shifting priorities or new openings',
    'Discuss challenges (compensation, process delays, competitiveness)',
    'Address bottlenecks in the interview process',
    'Confirm next steps and timelines',
    'Strengthen relationship and communication cadence'
  ],
  'Contract Negotiation': [
    'Confirm interest level and readiness to proceed',
    'Review base salary, bonus, and incentives',
    'Discuss benefits, PTO, and retirement',
    'Clarify relocation or sign-on components',
    'Confirm start date and notice period',
    'Address questions or concerns',
    'Determine flexibility on both sides',
    'Confirm verbal acceptance and outline next steps'
  ]
};

const CallSummaryPage = () => {
  const { callId } = useParams();
  const navigate = useNavigate();
  const [callData, setCallData] = useState<CallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingSentiment, setUpdatingSentiment] = useState(false);

  useEffect(() => {
    if (callId) {
      fetchCallData();
    }
  }, [callId]);

  const fetchCallData = async () => {
    try {
      console.log('📍 Fetching call data for callId:', callId);
      
      const { data, error } = await supabase
        .from('calls')

        .select('*')
        .eq('id', callId)
        .single();

      console.log('📍 Query result:', { data, error });

      if (error) {
        console.error('❌ Error fetching call:', error);
        throw error;
      }
      
      if (!data) {
        console.error('❌ No data returned for callId:', callId);
        throw new Error('Call not found');
      }
      
      console.log('✅ Call data loaded:', data);


      const checklist = CALL_TYPE_CHECKLISTS[data.call_type] || [];
      const completed = data.checklist_completed || new Array(checklist.length).fill(false);

      setCallData({
        ...data,
        checklist_items: checklist,
        checklist_completed: completed
      });
    } catch (error) {
      console.error('Error fetching call data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleChecklistItem = async (index: number) => {
    if (!callData) return;

    const newCompleted = [...callData.checklist_completed];
    newCompleted[index] = !newCompleted[index];

    try {
      const { error } = await supabase
        .from('calls')

        .update({ checklist_completed: newCompleted })
        .eq('id', callId);

      if (error) throw error;

      setCallData({ ...callData, checklist_completed: newCompleted });
    } catch (error) {
      console.error('Error updating checklist:', error);
    }
  };

  const updateSentiment = async (newSentiment: 'Positive' | 'Negative' | 'Neutral') => {
    if (!callData) return;
    setUpdatingSentiment(true);

    try {
      const { error } = await supabase
        .from('calls')

        .update({ sentiment: newSentiment })
        .eq('id', callId);

      if (error) throw error;

      setCallData({ ...callData, sentiment: newSentiment });
    } catch (error) {
      console.error('Error updating sentiment:', error);
    } finally {
      setUpdatingSentiment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading call data...</div>
      </div>
    );
  }

  if (!callData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <div className="text-lg">Call not found</div>
        <Button onClick={() => navigate('/live-calls')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Calls
        </Button>
      </div>
    );
  }

  const completedCount = callData.checklist_completed.filter(Boolean).length;
  const totalCount = callData.checklist_items.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <Button
        variant="ghost"
        onClick={() => navigate('/live-calls')}
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Calls
      </Button>


      {/* Call Recording Video Player */}
      {callData.recording_url && callData.recording_status === 'available' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Call Recording
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                controls
                className="w-full max-h-[500px]"
                src={callData.recording_url}
              >
                Your browser does not support video playback.
              </video>
            </div>
            <div className="flex justify-end mt-3">
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a href={callData.recording_url} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 mr-2" />
                  Download Recording
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {callData.recording_status === 'recording' && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <p className="text-sm font-medium text-red-800">Recording in progress...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {callData.recording_status === 'processing' && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <p className="text-sm font-medium text-blue-800">Processing recording...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {callData.recording_status === 'failed' && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-yellow-800">Recording failed to upload. Please contact support.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{callData.candidate_name}</CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline">{callData.call_category}</Badge>
                    <Badge>{callData.call_type}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {Math.floor(callData.duration / 60)}:{(callData.duration % 60).toString().padStart(2, '0')}
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Call Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {callData.summary || 'No summary available'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Full Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {callData.transcript || 'No transcript available'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Call Sentiment</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={callData.sentiment || 'Neutral'}
                onValueChange={(value) => updateSentiment(value as 'Positive' | 'Negative' | 'Neutral')}
                disabled={updatingSentiment}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Positive">Positive</SelectItem>
                  <SelectItem value="Neutral">Neutral</SelectItem>
                  <SelectItem value="Negative">Negative</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {callData.score !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Call Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{callData.score}/10</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Checklist Progress</CardTitle>
              <div className="text-2xl font-bold">{completionPercentage}%</div>
              <div className="text-xs text-muted-foreground">
                {completedCount} of {totalCount} completed
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {callData.checklist_items.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Checkbox
                    checked={callData.checklist_completed[index]}
                    onCheckedChange={() => toggleChecklistItem(index)}
                    className="mt-1"
                  />
                  <label className="text-sm leading-tight cursor-pointer flex-1" onClick={() => toggleChecklistItem(index)}>
                    {item}
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CallSummaryPage;
