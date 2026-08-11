-- Make the treasury actually visible, which is what the league was promised.
--
-- README: "The treasury ledger is visible to every member under Treasury --
-- full transparency, always." AGENTS.md canon: "Treasury visible to all
-- players." RulesPage tells players the same thing.
--
-- In production it was visible to nobody. treasury_ledger's only read policy is
-- "Admins can view treasury", and the two views the app actually reads --
-- treasury_summary and treasury_ledger_effects -- had NO grants to anon or
-- authenticated at all. Every client read returned 401, so the Treasury page
-- was broken for ordinary members AND for admins, since admins connect as the
-- same `authenticated` role.
--
-- The design was already right and one step short: both views are
-- security_invoker=false (the Postgres default), so they run as their owner and
-- see through the admin-only RLS on the underlying table. Granting SELECT on
-- the VIEW therefore opens exactly the aggregate the league is meant to see
-- while leaving treasury_ledger itself locked down -- writes stay super_admin
-- only, and nobody gains direct access to the table.
--
-- Granted to authenticated only, not anon: the app is members-only, and the
-- league's finances have no business being readable by the open internet.

-- Revoke first, then grant exactly what is intended. Default privileges differ
-- between a Supabase project and a database built from these files, so relying
-- on the default is how you get an outcome nobody chose -- the same shape of
-- mistake as a GRANT that leaves PUBLIC's EXECUTE in place. Being explicit
-- makes the result identical everywhere.
REVOKE ALL ON public.treasury_summary        FROM anon, authenticated;
REVOKE ALL ON public.treasury_ledger_effects FROM anon, authenticated;

GRANT SELECT ON public.treasury_summary        TO authenticated;
GRANT SELECT ON public.treasury_ledger_effects TO authenticated;

COMMENT ON VIEW public.treasury_summary IS
  'Per-player treasury balance. Readable by any logged-in member: the view is security_invoker=false so it sees past the admin-only RLS on treasury_ledger, which is how "visible to every member" is delivered without granting access to the table itself.';

COMMENT ON VIEW public.treasury_ledger_effects IS
  'Full treasury ledger as members see it. Readable by any logged-in member for the same reason as treasury_summary; treasury_ledger itself stays admin-read and super_admin-write.';
