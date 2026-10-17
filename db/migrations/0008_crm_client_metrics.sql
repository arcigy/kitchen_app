-- CRM client metrics (docs/CRM_CLIENT_METRICS.md): offer events, AI usage, PDF intake outcomes
-- and the daily Odoo export outbox. Expand-only: new tables, a nullable column and indexes.
-- The one relaxation drops the cascading foreign key of arcigy_project_activity_events, which no
-- release has written to yet, so business events outlive hard-deleted projects.

DO $$
DECLARE
  foreign_key_name text;
BEGIN
  FOR foreign_key_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'arcigy_project_activity_events'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE arcigy_project_activity_events DROP CONSTRAINT %I', foreign_key_name);
  END LOOP;
END $$;

ALTER TABLE arcigy_project_activity_events ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS arcigy_project_activity_events_idempotency_idx
  ON arcigy_project_activity_events (client_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS arcigy_project_activity_events_type_time_idx
  ON arcigy_project_activity_events (client_id, event_type, created_at);

CREATE TABLE IF NOT EXISTS arcigy_ai_usage_events (
  client_id text NOT NULL,
  usage_id text NOT NULL,
  project_id text,
  user_id text,
  feature text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens integer NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd numeric(12, 6) NOT NULL CHECK (cost_usd >= 0),
  cost_basis text NOT NULL CHECK (cost_basis IN ('provider', 'price_table', 'unpriced')),
  price_table_version text,
  provider_request_id text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, usage_id)
);

CREATE INDEX IF NOT EXISTS arcigy_ai_usage_events_time_idx
  ON arcigy_ai_usage_events (client_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS arcigy_ai_usage_events_provider_request_idx
  ON arcigy_ai_usage_events (provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS arcigy_pdf_proposal_outcomes (
  client_id text NOT NULL,
  project_id text NOT NULL,
  document_sha256 text NOT NULL,
  item_id text NOT NULL,
  item_kind text NOT NULL,
  proposed_by text NOT NULL CHECK (proposed_by IN ('ai', 'rule', 'user')),
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'corrected', 'rejected', 'added_by_user')),
  changed_fields integer NOT NULL DEFAULT 0 CHECK (changed_fields >= 0),
  decided_by_user_id text,
  decided_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, project_id, document_sha256, item_id)
);

CREATE INDEX IF NOT EXISTS arcigy_pdf_proposal_outcomes_time_idx
  ON arcigy_pdf_proposal_outcomes (client_id, decided_at);

CREATE TABLE IF NOT EXISTS arcigy_crm_export_batches (
  batch_id text PRIMARY KEY,
  schema_version integer NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS arcigy_crm_export_batches_state_idx
  ON arcigy_crm_export_batches (state, created_at);
