-- ============================================================
-- TOC App - Migration 014: Visual Theme on League Settings
-- ============================================================
-- Recovered from production. The theme switcher feature shipped via PRs
-- around 2026-05-18 but the corresponding migration file was never
-- committed to the repo. Production already has this applied as Supabase
-- migration version 20260518112919 (add_visual_theme_to_league_settings),
-- so this file mirrors the exact statements applied there.
--
-- Fresh setups need this file or the AdminPage theme switcher will fail
-- with "column theme_name does not exist" on first load.

begin;

alter table public.league_settings
  add column if not exists theme_name text;

update public.league_settings
set theme_name = coalesce(theme_name, 'classic');

alter table public.league_settings
  alter column theme_name set default 'classic';

alter table public.league_settings
  alter column theme_name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'league_settings_theme_name_check'
  ) then
    alter table public.league_settings
      add constraint league_settings_theme_name_check
      check (theme_name in ('classic', 'neon-billiards'));
  end if;
end $$;

commit;
