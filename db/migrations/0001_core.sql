CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcigy_organizations (
  organization_id text PRIMARY KEY,
  name text NOT NULL,
  legal_name text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcigy_organization_users (
  user_id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES arcigy_organizations (organization_id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  position text NOT NULL,
  photo_asset_id text,
  is_active boolean NOT NULL DEFAULT true,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcigy_organization_memberships (
  organization_id text NOT NULL REFERENCES arcigy_organizations (organization_id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES arcigy_organization_users (user_id) ON DELETE CASCADE,
  role text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS arcigy_auth_identities (
  identity_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES arcigy_organization_users (user_id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  email text,
  password_hash text NOT NULL,
  provider text NOT NULL DEFAULT 'password',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS arcigy_auth_sessions (
  session_id text PRIMARY KEY,
  session_token_hash text NOT NULL UNIQUE,
  user_id text NOT NULL REFERENCES arcigy_organization_users (user_id) ON DELETE CASCADE,
  organization_id text NOT NULL REFERENCES arcigy_organizations (organization_id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS arcigy_projects (
  client_id text NOT NULL,
  project_id text NOT NULL,
  metadata jsonb NOT NULL,
  name text NOT NULL,
  status text NOT NULL,
  active_phase_id text NOT NULL,
  preview_asset_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  created_by_user_id text NOT NULL,
  updated_by_user_id text NOT NULL,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, project_id)
);

CREATE TABLE IF NOT EXISTS arcigy_project_phases (
  client_id text NOT NULL,
  project_id text NOT NULL,
  phase_id text NOT NULL,
  phase_number integer NOT NULL,
  status text NOT NULL,
  metadata jsonb NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, project_id, phase_id),
  FOREIGN KEY (client_id, project_id)
    REFERENCES arcigy_projects (client_id, project_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_project_saves (
  client_id text NOT NULL,
  project_id text NOT NULL,
  phase_id text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  save jsonb NOT NULL,
  saved_at timestamptz NOT NULL,
  saved_by_user_id text,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, project_id, phase_id),
  FOREIGN KEY (client_id, project_id)
    REFERENCES arcigy_projects (client_id, project_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_project_versions (
  client_id text NOT NULL,
  project_id text NOT NULL,
  version_number integer NOT NULL,
  editing_session_id text NOT NULL,
  metadata jsonb NOT NULL,
  save jsonb NOT NULL,
  preview_asset_id text,
  saved_at timestamptz NOT NULL,
  saved_by_user_id text,
  db_created_at timestamptz NOT NULL DEFAULT now(),
  db_updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, project_id, version_number),
  FOREIGN KEY (client_id, project_id)
    REFERENCES arcigy_projects (client_id, project_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_project_activity_events (
  client_id text NOT NULL,
  project_id text NOT NULL,
  event_id text NOT NULL,
  phase_id text,
  actor_user_id text NOT NULL,
  event_type text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, project_id, event_id),
  FOREIGN KEY (client_id, project_id)
    REFERENCES arcigy_projects (client_id, project_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS arcigy_client_catalogs (
  client_id text PRIMARY KEY,
  catalog jsonb NOT NULL,
  catalog_version integer NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  db_updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS arcigy_module_packages (
  client_id text NOT NULL,
  module_package_id text NOT NULL,
  module_type text NOT NULL,
  package_version text NOT NULL,
  package_hash text NOT NULL,
  package jsonb NOT NULL,
  module_file_asset_id text,
  source text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (client_id, module_package_id)
);

CREATE TABLE IF NOT EXISTS arcigy_assets (
  asset_id text PRIMARY KEY,
  client_id text NOT NULL,
  project_id text,
  phase_id text,
  bucket text NOT NULL,
  object_key text NOT NULL UNIQUE,
  original_file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS arcigy_projects_client_updated_idx ON arcigy_projects (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS arcigy_project_saves_project_idx ON arcigy_project_saves (client_id, project_id);
CREATE INDEX IF NOT EXISTS arcigy_project_versions_project_idx ON arcigy_project_versions (client_id, project_id, version_number DESC);
CREATE INDEX IF NOT EXISTS arcigy_project_activity_project_idx ON arcigy_project_activity_events (client_id, project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arcigy_assets_scope_idx ON arcigy_assets (client_id, project_id, phase_id, bucket);
CREATE INDEX IF NOT EXISTS arcigy_module_packages_type_idx ON arcigy_module_packages (client_id, module_type);
