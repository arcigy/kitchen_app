import {
  assertEnvironmentSchemaMatch,
  assertValidDatabaseSchema,
  getDatabaseUrl,
  normalizeAppEnvironment
} from "../src/core/database/database-config";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { planEnabledClientSuppliers } from "../src/core/supplier-configuration/supplier-assignment-plan";

type Args = {
  clientId?: string;
  suppliers: string[];
  write: boolean;
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
};

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseArgs(argv: string[]): Args {
  const args: Args = { suppliers: [], write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--clientId") args.clientId = argv[++index];
    else if (item.startsWith("--clientId=")) args.clientId = item.slice("--clientId=".length);
    else if (item === "--suppliers") args.suppliers.push(...splitCsv(argv[++index] ?? ""));
    else if (item.startsWith("--suppliers=")) args.suppliers.push(...splitCsv(item.slice("--suppliers=".length)));
    else if (item === "--write") args.write = true;
    else if (item === "--dry-run") args.write = false;
    else if (item === "--schema") args.schema = argv[++index];
    else if (item.startsWith("--schema=")) args.schema = item.slice("--schema=".length);
    else if (item === "--database-url") args.databaseUrl = argv[++index];
    else if (item.startsWith("--database-url=")) args.databaseUrl = item.slice("--database-url=".length);
    else if (item === "--app-env") args.appEnv = argv[++index];
    else if (item.startsWith("--app-env=")) args.appEnv = item.slice("--app-env=".length);
    else if (item === "--help" || item === "-h") {
      console.log("Usage: npm run db:assign-client-suppliers -- --clientId client_example --suppliers all --dry-run|--write");
      process.exit(0);
    } else throw new Error(`Unsupported argument: ${item}`);
  }
  args.clientId = args.clientId?.trim();
  args.suppliers = [...new Set(args.suppliers.map((item) => item.trim()).filter(Boolean))];
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.clientId) throw new Error("--clientId is required.");
if (args.suppliers.length === 0) throw new Error("--suppliers is required. Use --suppliers all for every active supplier.");
const connectionString = args.databaseUrl || getDatabaseUrl();
if (!connectionString) throw new Error("DATABASE_URL or --database-url is required.");
const inferredAppEnv = args.appEnv || process.env.APP_ENV || (args.schema === "prod" || args.schema === "dev" ? args.schema : undefined);
const appEnv = normalizeAppEnvironment(inferredAppEnv, process.env.NODE_ENV);
const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
assertEnvironmentSchemaMatch(appEnv, schema);
if (args.write && schema === "prod" && process.env.ARCIGY_APPROVE_PRODUCTION_SUPPLIER_ASSIGNMENT !== "true") {
  throw new Error("Production write requires ARCIGY_APPROVE_PRODUCTION_SUPPLIER_ASSIGNMENT=true.");
}

try {
  const report = await withSchemaClient(connectionString, schema, async (client) => {
    const organization = await client.query("SELECT 1 FROM arcigy_organizations WHERE organization_id = $1 LIMIT 1", [args.clientId]);
    if (!organization.rowCount) throw new Error("Client organization was not found.");
    const activeRows = await client.query<{ supplier_id: string }>("SELECT supplier_id FROM arcigy_suppliers WHERE is_active = true ORDER BY sort_order, supplier_id");
    const requestedSupplierIds = args.suppliers.includes("all")
      ? activeRows.rows.map((row) => row.supplier_id)
      : args.suppliers;
    const currentRows = await client.query<{ supplier_id: string; enabled: boolean }>("SELECT supplier_id, enabled FROM arcigy_client_suppliers WHERE client_id = $1", [args.clientId]);
    const plan = planEnabledClientSuppliers({
      activeSupplierIds: activeRows.rows.map((row) => row.supplier_id),
      currentAssignments: currentRows.rows.map((row) => ({ supplierId: row.supplier_id, enabled: row.enabled })),
      requestedSupplierIds
    });
    if (args.write && plan.enableSupplierIds.length > 0) {
      await client.query(
        `
          INSERT INTO arcigy_client_suppliers (client_id, supplier_id, enabled)
          SELECT $1, supplier_id, true
          FROM arcigy_suppliers
          WHERE supplier_id = ANY($2::text[])
          ON CONFLICT (client_id, supplier_id) DO UPDATE
            SET enabled = true, db_updated_at = now()
        `,
        [args.clientId, plan.enableSupplierIds]
      );
    }
    return { dryRun: !args.write, schema, clientId: args.clientId, ...plan };
  });
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await closeSchemaPools();
}
