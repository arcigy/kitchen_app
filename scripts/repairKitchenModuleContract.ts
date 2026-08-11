import path from "node:path";
import {
  assertEnvironmentSchemaMatch,
  assertValidDatabaseSchema,
  getDatabaseUrl,
  normalizeAppEnvironment
} from "../src/core/database/database-config";
import { closeSchemaPools } from "../src/core/database/postgres-client";
import { createFileModulePackageRepository, type ModulePackageRepository } from "../src/core/module-package/module-package-repository";
import { createPostgresModulePackageRepository } from "../src/core/module-package/module-package-postgres-repository";
import type { ClientContext } from "../src/core/client/client-context";
import { auditKitchenModulePlacementContract } from "../src/layout/kitchenModulePlacementContract";
import { normalizeKitchenModulePackage } from "../src/layout/kitchenModuleContract";

type StorageMode = "auto" | "postgres" | "file";

type Args = {
  clientId?: string;
  write: boolean;
  storage: StorageMode;
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
  projectRoot: string;
  userId: string;
};

type DatabaseConfig = { connectionString: string; schema: string; appEnv: string };

function parseStorage(value: string | undefined): StorageMode {
  if (value === "auto" || value === "postgres" || value === "file") return value;
  throw new Error("--storage must be auto, postgres, or file.");
}

function parseArgs(argv: string[]): Args {
  const args: Args = { write: false, storage: "auto", projectRoot: process.cwd(), userId: "script_repair_kitchen_module_contract" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--clientId") args.clientId = argv[++index];
    else if (item.startsWith("--clientId=")) args.clientId = item.slice("--clientId=".length);
    else if (item === "--write") args.write = true;
    else if (item === "--dry-run") args.write = false;
    else if (item === "--storage") args.storage = parseStorage(argv[++index]);
    else if (item.startsWith("--storage=")) args.storage = parseStorage(item.slice("--storage=".length));
    else if (item === "--schema") args.schema = argv[++index];
    else if (item.startsWith("--schema=")) args.schema = item.slice("--schema=".length);
    else if (item === "--database-url") args.databaseUrl = argv[++index];
    else if (item.startsWith("--database-url=")) args.databaseUrl = item.slice("--database-url=".length);
    else if (item === "--app-env") args.appEnv = argv[++index];
    else if (item.startsWith("--app-env=")) args.appEnv = item.slice("--app-env=".length);
    else if (item === "--projectRoot") args.projectRoot = argv[++index] ?? args.projectRoot;
    else if (item.startsWith("--projectRoot=")) args.projectRoot = item.slice("--projectRoot=".length);
    else if (item === "--userId") args.userId = argv[++index] ?? args.userId;
    else if (item.startsWith("--userId=")) args.userId = item.slice("--userId=".length);
    else if (item === "--help" || item === "-h") {
      console.log("Usage: npm run db:repair-kitchen-module-contract -- --clientId <tenant> [--dry-run|--write] [--storage postgres|file] [--schema dev]");
      process.exit(0);
    } else throw new Error(`Unsupported argument: ${item}`);
  }
  args.projectRoot = path.resolve(args.projectRoot);
  return args;
}

function resolveDatabaseConfig(args: Args): DatabaseConfig | null {
  const connectionString = args.databaseUrl || getDatabaseUrl();
  if (!connectionString) {
    if (args.storage === "postgres") throw new Error("DATABASE_URL or --database-url is required for --storage postgres.");
    return null;
  }
  const appEnv = normalizeAppEnvironment(args.appEnv || process.env.APP_ENV || args.schema, process.env.NODE_ENV);
  const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
  assertEnvironmentSchemaMatch(appEnv, schema);
  return { connectionString, schema, appEnv };
}

function packageChanged(before: unknown, after: unknown) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.clientId) throw new Error("--clientId is required.");
  const database = args.storage === "file" ? null : resolveDatabaseConfig(args);
  const usePostgres = args.storage === "postgres" || (args.storage === "auto" && !!database);
  if (args.write && usePostgres && database?.schema === "prod") {
    throw new Error("Production writes are intentionally blocked. Run a dry-run first and use the approved production migration workflow.");
  }
  const context: ClientContext = { clientId: args.clientId, userId: args.userId, role: "owner" };
  const repository: ModulePackageRepository = usePostgres && database
    ? createPostgresModulePackageRepository({ connectionString: database.connectionString, schema: database.schema })
    : createFileModulePackageRepository(args.projectRoot);

  try {
    const packages = await repository.listPackages(context);
    const repairs = packages.map((modulePackage) => ({ before: modulePackage, after: normalizeKitchenModulePackage(modulePackage) }))
      .filter(({ before, after }) => packageChanged(before, after));
    const invalid = repairs.flatMap(({ after }) => auditKitchenModulePlacementContract(after)
      .filter((issue) => issue.severity === "error")
      .map((issue) => ({ modulePackageId: after.module.modulePackageId, ...issue })));
    if (invalid.length > 0) throw new Error(`Repair refused: ${invalid.length} contract errors remain after normalization. ${JSON.stringify(invalid)}`);
    if (args.write) {
      for (const { after } of repairs) await repository.savePackage(context, after, { source: "kitchen-contract-repair" });
    }
    console.log(JSON.stringify({
      ok: true,
      dryRun: !args.write,
      storage: usePostgres ? "postgres" : "file",
      schema: usePostgres ? database?.schema : undefined,
      clientId: args.clientId,
      checked: packages.length,
      repaired: repairs.map(({ after }) => ({ modulePackageId: after.module.modulePackageId, moduleType: after.module.moduleType }))
    }, null, 2));
  } finally {
    await closeSchemaPools();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
