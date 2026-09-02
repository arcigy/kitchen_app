import process from "node:process";
import { assertEnvironmentSchemaMatch, assertValidDatabaseSchema, getDatabaseUrl, normalizeAppEnvironment } from "../src/core/database/database-config";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { normalizeFeatureRelease } from "../src/core/release/feature-release";

type Args = Record<string, string | boolean>;
const identifier = /^[a-z][a-z0-9_]{2,62}$/u;
const featureKey = /^[a-z][a-z0-9-]{2,80}$/u;

function parseArgs(values: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item?.startsWith("--")) continue;
    const key = item.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

function required(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  return value.trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const clientId = required(args, "clientId");
  const userId = required(args, "userId");
  const feature = required(args, "feature");
  const mode = args.mode === "disable" ? "disable" : args.mode === "enable" ? "enable" : null;
  if (!identifier.test(clientId) || !identifier.test(userId)) throw new Error("clientId and userId must be safe identifiers.");
  if (!featureKey.test(feature)) throw new Error("feature must be a lowercase feature key.");
  if (!mode) throw new Error("mode must be enable or disable.");
  const appEnv = normalizeAppEnvironment(process.env.APP_ENV, process.env.NODE_ENV);
  const schema = assertValidDatabaseSchema(process.env.DATABASE_SCHEMA || appEnv);
  assertEnvironmentSchemaMatch(appEnv, schema);
  const connectionString = getDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  const write = args.write === true;
  const output = await withSchemaClient(connectionString, schema, async (client) => {
    const found = await client.query<{ profile: unknown }>(
      "SELECT profile FROM arcigy_organization_users WHERE organization_id = $1 AND user_id = $2",
      [clientId, userId]
    );
    if (found.rowCount !== 1) throw new Error("Target user does not belong to the selected tenant.");
    const profile = record(found.rows[0]?.profile);
    const previous = normalizeFeatureRelease(profile.release);
    const enabledFeatures = new Set(previous.enabledFeatures);
    mode === "enable" ? enabledFeatures.add(feature) : enabledFeatures.delete(feature);
    const release = { channel: previous.channel, enabledFeatures: [...enabledFeatures].sort() };
    if (write) {
      await client.query(
        "UPDATE arcigy_organization_users SET profile = $3::jsonb, updated_at = now(), db_updated_at = now() WHERE organization_id = $1 AND user_id = $2",
        [clientId, userId, JSON.stringify({ ...profile, release })]
      );
    }
    return { ok: true, dryRun: !write, clientId, userId, feature, mode, release };
  });
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

try { await main(); } finally { await closeSchemaPools(); }
