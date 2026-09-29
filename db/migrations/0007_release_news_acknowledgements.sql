CREATE TABLE IF NOT EXISTS arcigy_release_news_acknowledgements (
  client_id text NOT NULL,
  user_id text NOT NULL,
  notice_id text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, user_id, notice_id)
);

CREATE INDEX IF NOT EXISTS arcigy_release_news_acknowledgements_user_idx
  ON arcigy_release_news_acknowledgements (client_id, user_id, acknowledged_at DESC);
