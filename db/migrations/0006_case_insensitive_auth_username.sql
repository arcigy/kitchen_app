-- Login normalizes usernames case-insensitively. Keep the database invariant
-- aligned with that lookup so one username always resolves to one tenant.
CREATE UNIQUE INDEX IF NOT EXISTS arcigy_auth_identities_username_lower_key
  ON arcigy_auth_identities (lower(username));
