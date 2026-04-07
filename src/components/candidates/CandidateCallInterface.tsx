import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, Video, MessageSquare, X, Mic, MicOff, Clock } from 'lucide-react';
import { Candidate } from '@/types/candidate';

interface Props {
  candidate: Candidate;
  onClose: () => void;
}

const CandidateCallInterface: React.FC<Props> = ({ candidate, onClose }) => {
  const [callType, setCallType] = useState<'phone' | 'video' | 'zoom'>('phone');
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const interviewQuestions = [
    "Tell me about your healthcare experience",
    "Why are you interested in this specialty?",
    "Describe a challenging patient case",
    "How do you handle stress in clinical settings?",
    "What are your career goals?"
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Interview Call - {candidate.first_name} {candidate.last_name}</DialogTitle>

        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">Call Controls</h3>
                <div className="flex gap-2 mb-4">
                  <Button 
                    onClick={() => setCallType('phone')}
                    variant={callType === 'phone' ? 'default' : 'outline'}
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Phone
                  </Button>
                  <Button 
                    onClick={() => setCallType('video')}
                    variant={callType === 'video' ? 'default' : 'outline'}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Video
                  </Button>
                </div>

                {!isCallActive ? (
                  <Button 
                    onClick={() => setIsCallActive(true)}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    Start Call
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-green-600">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span>Call in progress - 00:45</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => setIsMuted(!isMuted)}
                        variant="outline"
                        className="flex-1"
                      >
                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </Button>
                      <Button 
                        onClick={() => setIsCallActive(false)}
                        variant="destructive"
                        className="flex-1"
                      >
                        End Call
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">Candidate Info</h3>
                <div className="space-y-1 text-sm">
                  <p><strong>Specialty:</strong> {candidate.specialty || 'Registered Nurse'}</p>
                  <p><strong>Experience:</strong> {candidate.experience || '5 years'}</p>
                  <p><strong>Location:</strong> {candidate.location || 'New York, NY'}</p>
                  <p><strong>AI Score:</strong> {candidate.aiScore || 85}%</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full">
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2">Interview Questions</h3>
                <div className="space-y-2">
                  {interviewQuestions.map((q, i) => (
                    <div key={i} className="p-2 bg-gray-50 rounded text-sm hover:bg-gray-100 cursor-pointer">
                      {i + 1}. {q}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CandidateCallInterface;