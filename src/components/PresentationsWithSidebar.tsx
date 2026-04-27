import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';
import Presentations from '@/pages/Presentations';
import { navigateToSidebarView, type SidebarViewId } from '@/lib/sidebarNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import MobilePresentations from './mobile/MobilePresentations';

const PresentationsWithSidebar: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  // On mobile, MobilePresentations renders inside its own MobileShell
  // (with the bottom nav and top bar) — we skip the desktop sidebar
  // entirely. The MobileRoute wrapper at the route level is a no-op
  // here because MobilePresentations brings its own MobileShell.
  if (isMobile) {
    return <MobilePresentations />;
  }

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
