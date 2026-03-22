-- Push notification subscriptions
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid REFERENCES players(id) ON DELETE CASCADE NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players can manage their own push subscription"
  ON push_subscriptions FOR ALL
  USING (player_id IN (SELECT id FROM players WHERE profile_id = auth.uid()));
