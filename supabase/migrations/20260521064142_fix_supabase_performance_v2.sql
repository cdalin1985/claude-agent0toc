-- Recovered from Supabase migration history (version 20260521064142).
-- Source: supabase_migrations.schema_migrations
-- Name: fix_supabase_performance_v2

-- 1. More Unindexed Foreign Keys
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_activity_event_id ON public.challenge_forfeiture_events(activity_event_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_challenger_id ON public.challenge_forfeiture_events(challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_cooldown_id ON public.challenge_forfeiture_events(cooldown_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_forfeiting_player_id ON public.challenge_forfeiture_events(forfeiting_player_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_loser_id ON public.challenge_forfeiture_events(loser_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_reversed_by_profile_id ON public.challenge_forfeiture_events(reversed_by_profile_id);
CREATE INDEX IF NOT EXISTS idx_challenge_forfeiture_events_winner_id ON public.challenge_forfeiture_events(winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_player1_submitted_winner_id ON public.matches(player1_submitted_winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_submitted_winner_id ON public.matches(player2_submitted_winner_id);

-- 2. Optimize RLS Policies (Wrap auth.uid() in SELECT)
-- profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
CREATE POLICY "Service role can insert profiles" ON public.profiles
FOR INSERT WITH CHECK ((SELECT auth.role()) = 'service_role');

-- players
DROP POLICY IF EXISTS "Players can update own player record" ON public.players;
CREATE POLICY "Players can update own player record" ON public.players
FOR UPDATE USING (profile_id = (SELECT auth.uid()));

-- treasury_ledger
DROP POLICY IF EXISTS "Super admins can insert treasury entries" ON public.treasury_ledger;
CREATE POLICY "Super admins can insert treasury entries" ON public.treasury_ledger
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  )
);

-- league_settings
DROP POLICY IF EXISTS "Super admins can update settings" ON public.league_settings;
CREATE POLICY "Super admins can update settings" ON public.league_settings
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'super_admin'
  )
);

-- audit_events
DROP POLICY IF EXISTS "Admins can view audit events" ON public.audit_events;
CREATE POLICY "Admins can view audit events" ON public.audit_events
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- push_subscriptions
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions
FOR ALL USING (player_id IN (SELECT id FROM public.players WHERE profile_id = (SELECT auth.uid())));
