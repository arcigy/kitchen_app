import path from "node:path";
import {
  assertEnvironmentSchemaMatch,
  assertValidDatabaseSchema,
  getDatabaseUrl,
  normalizeAppEnvironment
} from "../src/core/database/database-config";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { createFileClientCatalogRepository } from "../src/core/catalog/catalog-file-repository";
import { createPostgresClientCatalogRepository } from "../src/core/catalog/catalog-postgres-repository";
import type { ClientCatalogRepository } from "../src/core/catalog/catalog-repository";
import { createFileModulePackageRepository, type ModulePackageRepository } from "../src/core/module-package/module-package-repository";
import { createPostgresModulePackageRepository } from "../src/core/module-package/module-package-postgres-repository";
import type { ClientContext } from "../src/core/client/client-context";
import type { FurnQuoteModulePackage } from "../src/core/module-package/module-package-types";
import { validateFurnQuoteModulePackage } from "../src/core/module-package/module-package-validation";
import { systemModulePackageTemplates } from "../src/system/module-packages";
import { assignClientModules } from "../src/core/catalog/client-module-assignment";
import { refreshClientModulePackagesFromSystemTemplates } from "../src/core/catalog/client-module-package-refresh";

type StorageMode = "auto" | "postgres" | "file";
type AssignmentMode = "merge" | "replace" | "disable";

