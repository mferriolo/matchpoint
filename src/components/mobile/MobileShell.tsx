import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, Users, Megaphone, Phone, Menu, X, FileText, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

// Bottom-nav routes shown on mobile. The "/" route hosts AppLayout, which
// uses internal view state for Home / Jobs / Candidates / Live Calls — we
// pass an `initialView` via location.state so AppLayout boots into the
// right view without a full reload.
type TabKey = 'home' | 'dashboard' | 'candidates' | 'marketing' | 'live';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; path: string; initialView?: string }[] = [
  { key: 'home',       label: 'Home',     icon: Home,      path: '/',          initialView: 'home' },
  { key: 'dashboard',  label: 'Jobs',     icon: Briefcase, path: '/',          initialView: 'dashboard' },
  { key: 'candidates', label: 'People',   icon: Users,     path: '/',          initialView: 'candidates' },
  { key: 'marketing',  label: 'Marketing', icon: Megaphone, path: '/marketing' },
  { key: 'live',       label: 'Calls',    icon: Phone,     path: '/',          initialView: 'live-call-landing' },
];

/**
 * Pick the active tab from the current route + AppLayout view state.
 * Falls back to 'home' if no match (e.g. a deep page like /presentations).
 */
function activeTabFromLocation(pathname: string, viewState: string | undefined): TabKey {
  if (pathname.startsWith('/marketing')) return 'marketing';
  if (viewState === 'dashboard') return 'dashboard';
  if (viewState === 'candidates') return 'candidates';
  if (viewState === 'live-call' || viewState === 'live-call-landing') return 'live';
  return 'home';
}

interface MobileShellProps {
  /** Page title shown in the top bar. */
  title?: string;
  /** Optional right-side action in the top bar (e.g. settings, refresh). */
  topRight?: React.ReactNode;
  /** Page content rendered between top bar and bottom nav. */
  children: React.ReactNode;
  /** Hide the bottom nav (e.g. for an active call screen). */
  hideBottomNav?: boolean;
}

export const MobileShell: React.FC<MobileShellProps> = ({ title, topRight, children, hideBottomNav }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const viewState = (location.state as { initialView?: string } | null)?.initialView;
  const active = activeTabFromLocation(location.pathname, viewState);

  const go = (tab: typeof TABS[number]) => {
    if (tab.path === '/' && tab.initialView) {
      navigate(tab.path, { state: { initialView: tab.initialView } });
    } else {
      navigate(tab.path);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 h-14 bg-[#911406] text-white shadow-sm flex-shrink-0">
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 -ml-2 rounded hover:bg-white/10 active:bg-white/20"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold truncate">{title || 'MatchPoint'}</h1>
        <div className="min-w-[2rem] flex justify-end">{topRight}</div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </main>

      {/* Bottom nav */}
      {!hideBottomNav && (
        <nav
          className="flex-shrink-0 grid grid-cols-5 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]"
          aria-label="Primary"
        >
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = active === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => go(tab)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-[#911406]' : 'text-gray-500 active:text-gray-700'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Slide-out menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 bg-[#911406] text-white">
              <span className="font-semibold">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="p-2 -mr-2 rounded hover:bg-white/10" aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              <MenuLink icon={FileText} label="Resume Parser" onClick={() => { setMenuOpen(false); navigate('/resume-parser'); }} />
              <MenuLink icon={FileText} label="Presentations" onClick={() => { setMenuOpen(false); navigate('/presentations'); }} />
              <MenuLink icon={Settings} label="Administration" onClick={() => { setMenuOpen(false); window.location.href = '/admin'; }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MenuLink: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }> = ({ icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100"
  >
    <Icon className="w-5 h-5 text-[#911406]" />
    <span>{label}</span>
  </button>
);

export default MobileShell;
