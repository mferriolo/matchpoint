import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';
import Presentations from '@/pages/Presentations';
import { navigateToSidebarView, type SidebarViewId } from '@/lib/sidebarNavigation';

const PresentationsWithSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-100">
      <Navigation
        currentView="presentations"
        onViewChange={(view) => navigateToSidebarView(navigate, view as SidebarViewId, location.pathname)}
        showVideoInSidebar={false}
      />
      <div className="flex-1 overflow-auto">
        <Presentations />
      </div>
    </div>
  );
};

export default PresentationsWithSidebar;