type Args = {
  clientId?: string;
  modules: string[];
  mode: AssignmentMode;
  write: boolean;
  refreshPackages: boolean;
  storage: StorageMode;
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
  projectRoot: string;
  userId: string;
  listSystem: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    modules: [],
    mode: "merge",
    write: false,
    refreshPackages: false,
    storage: "auto",
    projectRoot: process.cwd(),
    userId: "script_assign_client_modules",
    listSystem: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--clientId") args.clientId = argv[++index];
    else if (item.startsWith("--clientId=")) args.clientId = item.slice("--clientId=".length);
    else if (item === "--modules" || item === "--module") args.modules.push(...splitCsv(argv[++index] ?? ""));
    else if (item.startsWith("--modules=")) args.modules.push(...splitCsv(item.slice("--modules=".length)));
    else if (item.startsWith("--module=")) args.modules.push(...splitCsv(item.slice("--module=".length)));
    else if (item === "--mode") args.mode = parseMode(argv[++index]);
    else if (item.startsWith("--mode=")) args.mode = parseMode(item.slice("--mode=".length));
    else if (item === "--write") args.write = true;
    else if (item === "--dry-run") args.write = false;
    else if (item === "--refresh-packages") args.refreshPackages = true;
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
    else if (item === "--list-system") args.listSystem = true;
    else if (item === "--help" || item === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unsupported argument: ${item}`);
    }
  }

  args.modules = [...new Set(args.modules.map((moduleId) => moduleId.trim()).filter(Boolean))];
  args.projectRoot = path.resolve(args.projectRoot);
  return args;
}

function splitCsv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseMode(value: string | undefined): AssignmentMode {
  if (value === "merge" || value === "replace" || value === "disable") return value;
  throw new Error("--mode must be merge, replace, or disable.");
}

function parseStorage(value: string | undefined): StorageMode {
  if (value === "auto" || value === "postgres" || value === "file") return value;
  throw new Error("--storage must be auto, postgres, or file.");
}

function printHelp(): void {
  console.log(`
Assign module packages to a client catalog.

Usage:
  npm run db:assign-client-modules -- --clientId client_delfi --modules drawer_low_family_v1,swing_shelves_low_family_v1 --write

Options:
  --clientId <id>             Required client/tenant id, for example client_delfi.
  --modules <ids>             Comma-separated modulePackageId or moduleType. Use "all" for all known system packages.
  --mode <merge|replace|disable>
                              merge enables selected modules and preserves others.
                              replace enables selected modules and disables unlisted modules.
                              disable disables selected modules.
  --write                     Persist changes. Without this the script only prints a dry-run report.
  --refresh-packages          Re-save selected package rows. Existing client package ids are rebuilt from the current system template for their module type.
  --storage <auto|postgres|file>
  --schema <schema>           Postgres schema, for example prod or dev.
  --app-env <env>             prod, dev, local, or test.
  --database-url <url>        Explicit Postgres connection string.
  --projectRoot <path>        File storage project root. Defaults to current working directory.
  --list-system               Print available system module package ids.
`);
}

type DatabaseConfig = {
  connectionString: string;
  schema: string;
  appEnv: string;
};

function resolveScriptDatabaseConfig(args: Args): DatabaseConfig | null {
  const connectionString = args.databaseUrl || getDatabaseUrl();
  if (!connectionString) {
    if (args.storage === "postgres") throw new Error("DATABASE_URL or --database-url is required for --storage postgres.");
    return null;
  }
  const inferredAppEnv = args.appEnv || process.env.APP_ENV || (args.schema === "prod" || args.schema === "dev" ? args.schema : undefined);
  const appEnv = normalizeAppEnvironment(inferredAppEnv, process.env.NODE_ENV);
  const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
  assertEnvironmentSchemaMatch(appEnv, schema);
  return { connectionString, schema, appEnv };
}

async function readPostgresModulePackages(connectionString: string, schema: string, clientId: string): Promise<FurnQuoteModulePackage[]> {
  return withSchemaClient(connectionString, schema, async (client) => {
    const result = await client.query<{ package: unknown }>(
      "SELECT package FROM arcigy_module_packages WHERE client_id = $1 ORDER BY module_type, module_package_id",
      [clientId]
    );
    return result.rows.map((row) => validateFurnQuoteModulePackage(row.package as FurnQuoteModulePackage));
  });
}

function selectedRefreshPackages(existingPackages: readonly FurnQuoteModulePackage[], moduleIds: readonly string[]): FurnQuoteModulePackage[] {
  return [
    ...refreshClientModulePackagesFromSystemTemplates({
      existingPackages,
      sourcePackages: systemModulePackageTemplates,
      moduleIds
    }),
    ...selectedSystemPackages(moduleIds)
  ];
}

function mergePackageSources(existingPackages: readonly FurnQuoteModulePackage[], refreshModuleIds: readonly string[] = []): FurnQuoteModulePackage[] {
  const byId = new Map<string, FurnQuoteModulePackage>();
  for (const modulePackage of systemModulePackageTemplates) {
    byId.set(modulePackage.module.modulePackageId, structuredClone(modulePackage));
  }
  for (const modulePackage of existingPackages) {
    byId.set(modulePackage.module.modulePackageId, modulePackage);
  }
  for (const modulePackage of selectedRefreshPackages(existingPackages, refreshModuleIds)) {
    byId.set(modulePackage.module.modulePackageId, modulePackage);
  }
  return [...byId.values()];
}

function selectedSystemPackages(moduleIds: readonly string[]): FurnQuoteModulePackage[] {
  const requested = new Set(moduleIds.map((moduleId) => moduleId.trim().toLowerCase()).filter(Boolean));
  if (requested.has("all")) return systemModulePackageTemplates.map((modulePackage) => structuredClone(modulePackage));
  return systemModulePackageTemplates
    .filter((modulePackage) =>
      requested.has(modulePackage.module.modulePackageId.toLowerCase()) ||
      requested.has(modulePackage.module.moduleType.toLowerCase())
    )
    .map((modulePackage) => structuredClone(modulePackage));
}

async function ensureSelectedPackages(args: {
  ctx: ClientContext;
  repository: ModulePackageRepository;
  existingPackages: readonly FurnQuoteModulePackage[];
  moduleIds: readonly string[];
  refreshExisting: boolean;
}): Promise<number> {
  const existingIds = new Set(args.existingPackages.map((modulePackage) => modulePackage.module.modulePackageId));
  let savedCount = 0;
  const selectedPackages = args.refreshExisting
    ? selectedRefreshPackages(args.existingPackages, args.moduleIds)
    : selectedSystemPackages(args.moduleIds);
  for (const modulePackage of selectedPackages) {
    if (existingIds.has(modulePackage.module.modulePackageId) && !args.refreshExisting) continue;
    await args.repository.savePackage(args.ctx, modulePackage, { source: "system-template" });
    savedCount++;
  }
  return savedCount;
}

function printSystemPackages(): void {
  console.log(JSON.stringify({
    packages: systemModulePackageTemplates.map((modulePackage) => ({
      modulePackageId: modulePackage.module.modulePackageId,
      moduleType: modulePackage.module.moduleType,
      displayName: modulePackage.module.displayName,
      category: modulePackage.module.category
    }))
  }, null, 2));
}

const args = parseArgs(process.argv.slice(2));
if (args.listSystem) {
  printSystemPackages();
  process.exit(0);
}
if (!args.clientId) throw new Error("--clientId is required.");
if (args.modules.length === 0) throw new Error("--modules is required. Use --modules all to assign every known system package.");

const databaseConfig = args.storage === "file" ? null : resolveScriptDatabaseConfig(args);
const usePostgres = args.storage === "postgres" || (args.storage === "auto" && !!databaseConfig);
const ctx: ClientContext = { clientId: args.clientId, userId: args.userId, role: "owner" };
const catalogRepository: ClientCatalogRepository = usePostgres && databaseConfig
  ? createPostgresClientCatalogRepository({ connectionString: databaseConfig.connectionString, schema: databaseConfig.schema })
  : createFileClientCatalogRepository(args.projectRoot);
const modulePackageRepository: ModulePackageRepository = usePostgres && databaseConfig
  ? createPostgresModulePackageRepository({ connectionString: databaseConfig.connectionString, schema: databaseConfig.schema })
  : createFileModulePackageRepository(args.projectRoot);

try {
  const existingPackages = usePostgres && databaseConfig
    ? await readPostgresModulePackages(databaseConfig.connectionString, databaseConfig.schema, args.clientId)
    : await modulePackageRepository.listPackages(ctx);
  const availablePackages = mergePackageSources(existingPackages, args.refreshPackages ? args.modules : []);
  const catalog = await catalogRepository.getCatalog(ctx);
  const result = assignClientModules(catalog, availablePackages, {
    moduleIds: args.modules,
    mode: args.mode
  });

  let savedPackageCount = 0;
  if (args.write) {
    savedPackageCount = await ensureSelectedPackages({
      ctx,
      repository: modulePackageRepository,
      existingPackages,
      moduleIds: args.modules,
      refreshExisting: args.refreshPackages
    });
    await catalogRepository.saveCatalog(ctx, result.catalog);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: !args.write,
    storage: usePostgres ? "postgres" : "file",
    schema: usePostgres && databaseConfig ? databaseConfig.schema : undefined,
    clientId: args.clientId,
    refreshPackages: args.refreshPackages,
    savedPackageCount,
    summary: result.summary,
    changes: result.changes
  }, null, 2));
} finally {
  await closeSchemaPools();
}
