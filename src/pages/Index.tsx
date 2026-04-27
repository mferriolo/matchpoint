
import React from 'react';
import { useLocation } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileHome from '@/components/mobile/MobileHome';
import MobileShell from '@/components/mobile/MobileShell';

/**
 * Mobile users see the simplified MobileHome on the home view; for any
 * other view (jobs / candidates / live calls) we still render AppLayout
 * but wrap it in MobileShell so the bottom nav and top bar are present.
 * Desktop users continue to get AppLayout unchanged.
 */
const Index: React.FC = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const initialView = (location.state as { initialView?: string } | null)?.initialView;
  const isHome = !initialView || initialView === 'home';

  if (isMobile) {
    return (
      <AppProvider>
        {isHome ? (
          <MobileHome />
        ) : (
          <MobileShell title={titleFor(initialView)}>
            <div className="min-h-full">
              <AppLayout />
            </div>
          </MobileShell>
        )}
      </AppProvider>
    );
  }

  return (
    <AppProvider>
      <AppLayout />
    </AppProvider>
  );
};

function titleFor(view: string | undefined): string {
  switch (view) {
    case 'dashboard':         return 'Jobs';
    case 'candidates':        return 'Candidates';
    case 'live-call':
    case 'live-call-landing': return 'Live Calls';
    case 'call-summary':      return 'Call Summary';
    default:                  return 'MatchPoint';
  }
}

export default Index;
