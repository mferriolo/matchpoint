import React, { useState, useEffect } from 'react';
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
import { useNavigate, useLocation } from 'react-router-dom';


import { Job } from '@/types/callprompt';

type ViewType = 'home' | 'dashboard' | 'candidates' | 'job-details' | 'live-call' | 'live-call-landing' | 'call-summary' | 'presentations';


const AppLayoutContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Pages that render the sidebar from outside AppLayout (e.g.
  // PresentationsWithSidebar, LiveCalls page) navigate to "/" with
  // `state: { initialView: <view> }` so AppLayout knows which view to
  // show on mount instead of always falling back to 'home'. See
  // src/lib/sidebarNavigation.ts.
  const initialView: ViewType =
    (location.state as { initialView?: ViewType } | null)?.initialView || 'home';
  const [currentView, setCurrentViewState] = useState<ViewType>(initialView);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const { startCall, endCall, currentCall } = useCallPrompt();

  // If the user navigates back to "/" from another page WHILE this
  // component instance is already mounted, react-router won't re-run the
  // initial useState; sync via effect so the new state.initialView still
  // takes effect.
  useEffect(() => {
    const requested = (location.state as { initialView?: ViewType } | null)?.initialView;
    if (requested && requested !== currentView) {
      setCurrentViewState(requested);
    }
    // We deliberately depend on location.state, not currentView, so that
    // user-initiated in-app view changes don't get clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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