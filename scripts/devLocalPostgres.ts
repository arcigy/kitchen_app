process.env.KITCHEN_PROJECT_STORAGE = process.env.KITCHEN_PROJECT_STORAGE || "postgres";
process.env.KITCHEN_PROJECT_DATABASE_URL =
  process.env.KITCHEN_PROJECT_DATABASE_URL ||
  "postgres://kitchen_app:kitchen_app@127.0.0.1:5432/kitchen_app";
process.env.APP_ENV = process.env.APP_ENV || "local";
process.env.DATABASE_SCHEMA = process.env.DATABASE_SCHEMA || "public";
process.env.ARCIGY_OBJECT_STORAGE_PREFIX = process.env.ARCIGY_OBJECT_STORAGE_PREFIX || "local";

await import("./devLocal");
