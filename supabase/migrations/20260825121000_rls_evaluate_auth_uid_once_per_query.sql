-- Stop re-running auth.uid() once per row, and stop evaluating two SELECT
-- policies on `players` when one of them already returns true for everybody.
--
-- Both are things Supabase's own database linter flags (auth_rls_initplan and
-- multiple_permissive_policies), and both are pure overhead: not one row's
-- visibility changes here. The policies below are the live definitions
-- character for character, with `auth.uid()` wrapped as `(SELECT auth.uid())`.
--
-- Why the wrapper matters. A bare auth.uid() in a policy is a volatile-looking
-- call in a per-row filter, so Postgres runs it for every row it tests. Wrapped
-- in a scalar subquery it becomes an InitPlan: evaluated once, then reused. On
-- a 66-row ladder the difference does not show up in a log. It shows up when
-- the row count and the request rate both go up, which is the same event.
--
-- `notifications` already had the wrapped form and is left alone -- it is the
-- example the rest of these are being brought in line with.
--
-- NOT CHANGED, deliberately, and worth knowing about:
--
--   "Admins can manage players" tests profiles.role = 'admin' only, while
--   "Admins can view treasury" tests role IN ('admin', 'super_admin'). So a
--   super_admin has strictly less direct access to `players` than an admin
--   does. In practice nothing depends on it -- every player mutation goes
--   through an edge function on the service role, which bypasses RLS entirely
--   -- which is why it has never surfaced. Widening it would be a decision
--   about who may administer the roster, not a performance fix, so it stays as
--   it is and is written down here instead.

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- --------------------------------------------------------------------------
-- players
-- --------------------------------------------------------------------------
--
-- The UPDATE policy still says only "this row is yours". Pinning is_active
-- against self-reactivation is the guard_player_active trigger's job, not this
-- policy's -- 20260625030000 moved it there because the self-referential
-- subquery this policy used to carry recursed. Unchanged here.

DROP POLICY IF EXISTS "Players can update own player record" ON players;
CREATE POLICY "Players can update own player record" ON players FOR UPDATE
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

-- "Admins can manage players" was FOR ALL, so it also ran on SELECT -- next to
-- "Anyone can view players", which is USING (true). Two permissive SELECT
-- policies where one is unconditionally true means the admin subquery was
-- executed for every row of every ladder read, by every member, to decide
-- something already decided. Splitting FOR ALL into the three write commands
-- keeps admin write access exactly as it was and takes it off the read path.
--
-- FOR ALL with a USING clause and no WITH CHECK applies that USING expression
-- as the check for writes too, so INSERT gets it as WITH CHECK and UPDATE gets
-- it as both. That is what is reproduced below.
DROP POLICY IF EXISTS "Admins can manage players" ON players;

-- The three below are dropped by their own names too, not just the old one.
-- Without this the migration applies cleanly to production and then fails on
-- the second pass of the replay check, because after the first pass there is no
-- "Admins can manage players" left to drop and the CREATEs collide.
DROP POLICY IF EXISTS "Admins can insert players" ON players;
DROP POLICY IF EXISTS "Admins can update players" ON players;
DROP POLICY IF EXISTS "Admins can delete players" ON players;

CREATE POLICY "Admins can insert players" ON players FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can update players" ON players FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can delete players" ON players FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
  ));

-- --------------------------------------------------------------------------
-- player_preferences
-- --------------------------------------------------------------------------

DROP POLICY IF EXISTS "Players can update own preferences" ON player_preferences;
CREATE POLICY "Players can update own preferences" ON player_preferences FOR UPDATE
  USING (player_id IN (
    SELECT players.id FROM players WHERE players.profile_id = (SELECT auth.uid())
  ))
  WITH CHECK (player_id IN (
    SELECT players.id FROM players WHERE players.profile_id = (SELECT auth.uid())
  ));

-- --------------------------------------------------------------------------
-- player_discipline_stats / player_venue_stats
-- --------------------------------------------------------------------------
--
-- "public unless the owner opted out, and always visible to the owner". The
-- owner half is the auth.uid() call, and it was running per row on a table that
-- carries a row per player per discipline -- so it scaled with the roster twice
-- over.

DROP POLICY IF EXISTS "Discipline stats follow the player's visibility choice" ON player_discipline_stats;
CREATE POLICY "Discipline stats follow the player's visibility choice" ON player_discipline_stats FOR SELECT
  USING (
    COALESCE(
      (SELECT pp.show_stats_publicly FROM player_preferences pp
        WHERE pp.player_id = player_discipline_stats.player_id),
      true
    )
    OR EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_discipline_stats.player_id
        AND p.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Venue stats follow the player's visibility choice" ON player_venue_stats;
CREATE POLICY "Venue stats follow the player's visibility choice" ON player_venue_stats FOR SELECT
  USING (
    COALESCE(
      (SELECT pp.show_stats_publicly FROM player_preferences pp
        WHERE pp.player_id = player_venue_stats.player_id),
      true
    )
    OR EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_venue_stats.player_id
        AND p.profile_id = (SELECT auth.uid())
    )
  );

-- --------------------------------------------------------------------------
-- treasury_ledger
-- --------------------------------------------------------------------------
--
-- Both admin roles, as it already was. Only the evaluation changes.

DROP POLICY IF EXISTS "Admins can view treasury" ON treasury_ledger;
CREATE POLICY "Admins can view treasury" ON treasury_ledger FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = ANY (ARRAY['admin', 'super_admin'])
  ));
