import React, { useState } from 'react';
import { CallPromptProvider, useCallPrompt } from '@/contexts/CallPromptContext';
import Navigation from './Navigation';
import HomePage from './HomePage';
import JobsDashboard from './JobsDashboard';
import JobDetails from './JobDetails';
import LiveCall from './LiveCall';
import CallSummary from './CallSummary';
import CandidateDashboard from './candidates/CandidateDashboard';
import { LiveCallsLanding } from './LiveCallsLanding';
import { BugButton } from './BugButton';
import { useNavigate } from 'react-router-dom';


import { Job } from '@/types/callprompt';

type ViewType = 'home' | 'dashboard' | 'candidates' | 'job-details' | 'live-call' | 'live-call-landing' | 'call-summary' | 'presentations';


const AppLayoutContent: React.FC = () => {
  const navigate = useNavigate();
  const [currentView, setCurrentViewState] = useState<ViewType>('home');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const { startCall, endCall, currentCall } = useCallPrompt();

  // Intercept the 'presentations' view so we use React Router navigation
  // (client-side, no full reload) instead of window.location.href, which 404s
  // on Vercel without an SPA rewrite. All other views remain in-component state.
  const setCurrentView = (view: ViewType) => {
    if (view === 'presentations') {
      navigate('/presentations');
      return;
    }
    setCurrentViewState(view);
  };

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);
    setCurrentView('job-details');
  };

  const handleStartCall = () => {
    // Navigation handled by JobDetails component
    setCurrentView('live-call');
  };

  const handleEndCall = () => {
    endCall();
    setCurrentView('call-summary');
  };

  const handleModuleSelect = (module: 'candidates' | 'jobs') => {
    if (module === 'candidates') {
      setCurrentView('candidates');
    } else {
      setCurrentView('dashboard');
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'home':
        return <HomePage 
          onSelectModule={handleModuleSelect} 
          onStartCall={() => setCurrentView('live-call')}
          onNavigateToLiveCalls={() => setCurrentView('live-call-landing')}
        />;

      case 'dashboard':
        // Pass onStartCall to JobsDashboard to handle navigation
        return <JobsDashboard onJobSelect={handleJobSelect} onStartCall={() => setCurrentView('live-call')} />;
      case 'candidates':
        return <CandidateDashboard onStartCall={() => setCurrentView('live-call')} />;

      case 'job-details':
        return selectedJob ? (
          <JobDetails 
            job={selectedJob} 
            onBack={() => setCurrentView('dashboard')}
            onStartCall={handleStartCall}
          />
        ) : null;
      case 'live-call-landing':
        return <LiveCallsLanding onStartCall={() => {
          setCurrentView('live-call');
        }} />;

      case 'live-call':
        return <LiveCall onEndCall={handleEndCall} />;
      case 'call-summary':
        return <CallSummary />;
      // 'presentations' is handled by the setCurrentView wrapper above
      // (it calls navigate('/presentations') instead of setting state),
      // so this case is unreachable and intentionally omitted.

      default:
        return <HomePage 
          onSelectModule={handleModuleSelect}
          onStartCall={() => setCurrentView('live-call')}
        />;

    }
  };


  return (
    <div className="flex h-screen bg-gray-100">
      {currentView !== 'home' && (
        <Navigation 
          currentView={currentView} 
          onViewChange={setCurrentView}
          showVideoInSidebar={currentView === 'live-call' && currentCall?.callMethod === 'zoom'}
        />
      )}
      <div className="flex-1 overflow-auto">
        {renderCurrentView()}
      </div>
      <BugButton />
    </div>
  );

};

const AppLayout: React.FC = () => {
  return (
    <CallPromptProvider>
      <AppLayoutContent />
    </CallPromptProvider>
  );
};

export default AppLayout;