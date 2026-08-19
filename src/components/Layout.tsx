import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { AmbientBackground } from './AmbientBackground';
import { TopHeader } from './TopHeader';
import { SideMenu } from './SideMenu';
import { FloatingActionButton } from './FloatingActionButton';
import { BottomNav } from './BottomNav';
import { RouteAnnouncer } from './RouteAnnouncer';
import { LoadingScreen } from './LoadingScreen';
import { OfflineBanner } from './OfflineBanner';
import { PWAInstallBanner } from './PWAInstallBanner';
import { AdminThemeSwitcher } from './admin/AdminThemeSwitcher';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { routeForIdentity } from '../lib/routeForIdentity';

// Screens that show bottom nav
const NAV_ROUTES = ['/', '/rankings', '/matches', '/notifications', '/settings', '/challenges'];
const showsNav = (path: string) =>
  NAV_ROUTES.some((r) => (r === '/' ? path === '/' : path.startsWith(r)));

// Shown when we are signed in but could not find out who that is, and have no
// earlier answer to fall back on. The alternative this replaces was routing to
// the Claim screen, which told a claimed member to pick a name that was not
// there. Saying "we could not reach the league" is both true and actionable;
// "claim your profile" was neither.
const IdentityUnavailable: React.FC<{ onRetry: () => void; retrying: boolean }> = ({ onRetry, retrying }) => (
  <div className="min-h-[70svh] flex flex-col items-center justify-center px-6 text-center">
    <AlertCircle size={40} className="text-[#EF4444] mb-4" />
    <h1 className="font-[Bebas_Neue] text-3xl tracking-wide text-[#E8E2D6]">
      Couldn't load your profile
    </h1>
    <p className="text-[#A1A1AA] font-[Barlow] text-base mt-3 max-w-sm leading-relaxed">
      You're signed in — the app just couldn't reach the league to look you up.
      That's almost always a brief network problem, not anything wrong with your
      account. Your spot on the ladder is untouched.
    </p>
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#C62828] text-[#E8E2D6] font-[Barlow] font-semibold hover:bg-[#B71C1C] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <RefreshCw size={16} className={retrying ? 'animate-spin' : undefined} />
      {retrying ? 'Trying again…' : 'Try again'}
    </button>
    <button
      type="button"
      onClick={() => supabase.auth.signOut()}
      className="mt-4 text-[#9CA3AF] hover:text-[#E8E2D6] text-sm font-[Barlow] underline underline-offset-2 transition-colors"
    >
      Sign out
    </button>
  </div>
);

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    session, player, identityStatus, isLoading,
    setSession, setProfile, setPlayer, setIdentityStatus, setIsLoading, reset,
  } = useAuthStore();
  const { isOffline, setIsOffline } = useUIStore();
  const [appReady, setAppReady] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Bootstrap auth state
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('auth timeout')), 8000)
          ),
        ]);
        if (cancelled) return;
        setSession(session);
        if (session) {
          await fetchProfileAndPlayer(session.user.id).catch(() => setIdentityStatus('failed'));
        }
      } catch {
        // Network error or timeout — unblock the app and let route guards redirect
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setAppReady(true);
        }
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfileAndPlayer(session.user.id).catch(() => setIdentityStatus('failed'));
      } else {
        reset();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // This read decides who the app thinks you are, so it has to distinguish
  // "you have no player row" from "we could not find out".
  //
  // It previously used .single() and threw both answers away:
  //
  //   if (playerRes.data) setPlayer(playerRes.data as any);
  //
  // so one dropped request left `player` null, and the guard below read that as
  // "unclaimed" and redirected a member who had claimed their profile weeks ago
  // to the Claim screen. Their name is not on that list — they already took it —
  // so there was nothing to tap. The app had simply forgotten them, and the only
  // way out was a reload that happened to succeed.
  //
  // .maybeSingle() is what makes the distinction possible: it returns
  // { data: null, error: null } for no rows, and reserves `error` for actual
  // failures. players.profile_id is UNIQUE (20260321032528_toc_schema.sql:20),
  // so the multiple-rows case maybeSingle() errors on cannot arise here.
  const fetchProfileAndPlayer = async (userId: string) => {
    const [profileRes, playerRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('players').select('*').eq('profile_id', userId).maybeSingle(),
    ]);

    // Either failing means we do not know who this is. Both reads go to the same
    // database over the same connection, so in practice they fail together; and
    // continuing without `profile` would silently drop an admin's role and show
    // them a member's app, which is its own quiet lie.
    const failure = playerRes.error ?? profileRes.error;
    if (failure) {
      console.error(`[auth] identity read failed for ${userId}: ${failure.message}`);
      setIdentityStatus('failed');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setProfile((profileRes.data ?? null) as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlayer((playerRes.data ?? null) as any);
    setIdentityStatus('resolved');
  };

  const retryIdentity = async () => {
    if (!session || retrying) return;
    setRetrying(true);
    setIdentityStatus('unknown');
    await fetchProfileAndPlayer(session.user.id).catch(() => setIdentityStatus('failed'));
    setRetrying(false);
  };

  // Route guards. The decision itself lives in routeForIdentity so it can be
  // tested directly; this effect only applies it.
  useEffect(() => {
    if (isLoading) return;
    const destination = routeForIdentity({
      path: location.pathname,
      hasSession: !!session,
      hasPlayer: !!player,
      identityStatus,
    });
    if (destination) navigate(destination, { replace: true });
  }, [session, player, identityStatus, isLoading, location.pathname, navigate]);

  // Realtime subscriptions
  useEffect(() => {
    if (!session) return;
    const channel = supabase.channel('toc-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rankings' }, () => {
        queryClient.invalidateQueries({ queryKey: ['rankings'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'challenges' }, () => {
        queryClient.invalidateQueries({ queryKey: ['challenges'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        queryClient.invalidateQueries({ queryKey: ['matches'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed' }, () => {
        queryClient.invalidateQueries({ queryKey: ['activity-feed'] });
        queryClient.invalidateQueries({ queryKey: ['activity-feed-full'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, queryClient]);

  // Offline detection
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [setIsOffline]);

  // Unread notification count
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count', player?.id],
    queryFn: async () => {
      if (!player) return 0;
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', player.id)
        .eq('is_read', false);
      return count ?? 0;
    },
    enabled: !!player,
    refetchInterval: 30000,
  });

  // Only take over the screen when there is nothing to fall back on. If an
  // earlier read already told us who this is, a later failure changes nothing
  // about their identity — carrying on with what we have beats blocking them.
  const identityUnavailable = !!session && identityStatus === 'failed' && !player;

  const showNav = showsNav(location.pathname) && !!session && !!player;
  const showFAB = showNav && ['/', '/rankings', '/matches'].some((r) => location.pathname === r || location.pathname.startsWith(r));

  return (
    <div className="relative min-h-screen bg-[var(--toc-theme-bg,#0D0D0D)] overflow-hidden">
      {/*
        WCAG 2.4.1. The header, the menu button and the whole bottom nav sit
        ahead of the content in tab order, on every single route, so reaching
        the ladder by keyboard meant tabbing past all of it every time.

        Hidden until focused, which is the point: the first Tab on any page
        offers the shortcut, and it stays out of the way for everyone else.
        z-[100] because the sticky header would otherwise cover it, and a skip
        link you cannot see is no better than no skip link.
      */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-[#1A1A1A] focus:px-4 focus:py-2.5 focus:font-[Barlow] focus:text-sm focus:text-[#E8E2D6] focus:shadow-lg"
      >
        Skip to main content
      </a>

      <RouteAnnouncer />

      <LoadingScreen visible={!appReady} />
      <PWAInstallBanner />
      <AmbientBackground />
      <OfflineBanner show={isOffline} />

      {showNav && <TopHeader onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} isMenuOpen={isMenuOpen} />}
      {showNav && <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} unreadCount={unreadCount} />}

      {/* Main content area */}
      <main
        id="main-content"
        // Focusable only as a skip-link target: -1 keeps it out of the tab
        // order but lets focus actually land here, so the next Tab continues
        // inside the content instead of resuming at the top of the page.
        tabIndex={-1}
        className="relative z-10 focus:outline-none"
        style={{
          paddingBottom: showNav ? '80px' : 0,
          paddingTop: showNav ? '80px' : isOffline ? '36px' : 0,
          minHeight: '100svh',
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="min-h-full"
          >
            <AdminThemeSwitcher />
            {identityUnavailable
              ? <IdentityUnavailable onRetry={retryIdentity} retrying={retrying} />
              : <Outlet />}
          </motion.div>
        </AnimatePresence>
      </main>

      {showNav && <BottomNav unreadCount={unreadCount} onMenuToggle={() => setIsMenuOpen(!isMenuOpen)} />}
      <AnimatePresence>{showFAB && <FloatingActionButton show={showFAB} />}</AnimatePresence>
    </div>
  );
};
