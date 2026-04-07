import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface VideoCallInterfaceProps {
  onTranscriptUpdate: (transcript: string) => void;
  onCallStatusChange: (isActive: boolean) => void;
}

const VideoCallInterface: React.FC<VideoCallInterfaceProps> = ({
  onTranscriptUpdate,
  onCallStatusChange
}) => {
  const [meetingNumber, setMeetingNumber] = useState('');
  const [userName, setUserName] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
    isSupported
  } = useSpeechRecognition();

  useEffect(() => {
    if (transcript) {
      onTranscriptUpdate(transcript);
    }
  }, [transcript, onTranscriptUpdate]);

  useEffect(() => {
    onCallStatusChange(isInCall);
  }, [isInCall, onCallStatusChange]);

  const startCall = async () => {
    if (!meetingNumber || !userName) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        },
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      
      setAudioStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      setIsInCall(true);
      
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
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    setIsInCall(false);
    resetTranscript();
  };

  const toggleVideo = () => {
    if (audioStream) {
      const videoTrack = audioStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoEnabled;
        setVideoEnabled(!videoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (audioStream) {
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioEnabled;
        setAudioEnabled(!audioEnabled);
      }
    }
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
    <div className="w-full space-y-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Video Call Interface
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
                Start Video Call
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
                    onClick={toggleVideo}
                  >
                    {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAudio}
                  >
                    {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
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
              
              {isListening && (
                <div className="text-xs text-blue-600">
                  Speech recognition active
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isInCall && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Your Video</CardTitle>
            </CardHeader>
            <CardContent>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-48 bg-gray-900 rounded-lg object-cover"
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Remote Video</CardTitle>
            </CardHeader>
            <CardContent>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-48 bg-gray-900 rounded-lg object-cover"
              />
              <div className="mt-2 text-xs text-gray-500 text-center">
                Waiting for remote participant...
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default VideoCallInterface;