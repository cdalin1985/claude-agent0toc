-- Fix: 20260625000000_fix_self_escalation_rls.sql reintroduced a hardcoded
-- race_length <= 15 cap. TOC canon is min 6, no maximum (league_settings.max_race
-- is NULL by design per 20260517034450_workflow_connection_fixes.sql), so a
-- Race-to-16+ challenge would pass application validation but fail this
-- DB constraint with a 500 at insert.
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_race_length_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_race_length_check
  CHECK (race_length >= 6);
