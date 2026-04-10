import type { NavigateFunction } from 'react-router-dom';

// Centralised routing for the sidebar (Navigation.tsx) so every page that
// renders the sidebar dispatches clicks to the same destinations.
//
// AppLayout (rendered at "/") owns the views Home, Candidates, Jobs and
// Live Calls Landing as internal-state transitions, so for those we
// navigate to "/" and pass the desired view through react-router state.
// AppLayout reads `location.state.initialView` on mount and uses it as
// the initial currentView.
//
// Presentations lives at its own route ("/presentations") and is reached
// via direct navigation.
//
// If a sidebar item is clicked while the user is already on the matching
// page, the helper is a no-op (no needless re-navigation / state churn).

export type SidebarViewId =
  | 'home'
  | 'candidates'
  | 'dashboard'         // "Jobs" — JobsDashboard
  | 'live-call-landing' // "Live Calls"
  | 'presentations';

export const navigateToSidebarView = (
  navigate: NavigateFunction,
  view: SidebarViewId,
  currentPathname: string,
): void => {
  if (view === 'presentations') {
    if (currentPathname === '/presentations') return;
    navigate('/presentations');
    return;
  }
  // All other sidebar views are owned by AppLayout at "/".
  // Pass the requested view through router state so AppLayout can pick it
  // up as its initial currentView. Always navigate even if pathname is
  // already "/" so the in-app state machine receives the new view.
  navigate('/', { state: { initialView: view } });
};
