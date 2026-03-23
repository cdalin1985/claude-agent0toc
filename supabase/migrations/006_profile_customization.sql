-- ============================================================
-- TOC App — Migration 006: Player Profile Customization
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS preferred_discipline TEXT
  CHECK (preferred_discipline IN ('8 Ball', '9 Ball', '10 Ball'));

-- Allow players to update their own bio and preferred discipline
CREATE POLICY "Players can update own player record"
  ON players FOR UPDATE
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
