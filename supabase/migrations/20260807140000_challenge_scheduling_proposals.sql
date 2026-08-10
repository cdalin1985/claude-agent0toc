-- Let two players agree on where and when to play.
--
-- Accepting a challenge was a single irreversible step: the challenged player
-- picked BOTH the venue and the date/time and it was locked in. If that did not
-- suit the challenger their only recourse was to wash the whole challenge and
-- start over -- so in practice players arrange matches on Facebook instead,
-- which is what this app exists to replace. README: "Both players agree on the
-- time and venue."
--
-- Model: proposals are rows, not columns on challenges. A challenge can carry
-- many rounds of back-and-forth, every round needs its own author, timestamp and
-- outcome, and the product owner wants the negotiation logged publicly. Columns
-- would hold only the latest state and lose the history.
--
-- Challenge status reuses the existing vocabulary rather than widening the CHECK
-- constraint on a live table:
--   pending   -- issued, not yet answered
--   accepted  -- answered; the two are agreeing on when and where (NEW meaning;
--                the status was already permitted but nothing ever wrote it)
--   scheduled -- agreed, match row created
-- Every existing status filter in create-challenge and respond-to-challenge
-- already includes 'accepted', so nothing downstream has to change to keep
-- treating a negotiating challenge as active.

CREATE TABLE IF NOT EXISTS public.challenge_proposals (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id          UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  proposed_by_player_id UUID NOT NULL REFERENCES public.players(id),
  venue                 TEXT NOT NULL,
  scheduled_at          TIMESTAMPTZ NOT NULL,
  message               TEXT,
  -- pending    -- awaiting the other player
  -- accepted   -- agreed; the match was created from this row
  -- superseded -- the other player countered instead of accepting
  status                TEXT NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at          TIMESTAMPTZ
);

ALTER TABLE public.challenge_proposals
  DROP CONSTRAINT IF EXISTS challenge_proposals_status_check;
ALTER TABLE public.challenge_proposals
  ADD CONSTRAINT challenge_proposals_status_check
  CHECK (status IN ('pending', 'accepted', 'superseded'));

-- At most one live proposal per challenge. This is what makes "whose turn is
-- it" answerable: the pending proposal's author is waiting, the other player
-- owes a reply. Without it, both could propose at once and neither would know
-- which one accepting referred to.
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_proposals_one_pending
  ON public.challenge_proposals(challenge_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_challenge_proposals_challenge
  ON public.challenge_proposals(challenge_id, created_at DESC);

ALTER TABLE public.challenge_proposals ENABLE ROW LEVEL SECURITY;

-- Public to logged-in members, like every other league record. The product
-- owner wants scheduling visible to everyone, not just the two players.
DROP POLICY IF EXISTS "Anyone can view challenge proposals" ON public.challenge_proposals;
CREATE POLICY "Anyone can view challenge proposals"
  ON public.challenge_proposals FOR SELECT USING (true);

-- Writes go through the respond-to-challenge edge function only. No INSERT,
-- UPDATE or DELETE policy exists, so authenticated cannot write directly even
-- though it holds table privileges by default.
REVOKE INSERT, UPDATE, DELETE ON public.challenge_proposals FROM anon, authenticated;
GRANT SELECT ON public.challenge_proposals TO anon, authenticated;
GRANT ALL ON public.challenge_proposals TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
         AND tablename = 'challenge_proposals'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_proposals;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Negotiation must not become a way to keep a challenge alive forever
-- ---------------------------------------------------------------------------

-- expire_stale_challenges only ever expired 'pending'. Once a challenge moved
-- to 'accepted' it was outside every expiry path, so two players could trade
-- proposals indefinitely while both were blocked from any other challenge.
-- The response deadline now covers the negotiation too.
CREATE OR REPLACE FUNCTION public.expire_stale_challenges()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE challenges
    SET status     = 'expired',
        updated_at = NOW()
    WHERE status IN ('pending', 'accepted')
      AND expires_at <= NOW()
    RETURNING id
  ),
  closed_proposals AS (
    UPDATE public.challenge_proposals p
    SET status       = 'superseded',
        responded_at = NOW()
    FROM expired e
    WHERE p.challenge_id = e.id
      AND p.status = 'pending'
    RETURNING p.id
  )
  SELECT COUNT(*) INTO affected_count FROM expired;

  RETURN affected_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_stale_challenges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_stale_challenges() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_challenges() TO service_role;

COMMENT ON FUNCTION public.expire_stale_challenges() IS
  'Expires challenges past expires_at that are still pending OR still being scheduled, and closes any live proposal on them. Extended to cover ''accepted'' so trading counter-proposals cannot keep a challenge -- and both players'' challenge slots -- alive indefinitely. Idempotent. Returns rows affected.';

COMMENT ON TABLE public.challenge_proposals IS
  'One row per venue/time proposal in a challenge negotiation. At most one pending row per challenge (partial unique index); its author is the player waiting, and the other player owes an accept or a counter.';
