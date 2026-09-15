export const REQUIRED_DATABASE_MIGRATION_VERSIONS = [
  "0001_core",
  "0002_supplier_bridge",
  "0003_supplier_exact_catalog",
  "0004_client_suppliers",
  "0005_user_activity"
] as const;

export const REQUIRED_DATABASE_MIGRATION_VERSION = REQUIRED_DATABASE_MIGRATION_VERSIONS.at(-1)!;
