CREATE TABLE IF NOT EXISTS arcigy_supplier_sync_sessions (
  client_id text NOT NULL,
  session_id text NOT NULL,
  project_id text NOT NULL,
  user_id text NOT NULL,
  supplier_id text NOT NULL,
  status text NOT NULL,
  expires_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, session_id),
  FOREIGN KEY (client_id, project_id)
    REFERENCES arcigy_projects (client_id, project_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_supplier_sync_items (
  client_id text NOT NULL,
  session_id text NOT NULL,
  sync_item_id text NOT NULL,
  material_assignment_id text NOT NULL,
  status text NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, sync_item_id),
  FOREIGN KEY (client_id, session_id)
    REFERENCES arcigy_supplier_sync_sessions (client_id, session_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_supplier_product_candidates (
  client_id text NOT NULL,
  session_id text NOT NULL,
  sync_item_id text NOT NULL,
  candidate_id text NOT NULL,
  submission_id text NOT NULL,
  supplier_product_code text NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, candidate_id),
  UNIQUE (client_id, session_id, sync_item_id, submission_id),
  FOREIGN KEY (client_id, sync_item_id)
    REFERENCES arcigy_supplier_sync_items (client_id, sync_item_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_supplier_price_observations (
  client_id text NOT NULL,
  session_id text NOT NULL,
  sync_item_id text NOT NULL,
  candidate_id text NOT NULL,
  observation_id text NOT NULL,
  supplier_id text NOT NULL,
  supplier_product_code text NOT NULL,
  observed_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, observation_id),
  UNIQUE (client_id, candidate_id),
  FOREIGN KEY (client_id, candidate_id)
    REFERENCES arcigy_supplier_product_candidates (client_id, candidate_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_material_supplier_mappings (
  client_id text NOT NULL,
  mapping_key text NOT NULL,
  supplier_id text NOT NULL,
  supplier_product_code text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, mapping_key)
);

CREATE TABLE IF NOT EXISTS arcigy_supplier_bridge_tokens (
  client_id text NOT NULL,
  session_id text NOT NULL,
  token_id text NOT NULL,
  kind text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  data jsonb NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, token_id),
  FOREIGN KEY (client_id, session_id)
    REFERENCES arcigy_supplier_sync_sessions (client_id, session_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS arcigy_supplier_sessions_project_idx
  ON arcigy_supplier_sync_sessions (client_id, project_id, db_updated_at DESC);
CREATE INDEX IF NOT EXISTS arcigy_supplier_items_session_idx
  ON arcigy_supplier_sync_items (client_id, session_id, status);
CREATE INDEX IF NOT EXISTS arcigy_supplier_candidates_item_idx
  ON arcigy_supplier_product_candidates (client_id, sync_item_id, db_created_at DESC);
CREATE INDEX IF NOT EXISTS arcigy_supplier_prices_code_idx
  ON arcigy_supplier_price_observations (client_id, supplier_id, supplier_product_code, observed_at DESC);
CREATE INDEX IF NOT EXISTS arcigy_supplier_tokens_session_idx
  ON arcigy_supplier_bridge_tokens (client_id, session_id, expires_at DESC);
