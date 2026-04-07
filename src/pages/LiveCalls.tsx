import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveCallsLanding } from '@/components/LiveCallsLanding';
import { AppProvider } from '@/contexts/AppContext';
import { CallPromptProvider } from '@/contexts/CallPromptContext';
import Navigation from '@/components/Navigation';

const LiveCalls: React.FC = () => {
  const navigate = useNavigate();

  const handleStartCall = () => {
    // Navigate to home which will handle the live call
    navigate('/');
  };

  return (
    <AppProvider>
      <CallPromptProvider>
        <div className="flex h-screen bg-gray-100">
          <Navigation 
            currentView={'live-call-landing' as any} 
            onViewChange={(view) => {
              // Handle navigation from sidebar
              if (view === 'home') navigate('/');
              else if (view === 'dashboard') navigate('/');
              else if (view === 'candidates') navigate('/');
              else if (view === 'live-call') navigate('/live-calls');
            }}
            showVideoInSidebar={false}
          />
          <div className="flex-1 overflow-auto bg-gray-50">
            <LiveCallsLanding onStartCall={handleStartCall} />
          </div>
        </div>
      </CallPromptProvider>
    </AppProvider>
  );
};

export default LiveCalls;
