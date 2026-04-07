import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Phone, Video, MessageSquare, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { CallNote } from '@/types/callprompt';

interface CallNotesTabProps {
  callNotes: CallNote[];
}

const CallNotesTab: React.FC<CallNotesTabProps> = ({ callNotes }) => {
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const toggleExpanded = (noteId: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(noteId)) {
      newExpanded.delete(noteId);
    } else {
      newExpanded.add(noteId);
    }
    setExpandedNotes(newExpanded);
  };

  const getCallTypeIcon = (method: string) => {
    switch (method) {
      case 'zoom':
        return <Video className="h-4 w-4" />;
      case 'phone':
      case 'twilio':
        return <Phone className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    if (!endTime) return 'Ongoing';
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000 / 60);
    return `${duration} min`;
  };

  if (!callNotes || callNotes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">No call notes available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          Call Notes
          <Badge variant="secondary" className="ml-auto">{callNotes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {callNotes.map((note) => (
            <div key={note.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {getCallTypeIcon(note.callMethod)}
                    <span className="font-medium text-sm uppercase tracking-wide">
                      {note.callMethod}
                    </span>
                  </div>
                  <div className="text-sm font-semibold">
                    {note.candidateName}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm">
                    <Play className="h-3 w-3 mr-1" />
                    Listen
                  </Button>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleExpanded(note.id)}
                      >
                        {expandedNotes.has(note.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        Transcript
                      </Button>
                    </CollapsibleTrigger>
                  </Collapsible>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                <span>{note.date.toLocaleDateString()} at {note.date.toLocaleTimeString()}</span>
                <span>{formatDuration(note.date)} • {note.callType}</span>
              </div>

              <Collapsible open={expandedNotes.has(note.id)}>
                <CollapsibleContent className="mt-3">
                  <div className="bg-white p-3 rounded border">
                    <h4 className="font-medium text-sm mb-2">Call Transcript:</h4>
                    <div className="space-y-2 text-sm">
                      {note.questionsAndResponses.map((qa, index) => (
                        <div key={index} className="border-l-2 border-blue-200 pl-3">
                          <p className="font-medium text-blue-700">Q: {qa.question}</p>
                          <p className="text-gray-700 mt-1">A: {qa.response}</p>
                        </div>
                      ))}
                    </div>
                    {note.summary && (
                      <div className="mt-3 pt-3 border-t">
                        <h5 className="font-medium text-sm mb-1">Summary:</h5>
                        <p className="text-sm text-gray-700">{note.summary}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CallNotesTab;