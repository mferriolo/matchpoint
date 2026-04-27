import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import MobileShell from './MobileShell';

interface MobileRouteProps {
  /** Title shown in the mobile top bar. */
  title?: string;
  /** Hide the bottom nav (e.g. for an active call screen). */
  hideBottomNav?: boolean;
  /** The actual page content. Rendered as-is on desktop. */
  children: React.ReactNode;
}

/**
 * Wraps a route's content in MobileShell on mobile, returns the children
 * unchanged on desktop. Lets stand-alone pages (Resume Parser, Live
 * Calls, Call Summary, Join Call, Presentations) reuse the same top bar
 * + bottom nav as the in-app screens without each page having to know
 * about the mobile layout.
 *
 * Adds an `overflow-x-hidden` wrapper so a desktop-laid-out page that
 * happens to be wider than 375px doesn't trigger horizontal scroll on a
 * phone — the page still renders, the user can pinch-zoom if needed,
 * but the bottom nav stays anchored.
 */
const MobileRoute: React.FC<MobileRouteProps> = ({ title, hideBottomNav, children }) => {
  const isMobile = useIsMobile();
  if (!isMobile) return <>{children}</>;
  return (
    <MobileShell title={title} hideBottomNav={hideBottomNav}>
      <div className="w-full overflow-x-hidden">{children}</div>
    </MobileShell>
  );
};

export default MobileRoute;
