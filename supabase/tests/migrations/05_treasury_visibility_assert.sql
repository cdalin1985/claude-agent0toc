-- The treasury is a promise, not just a feature.
--
-- README: "visible to every member ... full transparency, always." AGENTS.md
-- canon says the same. In production it was visible to NOBODY: the views the
-- app reads had no grants at all, so every read 401'd for ordinary members and
-- for admins alike, while the UI kept telling players they could see it.
--
-- Nothing in the test suite noticed, because nothing asserted the promise. This
-- does.
--
-- Raises (psql exits non-zero) on any wrong answer. Prints
-- 'TREASURY VISIBILITY: ALL CHECKS PASSED' on success.

DO $$
DECLARE
  failures text[] := '{}';
BEGIN
  -- What the league was promised.
  IF NOT has_table_privilege('authenticated', 'public.treasury_summary', 'SELECT') THEN
    failures := array_append(failures, 'members cannot read treasury_summary');
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.treasury_ledger_effects', 'SELECT') THEN
    failures := array_append(failures, 'members cannot read treasury_ledger_effects');
  END IF;

  -- Transparency is for members, not the open internet.
  IF has_table_privilege('anon', 'public.treasury_summary', 'SELECT')
     OR has_table_privilege('anon', 'public.treasury_ledger_effects', 'SELECT') THEN
    failures := array_append(failures, 'the treasury is readable without logging in');
  END IF;

  -- The views work by seeing past the admin-only RLS on the table. If someone
  -- flips them to security_invoker they will silently return nothing for
  -- members -- the exact failure this file exists to catch, wearing a different
  -- hat.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('treasury_summary', 'treasury_ledger_effects')
       AND EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}')) o WHERE o = 'security_invoker=true')
  ) THEN
    failures := array_append(failures, 'a treasury view is security_invoker, so members will see nothing');
  END IF;

  -- Reading is open to members; writing is not.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'treasury_ledger' AND cmd = 'INSERT'
  ) THEN
    failures := array_append(failures, 'treasury_ledger has no INSERT policy restricting writes');
  END IF;

  IF array_length(failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION E'TREASURY VISIBILITY: % CHECK(S) FAILED\n  - %',
      array_length(failures, 1), array_to_string(failures, E'\n  - ');
  END IF;

  RAISE NOTICE 'TREASURY VISIBILITY: ALL CHECKS PASSED';
END $$;
