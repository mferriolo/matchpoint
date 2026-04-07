import React, { useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ZoomMeetingContainerProps {
  isInMeeting: boolean;
}

const ZoomMeetingContainer: React.FC<ZoomMeetingContainerProps> = ({ isInMeeting }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInMeeting && containerRef.current && window.ZoomMtg) {
      // Initialize the Zoom meeting container
      const container = containerRef.current;
      
      // Clear any existing content
      container.innerHTML = '';
      
      // Create the meeting container element that Zoom SDK expects
      const meetingDiv = document.createElement('div');
      meetingDiv.id = 'zmmtg-root';
      meetingDiv.style.width = '100%';
      meetingDiv.style.height = '500px';
      meetingDiv.style.minHeight = '400px';
      meetingDiv.style.position = 'relative';
      
      container.appendChild(meetingDiv);
      
      // Additional container for Zoom UI elements
      const uiDiv = document.createElement('div');
      uiDiv.id = 'aria-notify-area';
      uiDiv.style.position = 'absolute';
      uiDiv.style.top = '0';
      uiDiv.style.left = '0';
      uiDiv.style.width = '1px';
      uiDiv.style.height = '1px';
      uiDiv.style.overflow = 'hidden';
      uiDiv.setAttribute('aria-live', 'polite');
      uiDiv.setAttribute('aria-atomic', 'true');
      
      container.appendChild(uiDiv);
      
      console.log('Zoom meeting container initialized with proper DOM structure');
    }
  }, [isInMeeting]);

  useEffect(() => {
    // Cleanup function when component unmounts or meeting ends
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  if (!isInMeeting) {
    return (
      <Card className="w-full mt-4">
        <CardContent className="p-8 text-center text-gray-500">
          <div className="flex flex-col items-center space-y-2">
            <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p>Join a meeting to start video call</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full mt-4">
      <CardContent className="p-0">
        <div 
          ref={containerRef}
          className="w-full min-h-[400px] bg-gray-900 rounded-lg overflow-hidden relative"
          style={{ height: '500px' }}
        />
      </CardContent>
    </Card>
  );
};

export default ZoomMeetingContainer;