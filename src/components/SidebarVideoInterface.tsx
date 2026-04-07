import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Video, VideoOff, Mic, MicOff } from 'lucide-react';

interface SidebarVideoInterfaceProps {
  onTranscriptUpdate?: (transcript: string) => void;
  onCallStatusChange?: (isActive: boolean) => void;
}

const SidebarVideoInterface: React.FC<SidebarVideoInterfaceProps> = ({
  onTranscriptUpdate,
  onCallStatusChange
}) => {
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    startVideo();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startVideo = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setStream(mediaStream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }
      onCallStatusChange?.(true);
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoOn;
        setIsVideoOn(!isVideoOn);
      }
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioOn;
        setIsAudioOn(!isAudioOn);
      }
    }
  };

  return (
    <Card className="bg-white/90 backdrop-blur-sm shadow-lg border-0">
      <CardContent className="p-3">
        <div className="space-y-3">
          <div className="relative">
            <video
              id="local-video"
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-32 bg-gray-900 rounded-lg object-cover"
            />
            <div className="absolute top-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
              You
            </div>
          </div>
          
          {/* Remote participant video */}
          <div className="relative">
            <video
              id="participant-video"
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-32 bg-gray-800 rounded-lg object-cover"
            />
            <div className="absolute top-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
              Participant
            </div>
            {/* Placeholder when no remote video */}
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
              Waiting for participant...
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={isVideoOn ? "default" : "destructive"}
              onClick={toggleVideo}
              className="flex-1"
            >
              {isVideoOn ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
            </Button>
            <Button
              size="sm"
              variant={isAudioOn ? "default" : "destructive"}
              onClick={toggleAudio}
              className="flex-1"
            >
              {isAudioOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
            </Button>
          </div>
          
          <div className="text-xs text-center text-gray-500">
            Zoom Video Call
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SidebarVideoInterface;