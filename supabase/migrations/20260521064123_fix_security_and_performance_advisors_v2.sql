-- Recovered from Supabase migration history (version 20260521064123).
-- Source: supabase_migrations.schema_migrations
-- Name: fix_security_and_performance_advisors_v2

-- 1. Fix Security Definer Views (ERRORs)
-- Replace SECURITY DEFINER with SECURITY INVOKER to enforce RLS of the querying user
DROP VIEW IF EXISTS public.treasury_summary;
DROP VIEW IF EXISTS public.treasury_ledger_effects;

CREATE VIEW public.treasury_ledger_effects AS
SELECT * FROM public.treasury_ledger;

CREATE VIEW public.treasury_summary AS
SELECT
    player_id,
    SUM(CASE WHEN entry_type IN ('credit', 'reversal') THEN amount_cents ELSE -amount_cents END) as balance_cents
FROM public.treasury_ledger
GROUP BY player_id;

-- 2. Fix Overly Permissive RLS Policy on profiles
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
CREATE POLICY "Service role can insert profiles" ON public.profiles
FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- 3. Fix Public Bucket Listing
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Avatars are publicly accessible' AND tablename = 'objects' AND schemaname = 'storage') THEN
        DROP POLICY "Avatars are publicly accessible" ON storage.objects;
        CREATE POLICY "Avatars are publicly accessible" ON storage.objects
        FOR SELECT USING (bucket_id = 'avatars');
    END IF;
END $$;

-- 4. Fix GraphQL Exposure
REVOKE SELECT ON public.audit_events FROM anon, authenticated;
REVOKE SELECT ON public.treasury_ledger FROM anon, authenticated;

-- 5. Fix Performance: Unindexed Foreign Keys
CREATE INDEX IF NOT EXISTS idx_activity_feed_actor_player_id ON public.activity_feed(actor_player_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_profile_id ON public.audit_events(actor_profile_id);
CREATE INDEX IF NOT EXISTS idx_matches_player1_id ON public.matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_matches_player2_id ON public.matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON public.matches(winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_loser_id ON public.matches(loser_id);
CREATE INDEX IF NOT EXISTS idx_treasury_ledger_player_id ON public.treasury_ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_treasury_ledger_created_by ON public.treasury_ledger(created_by);

-- 6. Fix Performance: Auth RLS Initialization Plan
-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id) WITH CHECK ( (SELECT auth.uid()) = id );

-- players
DROP POLICY IF EXISTS "Admins can manage players" ON public.players;
CREATE POLICY "Admins can manage players" ON public.players
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  )
);

-- notifications
DROP POLICY IF EXISTS "Users see own notifications" ON public.notifications;
CREATE POLICY "Users see own notifications" ON public.notifications
FOR SELECT USING (player_id IN (SELECT id FROM public.players WHERE profile_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can mark own notifications read" ON public.notifications
FOR UPDATE USING (player_id IN (SELECT id FROM public.players WHERE profile_id = (SELECT auth.uid())));
