import { getDatabaseUrl } from "../src/core/database/database-config";

process.env.KITCHEN_PROJECT_STORAGE = process.env.KITCHEN_PROJECT_STORAGE || "postgres";

if (!getDatabaseUrl()) {
  throw new Error(
    "dev:local:postgres requires DATABASE_URL, KITCHEN_PROJECT_DATABASE_URL, or complete POSTGRES_* env vars. The old local 127.0.0.1 fallback is disabled to avoid using a second database."
  );
}

await import("./devLocal");
