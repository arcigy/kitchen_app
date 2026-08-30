import process from "node:process";
import { cloneFounderTenantCatalog, cloneFounderTenantPackages, summarizeFounderTenantBootstrap } from "../src/core/client/founder-tenant-bootstrap";
import { assertEnvironmentSchemaMatch, assertValidDatabaseSchema, getDatabaseUrl, normalizeAppEnvironment } from "../src/core/database/database-config";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { validateClientCatalog } from "../src/core/catalog/catalog-validation";
import { computeModulePackageHash } from "../src/core/module-package/module-package-file";
import type { FurnQuoteModulePackage } from "../src/core/module-package/module-package-types";
import { validateFurnQuoteModulePackage } from "../src/core/module-package/module-package-validation";
import { hashPassword } from "../src/core/auth/password";

const OWNER_PERMISSIONS = [
  "projects:view",
  "projects:edit",
  "projects:save",
  "projects:export",
  "versions:view",
  "versions:restore",
  "organization:view",
  "organization:manage"
] as const;

type ParsedArgs = Record<string, string | boolean>;

type SourcePackageRow = {
  package: unknown;
  source: string;
};

type PreflightRows = {
  sourceOrganization: boolean;
  sourceCatalog: unknown | null;
  sourcePackages: SourcePackageRow[];
  targetExists: boolean;
  targetSettings: unknown | null;
  organizationNameExists: boolean;
  userIdExists: boolean;
  identityIdExists: boolean;
  usernameExists: boolean;
  existingLogin: { identity_id: string; user_id: string; organization_id: string } | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value?.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function stringArg(args: ParsedArgs, key: string, fallback: string): string {
  return typeof args[key] === "string" ? args[key].trim() : fallback;
}

function assertIdentifier(value: string, label: string): string {
  if (!/^[a-z][a-z0-9_]{2,62}$/u.test(value)) throw new Error(`${label} must be a lowercase safe identifier.`);
  return value;
}

function assertUsername(value: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{2,62}$/u.test(value)) throw new Error("username must contain only lowercase letters, digits, dot, underscore, or dash.");
  return value;
}

