/*
 * A harness for measuring the navigation chrome that only renders behind
 * authentication.
 *
 * BottomNav, TopHeader, SideMenu and the FAB are the controls a member touches
 * most, on a phone, one-handed, standing at a pool table. They are also the
 * ones that could not be measured: they never appear on the sign-in screen, and
 * jsdom has no layout engine, so getBoundingClientRect there returns zeros.
 *
 * So they are mounted here in a real browser, at a real viewport, with no
 * session required. MemoryRouter supplies the routing context they read; the
 * zustand stores return their defaults, which is all these components need to
 * lay out.
 *
 * This is a dev-only page. It is not an entry point in vite.config, is not
 * reachable from the app, and ships nothing: `npm run build` never sees it.
 * Open it with `npm run dev` and go to /dev/tap-audit.html.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import '../src/index.css';

import { BottomNav } from '../src/components/BottomNav';
import { TopHeader } from '../src/components/TopHeader';
import { SideMenu } from '../src/components/SideMenu';
import { FloatingActionButton } from '../src/components/FloatingActionButton';

export function Harness() {
  return (
    <MemoryRouter initialEntries={['/']}>
      <MotionConfig reducedMotion="user">
        <div style={{ minHeight: '100vh', background: '#0D0D0D' }}>
          <TopHeader onMenuToggle={() => {}} isMenuOpen={false} />
          {/* Rendered open so its controls have real geometry to measure. */}
          <SideMenu isOpen onClose={() => {}} unreadCount={3} />
          <FloatingActionButton show />
          <BottomNav unreadCount={3} onMenuToggle={() => {}} />
        </div>
      </MotionConfig>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
