import {
  assertEnvironmentSchemaMatch,
  assertValidDatabaseSchema,
  getDatabaseUrl,
  normalizeAppEnvironment
} from "../src/core/database/database-config";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { isPriceCurrency, type PriceCurrency } from "../src/core/pricing/currency";

type Args = {
  clientId?: string;
  currency?: PriceCurrency;
  write: boolean;
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--clientId") args.clientId = argv[++index];
    else if (item.startsWith("--clientId=")) args.clientId = item.slice("--clientId=".length);
    else if (item === "--currency") {
      const value = argv[++index];
      if (!isPriceCurrency(value)) throw new Error("--currency must be EUR or CZK.");
      args.currency = value;
    } else if (item.startsWith("--currency=")) {
      const value = item.slice("--currency=".length);
      if (!isPriceCurrency(value)) throw new Error("--currency must be EUR or CZK.");
      args.currency = value;
    } else if (item === "--write") args.write = true;
    else if (item === "--dry-run") args.write = false;
    else if (item === "--schema") args.schema = argv[++index];
    else if (item.startsWith("--schema=")) args.schema = item.slice("--schema=".length);
    else if (item === "--database-url") args.databaseUrl = argv[++index];
    else if (item.startsWith("--database-url=")) args.databaseUrl = item.slice("--database-url=".length);
    else if (item === "--app-env") args.appEnv = argv[++index];
    else if (item.startsWith("--app-env=")) args.appEnv = item.slice("--app-env=".length);
    else if (item === "--help" || item === "-h") {
      console.log("Usage: npm run db:set-client-currency -- --clientId client_example --currency CZK --dry-run|--write");
      process.exit(0);
    } else throw new Error(`Unsupported argument: ${item}`);
  }
  args.clientId = args.clientId?.trim();
  return args;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const args = parseArgs(process.argv.slice(2));
if (!args.clientId) throw new Error("--clientId is required.");
if (!args.currency) throw new Error("--currency is required.");
const connectionString = args.databaseUrl || getDatabaseUrl();
if (!connectionString) throw new Error("DATABASE_URL or --database-url is required.");
const inferredAppEnv = args.appEnv || process.env.APP_ENV || (args.schema === "prod" || args.schema === "dev" ? args.schema : undefined);
const appEnv = normalizeAppEnvironment(inferredAppEnv, process.env.NODE_ENV);
const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
assertEnvironmentSchemaMatch(appEnv, schema);
if (args.write && schema === "prod" && process.env.ARCIGY_APPROVE_PRODUCTION_CLIENT_CURRENCY !== "true") {
  throw new Error("Production write requires ARCIGY_APPROVE_PRODUCTION_CLIENT_CURRENCY=true.");
}

try {
  const report = await withSchemaClient(connectionString, schema, async (client) => {
    const result = await client.query<{ settings: unknown }>(
      "SELECT settings FROM arcigy_organizations WHERE organization_id = $1 LIMIT 1",
      [args.clientId]
    );
    const row = result.rows[0];
    if (!row) throw new Error("Client organization was not found.");
    const settings = record(row.settings);
    const defaults = record(settings.defaults);
    const currentCurrency = isPriceCurrency(defaults.currency) ? defaults.currency : null;
    const changed = currentCurrency !== args.currency;
    if (args.write && changed) {
      await client.query(
        "UPDATE arcigy_organizations SET settings = $2::jsonb, updated_at = now() WHERE organization_id = $1",
        [args.clientId, JSON.stringify({ ...settings, defaults: { ...defaults, currency: args.currency } })]
      );
    }
    return {
      dryRun: !args.write,
      schema,
      clientId: args.clientId,
      previousCurrency: currentCurrency,
      currency: args.currency,
      changed: args.write && changed
    };
  });
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await closeSchemaPools();
}