async function readPreflight(args: {
  connectionString: string;
  schema: string;
  sourceClientId: string;
  targetClientId: string;
  organizationName: string;
  userId: string;
  identityId: string;
  username: string;
}): Promise<PreflightRows> {
  return withSchemaClient(args.connectionString, args.schema, async (client) => {
    // A pg Client executes one query at a time. Keeping this explicit avoids
    // interleaving preflight reads on a production connection.
    const sourceOrganization = await client.query("SELECT 1 FROM arcigy_organizations WHERE organization_id = $1", [args.sourceClientId]);
    const sourceCatalog = await client.query<{ catalog: unknown }>("SELECT catalog FROM arcigy_client_catalogs WHERE client_id = $1", [args.sourceClientId]);
    const sourcePackages = await client.query<SourcePackageRow>("SELECT package, source FROM arcigy_module_packages WHERE client_id = $1 ORDER BY module_type, module_package_id", [args.sourceClientId]);
    const target = await client.query<{ settings: unknown }>("SELECT settings FROM arcigy_organizations WHERE organization_id = $1", [args.targetClientId]);
    const organizationName = await client.query("SELECT 1 FROM arcigy_organizations WHERE lower(name) = lower($1) OR lower(COALESCE(legal_name, '')) = lower($1)", [args.organizationName]);
    const user = await client.query("SELECT 1 FROM arcigy_organization_users WHERE user_id = $1", [args.userId]);
    const identity = await client.query("SELECT 1 FROM arcigy_auth_identities WHERE identity_id = $1", [args.identityId]);
    const username = await client.query("SELECT 1 FROM arcigy_auth_identities WHERE lower(username) = lower($1)", [args.username]);
    const existingLogin = await client.query<{ identity_id: string; user_id: string; organization_id: string }>(
      `SELECT i.identity_id, i.user_id, u.organization_id
       FROM arcigy_auth_identities i
       JOIN arcigy_organization_users u ON u.user_id = i.user_id
       WHERE lower(i.username) = lower($1)
       LIMIT 1`,
      [args.username]
    );
    return {
      sourceOrganization: sourceOrganization.rowCount === 1,
      sourceCatalog: sourceCatalog.rows[0]?.catalog ?? null,
      sourcePackages: sourcePackages.rows,
      targetExists: target.rowCount === 1,
      targetSettings: target.rows[0]?.settings ?? null,
      organizationNameExists: organizationName.rowCount === 1,
      userIdExists: user.rowCount === 1,
      identityIdExists: identity.rowCount === 1,
      usernameExists: username.rowCount === 1,
      existingLogin: existingLogin.rows[0] ?? null
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function assertWritablePreflight(preflight: PreflightRows): void {
  if (!preflight.sourceOrganization) throw new Error("Source organization was not found.");
  if (!preflight.sourceCatalog) throw new Error("Source organization has no persisted catalog; refusing fallback data.");
  if (preflight.sourcePackages.length === 0) throw new Error("Source organization has no persisted module packages.");
  if (preflight.targetExists) throw new Error("Target organization already exists; refusing to overwrite it.");
  if (preflight.organizationNameExists) throw new Error("Organization name is already in use; refusing to create an ambiguous login target.");
  if (preflight.userIdExists || preflight.identityIdExists || preflight.usernameExists) {
    throw new Error("Founder account identifier is already in use; refusing to overwrite an existing account.");
  }
}

function assertAdoptablePreflight(preflight: PreflightRows, targetClientId: string, userId: string): void {
  if (!preflight.sourceOrganization) throw new Error("Source organization was not found.");
  if (!preflight.sourceCatalog) throw new Error("Source organization has no persisted catalog; refusing fallback data.");
  if (preflight.sourcePackages.length === 0) throw new Error("Source organization has no persisted module packages.");
  if (!preflight.targetExists) throw new Error("Existing Arcigy founder tenant was not found.");
  if (preflight.existingLogin?.organization_id !== targetClientId || preflight.existingLogin.user_id !== userId) {
    throw new Error("The existing founder login does not belong to the expected Arcigy tenant.");
  }
}

async function writeFounderTenant(args: {
  connectionString: string;
  schema: string;
  clientId: string;
  userId: string;
  identityId: string;
  username: string;
  organizationName: string;
  catalog: ReturnType<typeof cloneFounderTenantCatalog>;
  packages: FurnQuoteModulePackage[];
  packageSources: string[];
  password: string;
  now: string;
}): Promise<void> {
  const passwordHash = await hashPassword(args.password);
  await withSchemaClient(args.connectionString, args.schema, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO arcigy_organizations (organization_id, name, legal_name, settings, created_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)`,
        [
          args.clientId,
          args.organizationName,
          args.organizationName,
          JSON.stringify({
            company: { name: args.organizationName, legalName: args.organizationName },
            defaults: { currency: "EUR", language: "sk", vatRate: 20 },
            releaseChannel: "founder"
          }),
          args.now,
          args.now
        ]
      );
      await client.query(
        `INSERT INTO arcigy_organization_users (
           user_id, organization_id, name, email, position, photo_asset_id, is_active, profile, created_at, updated_at
         ) VALUES ($1, $2, $3, NULL, $4, $5, true, $6::jsonb, $7::timestamptz, $8::timestamptz)`,
        [
          args.userId,
          args.clientId,
          "Branislav",
          "Owner",
          "/organization/default-user.svg",
          JSON.stringify({ organizationRole: "administrator", permissions: OWNER_PERMISSIONS }),
          args.now,
          args.now
        ]
      );
      await client.query(
        `INSERT INTO arcigy_organization_memberships (organization_id, user_id, role, permissions, created_at, updated_at)
         VALUES ($1, $2, 'owner', $3::jsonb, $4::timestamptz, $5::timestamptz)`,
        [args.clientId, args.userId, JSON.stringify(OWNER_PERMISSIONS), args.now, args.now]
      );
      await client.query(
        `INSERT INTO arcigy_auth_identities (
           identity_id, user_id, username, email, password_hash, provider, is_active, created_at, updated_at
         ) VALUES ($1, $2, $3, NULL, $4, 'password', true, $5::timestamptz, $6::timestamptz)`,
        [args.identityId, args.userId, args.username, passwordHash, args.now, args.now]
      );
      for (const [index, sourcePackage] of args.packages.entries()) {
        const modulePackage = validateFurnQuoteModulePackage(sourcePackage);
        const packageHash = computeModulePackageHash(modulePackage);
        await client.query(
          `INSERT INTO arcigy_module_packages (
             client_id, module_package_id, module_type, package_version, package_hash, package, source, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::timestamptz)`,
          [
            args.clientId,
            modulePackage.module.modulePackageId,
            modulePackage.module.moduleType,
            modulePackage.module.version,
            packageHash,
            JSON.stringify({ ...modulePackage, integrity: { ...modulePackage.integrity, packageHash } }),
            args.packageSources[index] ?? "dev-json",
            args.now,
            args.now
          ]
        );
      }
      await client.query(
        `INSERT INTO arcigy_client_catalogs (
           client_id, catalog, catalog_version, source, created_at, updated_at, db_updated_at
         ) VALUES ($1, $2::jsonb, $3, $4, $5::timestamptz, $6::timestamptz, now())`,
        [
          args.clientId,
          JSON.stringify(args.catalog),
          args.catalog.meta.catalogVersion,
          args.catalog.meta.source,
          args.catalog.meta.createdAt,
          args.catalog.meta.updatedAt
        ]
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function adoptExistingFounderTenant(args: {
  connectionString: string;
  schema: string;
  clientId: string;
  userId: string;
  username: string;
  organizationName: string;
  existingSettings: unknown;
  catalog: ReturnType<typeof cloneFounderTenantCatalog>;
  packages: FurnQuoteModulePackage[];
  packageSources: string[];
  password: string;
  now: string;
}): Promise<void> {
  const passwordHash = await hashPassword(args.password);
  const previousSettings = asRecord(args.existingSettings);
  const settings = {
    ...previousSettings,
    company: { ...asRecord(previousSettings.company), name: args.organizationName, legalName: args.organizationName },
    releaseChannel: "founder"
  };
  await withSchemaClient(args.connectionString, args.schema, async (client) => {
    await client.query("BEGIN");
    try {
      const organization = await client.query(
        `UPDATE arcigy_organizations
         SET name = $2, legal_name = $2, settings = $3::jsonb, updated_at = $4::timestamptz, db_updated_at = now()
         WHERE organization_id = $1`,
        [args.clientId, args.organizationName, JSON.stringify(settings), args.now]
      );
      if (organization.rowCount !== 1) throw new Error("Founder organization disappeared during bootstrap.");
      const identity = await client.query(
        `UPDATE arcigy_auth_identities
         SET password_hash = $3, is_active = true, updated_at = $4::timestamptz
         WHERE user_id = $1 AND lower(username) = lower($2)`,
        [args.userId, args.username, passwordHash, args.now]
      );
      if (identity.rowCount !== 1) throw new Error("Founder login changed during bootstrap.");
      await client.query("DELETE FROM arcigy_module_packages WHERE client_id = $1", [args.clientId]);
      await client.query("DELETE FROM arcigy_client_catalogs WHERE client_id = $1", [args.clientId]);
      for (const [index, sourcePackage] of args.packages.entries()) {
        const modulePackage = validateFurnQuoteModulePackage(sourcePackage);
        const packageHash = computeModulePackageHash(modulePackage);
        await client.query(
          `INSERT INTO arcigy_module_packages (
             client_id, module_package_id, module_type, package_version, package_hash, package, source, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::timestamptz)`,
          [
            args.clientId,
            modulePackage.module.modulePackageId,
            modulePackage.module.moduleType,
            modulePackage.module.version,
            packageHash,
            JSON.stringify({ ...modulePackage, integrity: { ...modulePackage.integrity, packageHash } }),
            args.packageSources[index] ?? "dev-json",
            args.now,
            args.now
          ]
        );
      }
      await client.query(
        `INSERT INTO arcigy_client_catalogs (
           client_id, catalog, catalog_version, source, created_at, updated_at, db_updated_at
         ) VALUES ($1, $2::jsonb, $3, $4, $5::timestamptz, $6::timestamptz, now())`,
        [args.clientId, JSON.stringify(args.catalog), args.catalog.meta.catalogVersion, args.catalog.meta.source, args.catalog.meta.createdAt, args.catalog.meta.updatedAt]
      );
      await client.query("COMMIT");
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourceClientId = assertIdentifier(stringArg(args, "sourceClientId", "client_delfi"), "sourceClientId");
  const adoptExisting = args["adopt-existing"] === true;
  const targetClientId = assertIdentifier(stringArg(args, "targetClientId", adoptExisting ? "client_arcigy_demo" : "client_arcigy_founder"), "targetClientId");
  const userId = assertIdentifier(stringArg(args, "userId", adoptExisting ? "user_arcigy_owner" : "user_arcigy_founder"), "userId");
  const identityId = assertIdentifier(stringArg(args, "identityId", "identity_arcigy_founder"), "identityId");
  const username = assertUsername(stringArg(args, "username", "branislav"));
  const organizationName = stringArg(args, "organizationName", "Arcigy");
  const write = args.write === true;
  if (sourceClientId === targetClientId) throw new Error("Source and target clients must differ.");
  if (!organizationName) throw new Error("organizationName is required.");

  const appEnv = normalizeAppEnvironment(process.env.APP_ENV, process.env.NODE_ENV);
  const schema = assertValidDatabaseSchema(process.env.DATABASE_SCHEMA || appEnv);
  assertEnvironmentSchemaMatch(appEnv, schema);
  if (appEnv !== "prod" || schema !== "prod") throw new Error("Founder production bootstrap requires APP_ENV=prod and DATABASE_SCHEMA=prod.");
  const connectionString = getDatabaseUrl();
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const preflight = await readPreflight({
    connectionString,
    schema,
    sourceClientId,
    targetClientId,
    organizationName,
    userId,
    identityId,
    username
  });
  const sourceCatalog = preflight.sourceCatalog ? validateClientCatalog(preflight.sourceCatalog) : null;
  const sourcePackages = preflight.sourcePackages.map((row) => validateFurnQuoteModulePackage(row.package as FurnQuoteModulePackage));
  const now = new Date().toISOString();
  const catalog = sourceCatalog ? cloneFounderTenantCatalog({ source: sourceCatalog, targetClientId, now }) : null;
  const packages = cloneFounderTenantPackages(sourcePackages);
  const summary = catalog ? summarizeFounderTenantBootstrap({ sourceClientId, targetClientId, catalog, packages }) : null;

  const result = {
    ok: true,
    dryRun: !write,
    schema,
    sourceClientId,
    targetClientId,
    username,
    mode: adoptExisting ? "adopt-existing" : "create-new",
    summary,
    preflight: {
      sourceOrganization: preflight.sourceOrganization,
      sourceCatalog: Boolean(preflight.sourceCatalog),
      sourcePackageCount: preflight.sourcePackages.length,
      targetExists: preflight.targetExists,
      organizationNameExists: preflight.organizationNameExists,
      userIdExists: preflight.userIdExists,
      identityIdExists: preflight.identityIdExists,
      usernameExists: preflight.usernameExists,
      existingLoginMatchesTarget: preflight.existingLogin?.organization_id === targetClientId
        && preflight.existingLogin.user_id === userId
    }
  };

  if (!write) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (adoptExisting) assertAdoptablePreflight(preflight, targetClientId, userId);
  else assertWritablePreflight(preflight);
  if (!catalog) throw new Error("Source catalog is unavailable.");
  const password = process.env.ARCIGY_FOUNDER_PASSWORD;
  if (!password) throw new Error("ARCIGY_FOUNDER_PASSWORD is required for --write and must not be logged or stored.");
  const writeArgs = {
    connectionString,
    schema,
    clientId: targetClientId,
    userId,
    username,
    organizationName,
    catalog,
    packages,
    packageSources: preflight.sourcePackages.map((row) => row.source),
    password,
    now
  };
  if (adoptExisting) {
    await adoptExistingFounderTenant({ ...writeArgs, existingSettings: preflight.targetSettings });
  } else {
    await writeFounderTenant({ ...writeArgs, identityId });
  }
  process.stdout.write(`${JSON.stringify({ ...result, dryRun: false, created: !adoptExisting, updatedExisting: adoptExisting })}\n`);
}

try {
  await main();
} finally {
  await closeSchemaPools();
}
