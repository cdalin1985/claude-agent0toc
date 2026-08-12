import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithRetry } from './lib/lazyWithRetry';

// Lazy-loaded pages for code splitting
const LoginPage        = lazyWithRetry(() => import('./pages/LoginPage'));
const ClaimPage        = lazyWithRetry(() => import('./pages/ClaimPage'));
const HomePage         = lazyWithRetry(() => import('./pages/HomePage'));
const RankingsPage     = lazyWithRetry(() => import('./pages/RankingsPage'));
const PlayerPage       = lazyWithRetry(() => import('./pages/PlayerPage'));
const ChallengePage    = lazyWithRetry(() => import('./pages/ChallengePage'));
const ChallengesPage   = lazyWithRetry(() => import('./pages/ChallengesPage'));
const MatchPage        = lazyWithRetry(() => import('./pages/MatchPage'));
const MatchesPage      = lazyWithRetry(() => import('./pages/MatchesPage'));
const NotificationsPage= lazyWithRetry(() => import('./pages/NotificationsPage'));
const SettingsPage     = lazyWithRetry(() => import('./pages/SettingsPage'));
const AdminPage        = lazyWithRetry(() => import('./pages/AdminPage'));
const AuthCallbackPage = lazyWithRetry(() => import('./pages/AuthCallbackPage'));
const TreasuryPage     = lazyWithRetry(() => import('./pages/TreasuryPage'));
const ActivityPage     = lazyWithRetry(() => import('./pages/ActivityPage'));
const RulesPage        = lazyWithRetry(() => import('./pages/RulesPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});

// The fallback used to be an empty black div, so every route transition on slow
// wifi was featureless blackness with no way to tell loading from broken.
const RouteFallback: React.FC = () => (
  <div className="min-h-screen bg-[#0D0D0D] px-4 pt-6" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading…</span>
    <div className="skeleton h-8 w-2/5 rounded-lg mb-5" />
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-16 rounded-xl" />
      ))}
    </div>
  </div>
);

const Suspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <React.Suspense fallback={<RouteFallback />}>
    {children}
  </React.Suspense>
);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route element={<Layout />}>
              {/* Public */}
              <Route path="/login"         element={<Suspense><LoginPage /></Suspense>} />
              <Route path="/auth/callback" element={<Suspense><AuthCallbackPage /></Suspense>} />
              {/* Authenticated — unclaimed */}
              <Route path="/claim"         element={<Suspense><ClaimPage /></Suspense>} />
              {/* Authenticated — claimed */}
              <Route path="/"              element={<Suspense><HomePage /></Suspense>} />
              <Route path="/rankings"      element={<Suspense><RankingsPage /></Suspense>} />
              <Route path="/player/:id"    element={<Suspense><PlayerPage /></Suspense>} />
              <Route path="/challenge/:id" element={<Suspense><ChallengePage /></Suspense>} />
              <Route path="/challenges"    element={<Suspense><ChallengesPage /></Suspense>} />
              <Route path="/matches"       element={<Suspense><MatchesPage /></Suspense>} />
              <Route path="/match/:id"     element={<Suspense><MatchPage /></Suspense>} />
              <Route path="/notifications" element={<Suspense><NotificationsPage /></Suspense>} />
              <Route path="/settings"      element={<Suspense><SettingsPage /></Suspense>} />
              <Route path="/admin"         element={<Suspense><AdminPage /></Suspense>} />
              <Route path="/treasury"      element={<Suspense><TreasuryPage /></Suspense>} />
              <Route path="/activity"      element={<Suspense><ActivityPage /></Suspense>} />
              <Route path="/rules"         element={<Suspense><RulesPage /></Suspense>} />
              <Route path="*"              element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
