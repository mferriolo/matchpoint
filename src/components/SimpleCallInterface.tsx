import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface SimpleCallInterfaceProps {
  onTranscriptUpdate: (transcript: string) => void;
  onCallStatusChange: (isActive: boolean) => void;
}

const SimpleCallInterface: React.FC<SimpleCallInterfaceProps> = ({
  onTranscriptUpdate,
  onCallStatusChange
}) => {
  const [meetingNumber, setMeetingNumber] = useState('');
  const [userName, setUserName] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
    isSupported
  } = useSpeechRecognition();

  // Update transcript when speech recognition changes
  useEffect(() => {
    if (transcript) {
      onTranscriptUpdate(transcript);
    }
  }, [transcript, onTranscriptUpdate]);

  // Update call status
  useEffect(() => {
    onCallStatusChange(isInCall);
  }, [isInCall, onCallStatusChange]);

  const startCall = async () => {
    if (!meetingNumber || !userName) return;

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      
      setAudioStream(stream);
      setIsInCall(true);
      
      // Start speech recognition
      if (isSupported) {
        startListening();
      }
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  };

  const endCall = () => {
    stopListening();
    
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    
    setIsInCall(false);
    resetTranscript();
  };

  if (!isSupported) {
    return (
      <Alert>
        <AlertDescription>
          Speech recognition is not supported in this browser. Please use Chrome or Edge.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Call Interface
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {speechError && (
          <Alert variant="destructive">
            <AlertDescription>{speechError}</AlertDescription>
          </Alert>
        )}

        {!isInCall ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="meetingNumber">Meeting ID</Label>
              <Input
                id="meetingNumber"
                value={meetingNumber}
                onChange={(e) => setMeetingNumber(e.target.value)}
                placeholder="123 456 7890"
              />
            </div>
            
            <div>
              <Label htmlFor="userName">Your Name</Label>
              <Input
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>

            <Button
              onClick={startCall}
              disabled={!meetingNumber || !userName}
              className="w-full"
            >
              <Phone className="mr-2 h-4 w-4" />
              Start Call
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Call Active</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={isListening ? stopListening : startListening}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={endCall}
                >
                  <PhoneOff className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {audioStream && (
              <div className="text-xs text-green-600">
                Microphone active
              </div>
            )}
            
            {isListening && (
              <div className="text-xs text-blue-600">
                Speech recognition active
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SimpleCallInterface;