import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { User, Users } from 'lucide-react';

interface VideoFeedsSidebarProps {
  localVideoRef: React.RefObject<HTMLDivElement>;
  participantVideoRef: React.RefObject<HTMLDivElement>;
  hasHostVideo: boolean;
  hasParticipantVideo: boolean;
  isInMeeting: boolean;
  participantJoined: boolean;
  isVideoOff: boolean;
}

const VideoFeedsSidebar: React.FC<VideoFeedsSidebarProps> = ({
  localVideoRef,
  participantVideoRef,
  hasHostVideo,
  hasParticipantVideo,
  isInMeeting,
  participantJoined,
  isVideoOff
}) => {
  return (
    <div className="px-4 py-4 border-t border-white/20">
      <h3 className="text-white text-sm font-semibold mb-3">Live Video</h3>
      
      <div className="space-y-3">
        {/* Host Video - Compact */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
          <div className="absolute top-1 left-1 text-white text-xs bg-black/70 px-2 py-0.5 rounded z-10">
            You (Host)
          </div>
          
          {/* React-managed placeholder */}
          {!hasHostVideo && (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <User size={24} />
            </div>
          )}
          
          {/* Manually-managed video container */}
          <div
            ref={localVideoRef}
            className="w-full h-full"
            style={{ display: hasHostVideo ? 'block' : 'none' }}
          />
          
          {!isVideoOff && hasHostVideo && (
            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded z-10">
              ●
            </div>
          )}
        </div>

        {/* Participant Video - Compact */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
          <div className="absolute top-1 left-1 text-white text-xs bg-black/70 px-2 py-0.5 rounded z-10">
            Participant
          </div>
          
          {/* React-managed placeholder */}
          {!hasParticipantVideo && (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <Users size={24} />
            </div>
          )}
          
          {/* Manually-managed video container */}
          <div
            ref={participantVideoRef}
            className="w-full h-full"
            style={{ display: hasParticipantVideo ? 'block' : 'none' }}
          />
          
          {participantJoined && hasParticipantVideo && (
            <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded z-10">
              ●
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoFeedsSidebar;
