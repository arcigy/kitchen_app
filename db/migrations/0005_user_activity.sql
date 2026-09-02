CREATE TABLE IF NOT EXISTS arcigy_user_activity_trackers (
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tracker_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  state TEXT NOT NULL,
  local_date DATE NOT NULL,
  time_zone TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id, tracker_id),
  CONSTRAINT arcigy_user_activity_trackers_membership_fk
    FOREIGN KEY (client_id, user_id)
    REFERENCES arcigy_organization_memberships (organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT arcigy_user_activity_trackers_sequence_check CHECK (sequence >= 1),
  CONSTRAINT arcigy_user_activity_trackers_state_check CHECK (state IN ('active', 'hidden', 'idle'))
);

CREATE INDEX IF NOT EXISTS arcigy_user_activity_trackers_live_idx
  ON arcigy_user_activity_trackers (client_id, user_id, lease_expires_at DESC);

CREATE TABLE IF NOT EXISTS arcigy_user_activity_intervals (
  interval_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  activity_date DATE NOT NULL,
  time_zone TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  active_seconds BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT arcigy_user_activity_intervals_membership_fk
    FOREIGN KEY (client_id, user_id)
    REFERENCES arcigy_organization_memberships (organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT arcigy_user_activity_intervals_time_check CHECK (ended_at >= started_at),
  CONSTRAINT arcigy_user_activity_intervals_seconds_check CHECK (active_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS arcigy_user_activity_intervals_user_date_idx
  ON arcigy_user_activity_intervals (client_id, user_id, activity_date DESC, started_at DESC);

CREATE TABLE IF NOT EXISTS arcigy_user_activity_presence (
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL,
  active_interval_id TEXT,
  last_accounted_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  local_date DATE NOT NULL,
  time_zone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id),
  CONSTRAINT arcigy_user_activity_presence_membership_fk
    FOREIGN KEY (client_id, user_id)
    REFERENCES arcigy_organization_memberships (organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT arcigy_user_activity_presence_interval_fk
    FOREIGN KEY (active_interval_id)
    REFERENCES arcigy_user_activity_intervals (interval_id)
    ON DELETE SET NULL,
  CONSTRAINT arcigy_user_activity_presence_state_check CHECK (state IN ('active', 'idle', 'offline'))
);

CREATE TABLE IF NOT EXISTS arcigy_user_activity_daily (
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  activity_date DATE NOT NULL,
  time_zone TEXT NOT NULL,
  first_active_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  active_seconds BIGINT NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id, activity_date),
  CONSTRAINT arcigy_user_activity_daily_membership_fk
    FOREIGN KEY (client_id, user_id)
    REFERENCES arcigy_organization_memberships (organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT arcigy_user_activity_daily_seconds_check CHECK (active_seconds >= 0),
  CONSTRAINT arcigy_user_activity_daily_sessions_check CHECK (session_count >= 0)
);

CREATE INDEX IF NOT EXISTS arcigy_user_activity_daily_tenant_date_idx
  ON arcigy_user_activity_daily (client_id, activity_date DESC, user_id);

CREATE TABLE IF NOT EXISTS arcigy_user_activity_outbox (
  external_key TEXT PRIMARY KEY,
  item_kind TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_token TEXT,
  leased_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT arcigy_user_activity_outbox_membership_fk
    FOREIGN KEY (client_id, user_id)
    REFERENCES arcigy_organization_memberships (organization_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT arcigy_user_activity_outbox_kind_check CHECK (item_kind IN ('presence', 'daily', 'interval')),
  CONSTRAINT arcigy_user_activity_outbox_status_check CHECK (status IN ('pending', 'leased', 'sent')),
  CONSTRAINT arcigy_user_activity_outbox_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS arcigy_user_activity_outbox_due_idx
  ON arcigy_user_activity_outbox (available_at, created_at)
  WHERE status = 'pending';
