import React, { useState } from 'react';
import Navigation from './Navigation';
import Presentations from '@/pages/Presentations';

const PresentationsWithSidebar: React.FC = () => {
  const [currentView, setCurrentView] = useState('presentations');

  return (
    <div className="flex h-screen bg-gray-100">
      <Navigation 
        currentView={currentView} 
        onViewChange={(view) => {
          if (view === 'home' || view === 'dashboard' || view === 'candidates' || view === 'live-call-landing') {
            window.location.href = '/';
          } else if (view === 'presentations') {
            // Already on presentations page
          }
        }}
        showVideoInSidebar={false}
      />
      <div className="flex-1 overflow-auto">
        <Presentations />
      </div>
    </div>
  );
};

export default PresentationsWithSidebar;