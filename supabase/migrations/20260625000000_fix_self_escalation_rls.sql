-- Security fix: profiles.role and players.is_active/profile_id could be
-- self-modified by any authenticated user because the existing UPDATE
-- policies only checked row ownership, not which columns changed.

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Players can update own player record" ON players;
CREATE POLICY "Players can update own player record" ON players FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (
    profile_id = auth.uid()
    AND is_active = (SELECT is_active FROM players WHERE profile_id = auth.uid())
  );

-- TOC canon: minimum race length is 6. The original schema constraint
-- allowed 5, relying only on application-layer checks in create-challenge.
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_race_length_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_race_length_check
  CHECK (race_length >= 6 AND race_length <= 15);
