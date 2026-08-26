-- Who a name on the ladder actually belongs to.
--
-- claim-player has always asked exactly two questions: is this player
-- unclaimed, and have you already claimed somebody else. Neither is about you.
-- Any signed-in account could take any unclaimed name -- and a claimed profile
-- accepts challenges, declines them (a forfeit, which hands over a spot), and
-- submits results. With 66 names and a link posted to a public Facebook page,
-- the first person through the door could have been anyone.
--
-- Admins already invite members by email through add-player, which links
-- profile_id directly and is safe. This closes the other door: a self-service
-- claim now has to match an email an admin put on the roster.
--
-- WHY A SEPARATE TABLE, not a column on players.
--
-- players is world-readable ("Anyone can view players" USING (true)) and, more
-- to the point, ClaimPage reads it with select('*') -- so an email column there
-- would ship every member's address to the browser of anybody who signed in.
-- Settings, Layout and the Admin players list do the same. Putting the address
-- in its own admin-only table means no existing select('*') can leak it and no
-- future one can either, which is a property worth more than the join it costs.
--
-- These are contact details for real people, so: no public read path, no
-- exposure through players_public, and the column never travels to a member's
-- browser.

CREATE TABLE IF NOT EXISTS public.player_roster_emails (
  player_id   UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  added_by    UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT player_roster_emails_email_shape
    CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%.__%' AND length(email) <= 254)
);

-- One address, one member. Two roster rows sharing an email would make a claim
-- ambiguous, and the whole point is that it is not.
CREATE UNIQUE INDEX IF NOT EXISTS player_roster_emails_email_key
  ON public.player_roster_emails (email);

ALTER TABLE public.player_roster_emails ENABLE ROW LEVEL SECURITY;

-- Admins only, both kinds. No policy for anon or authenticated at all: with RLS
-- on and no permissive policy, a member's SELECT returns nothing rather than
-- being filtered -- which is the correct answer for somebody else's email
-- address. The edge functions read it on the service role, which bypasses RLS.
DROP POLICY IF EXISTS "Admins manage roster emails" ON public.player_roster_emails;
CREATE POLICY "Admins manage roster emails" ON public.player_roster_emails
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
     WHERE profiles.id = (SELECT auth.uid())
       AND profiles.role = ANY (ARRAY['admin', 'super_admin'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
     WHERE profiles.id = (SELECT auth.uid())
       AND profiles.role = ANY (ARRAY['admin', 'super_admin'])
  ));

-- Table-level grants as well as RLS. RLS filters rows for a role that can
-- already reach the table; withholding the grant means anon never reaches it.
REVOKE ALL ON public.player_roster_emails FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_roster_emails TO authenticated;
GRANT ALL ON public.player_roster_emails TO service_role;

COMMENT ON TABLE public.player_roster_emails IS
  'The sign-in address an admin expects for each player, used to gate '
  'self-service claims in claim-player. Admin-only by RLS and by grant: this '
  'is members'' personal contact information and must never reach a public '
  'read path or players_public.';

-- Keep updated_at honest; an admin correcting a typo should be visible as a
-- change, because "which address did we have on file" is the question somebody
-- asks when a claim is refused.
CREATE OR REPLACE FUNCTION public.touch_player_roster_email()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_player_roster_email_trigger ON public.player_roster_emails;
CREATE TRIGGER touch_player_roster_email_trigger
  BEFORE UPDATE ON public.player_roster_emails
  FOR EACH ROW EXECUTE FUNCTION public.touch_player_roster_email();
