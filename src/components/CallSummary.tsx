import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, TrendingUp, MessageSquare, CheckCircle2 } from 'lucide-react';
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
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single();

      if (error) throw error;

      const checklist = CALL_TYPE_CHECKLISTS[data.call_type] || [];
      const checklistCompleted = data.checklist_completed || new Array(checklist.length).fill(false);

      setCallData({
        ...data,
        checklist_items: checklist,
        checklist_completed: checklistCompleted
      });

      if (!data.sentiment || !data.score) {
        await calculateSentimentAndScore(data);
      }
    } catch (error) {
      console.error('Error fetching call data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSentimentAndScore = async (call: any) => {
    try {
      const { data: aiData, error: aiError } = await supabase.functions.invoke('chatgpt-integration', {
        body: {
          action: 'analyze_job',
          prompt: `Analyze the sentiment of this call transcript and respond with ONLY one word: Positive, Negative, or Neutral.

Transcript:
${call.transcript || 'No transcript available'}`
        }
      });

      if (aiError) throw aiError;

      const sentiment = aiData?.content?.trim() || 'Neutral';
      
      const durationMinutes = call.duration || 0;
      let score = 0;

      if (durationMinutes >= 30) score += 40;
      else if (durationMinutes >= 20) score += 30;
      else if (durationMinutes >= 10) score += 20;
      else score += 10;

      if (sentiment === 'Positive') score += 30;
      else if (sentiment === 'Neutral') score += 20;
      else score += 10;

      const transcriptLength = (call.transcript || '').length;
      if (transcriptLength > 2000) score += 30;
      else if (transcriptLength > 1000) score += 20;
      else if (transcriptLength > 500) score += 10;

      await supabase
        .from('calls')
        .update({ sentiment, score })
        .eq('id', call.id);

      setCallData(prev => prev ? { ...prev, sentiment, score } : null);
    } catch (error) {
      console.error('Error calculating sentiment:', error);
    }
  };

  const updateSentiment = async (newSentiment: 'Positive' | 'Negative' | 'Neutral') => {
    setUpdatingSentiment(true);
    try {
      await supabase
        .from('calls')
        .update({ sentiment: newSentiment })
        .eq('id', callId);

      setCallData(prev => prev ? { ...prev, sentiment: newSentiment } : null);
    } catch (error) {
      console.error('Error updating sentiment:', error);
    } finally {
      setUpdatingSentiment(false);
    }
  };

  const toggleChecklistItem = async (index: number) => {
    if (!callData) return;

    const newCompleted = [...callData.checklist_completed];
    newCompleted[index] = !newCompleted[index];

    try {
      await supabase
        .from('calls')
        .update({ checklist_completed: newCompleted })
        .eq('id', callId);

      setCallData({ ...callData, checklist_completed: newCompleted });
    } catch (error) {
      console.error('Error updating checklist:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSentimentColor = (sentiment: string | null) => {
    switch (sentiment) {
      case 'Positive': return 'bg-green-100 text-green-800 border-green-300';
      case 'Negative': return 'bg-red-100 text-red-800 border-red-300';
      case 'Neutral': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-500';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading call data...</p>
        </div>
      </div>
    );
  }

  if (!callData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-gray-600">Call not found</p>
            <Button onClick={() => navigate('/live-calls')} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Calls
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = callData.checklist_completed.filter(Boolean).length;
  const totalCount = callData.checklist_items.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/live-calls')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Calls
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{callData.candidate_name}</h1>
              <p className="text-lg text-gray-600 mt-1">{callData.call_type}</p>
            </div>
            <Badge variant="outline" className="text-sm px-3 py-1">
              {new Date(callData.created_at).toLocaleDateString()}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="text-2xl font-bold">{formatDuration(callData.duration)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className={`h-8 w-8 ${getScoreColor(callData.score)}`} />
                <div>
                  <p className="text-sm text-gray-600">Call Score</p>
                  <p className={`text-2xl font-bold ${getScoreColor(callData.score)}`}>
                    {callData.score || 0}/100
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-8 w-8 text-purple-600" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-2">Sentiment</p>
                  <Select
                    value={callData.sentiment || 'Neutral'}
                    onValueChange={(value: any) => updateSentiment(value)}
                    disabled={updatingSentiment}
                  >
                    <SelectTrigger className={`w-full ${getSentimentColor(callData.sentiment)}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Positive">Positive</SelectItem>
                      <SelectItem value="Neutral">Neutral</SelectItem>
                      <SelectItem value="Negative">Negative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Checklist</p>
                  <p className="text-2xl font-bold">{completionPercentage}%</p>
                  <p className="text-xs text-gray-500">{completedCount}/{totalCount} items</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Call Checklist - {callData.call_type}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {callData.checklist_items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Checkbox
                    checked={callData.checklist_completed[index]}
                    onCheckedChange={() => toggleChecklistItem(index)}
                    className="mt-1"
                  />
                  <label
                    className={`flex-1 cursor-pointer ${
                      callData.checklist_completed[index]
                        ? 'text-gray-400 line-through'
                        : 'text-gray-700'
                    }`}
                    onClick={() => toggleChecklistItem(index)}
                  >
                    {item}
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {callData.summary && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Call Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{callData.summary}</p>
            </CardContent>
          </Card>
        )}

        {callData.transcript && (
          <Card>
            <CardHeader>
              <CardTitle>Call Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-96 overflow-y-auto bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700 whitespace-pre-wrap font-mono text-sm">
                  {callData.transcript}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CallSummaryPage;