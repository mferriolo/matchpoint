import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Calendar, Phone, Video } from 'lucide-react';
import { CallNote } from '@/types/callprompt';

interface CallNotesProps {
  callNotes: CallNote[];
}

const CallNotes: React.FC<CallNotesProps> = ({ callNotes }) => {
  if (!callNotes || callNotes.length === 0) {
    return (
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2 h-5 w-5" />
            Call Notes
            <Badge variant="secondary" className="ml-auto">0</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">
            No call notes yet. Call notes will appear here after completing calls with candidates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 backdrop-blur-sm shadow-lg border-0">
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="mr-2 h-5 w-5" />
          Call Notes
          <Badge variant="secondary" className="ml-auto">{callNotes.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {callNotes.map((note) => (
            <div key={note.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-lg">
                  {note.candidateName} - {note.jobTitle} - {note.callType}
                </h4>
                <div className="flex items-center gap-2">
                  {note.callMethod === 'zoom' ? (
                    <Video className="h-4 w-4 text-blue-600" />
                  ) : (
                    <Phone className="h-4 w-4 text-green-600" />
                  )}
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="mr-1 h-3 w-3" />
                    {new Date(note.date).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="prose prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-sm text-gray-700">
                  {note.summary}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default CallNotes;