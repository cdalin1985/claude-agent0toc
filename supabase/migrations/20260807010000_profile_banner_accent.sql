-- Profile banner image + accent color customization.
--
-- Adds:
--   - players.banner_url   TEXT  — wide image URL for the profile hero
--   - players.accent_color TEXT  — hex accent color the player picks
-- Both nullable and backward-compatible: existing rows have NULLs and the app
-- treats NULL as "no banner / default accent".
--
-- A new `banners` storage bucket is created mirroring `avatars`
-- (007_player_avatars.sql): public read, authenticated owner writes to
-- {profile_id}/banner.{ext}, jpeg/png/webp, 5 MB cap. The same per-profile
-- folder convention lets the existing `players can update own player record`
-- RLS policy govern who can set the banner_url column on the players table.
--
-- The accent_color CHECK constraint limits it to the TOC preset palette so a
-- malicious or typo'd value cannot inject CSS into the UI.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS banner_url   TEXT,
  ADD COLUMN IF NOT EXISTS accent_color TEXT
    CHECK (accent_color IS NULL OR accent_color = ANY (ARRAY[
      '#C62828', '#E53935', '#D4AF37', '#22C55E',
      '#3B82F6', '#A855F7', '#F59E0B', '#06B6D4'
    ]));

-- Create banners storage bucket (public, 5MB limit, image only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('banners', 'banners', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the banners bucket (mirror the avatars policies).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Banners are publicly accessible' AND schemaname = 'storage') THEN
    CREATE POLICY "Banners are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'banners');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can upload their own banner' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can upload their own banner" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own banner' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can update their own banner" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own banner' AND schemaname = 'storage') THEN
    CREATE POLICY "Users can delete their own banner" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;