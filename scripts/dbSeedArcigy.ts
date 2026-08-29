import { assertEnvironmentSchemaMatch, assertValidDatabaseSchema, getDatabaseUrl, normalizeAppEnvironment } from "../src/core/database/database-config";
import { withSchemaClient, closeSchemaPools } from "../src/core/database/postgres-client";
import { seedAuthUsers } from "../src/core/auth/user-repository";
import { seedClientProfile } from "../src/core/client/client-repository";

type Args = {
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--schema") args.schema = argv[++index];
    else if (item.startsWith("--schema=")) args.schema = item.slice("--schema=".length);
    else if (item === "--database-url") args.databaseUrl = argv[++index];
    else if (item.startsWith("--database-url=")) args.databaseUrl = item.slice("--database-url=".length);
    else if (item === "--app-env") args.appEnv = argv[++index];
    else if (item.startsWith("--app-env=")) args.appEnv = item.slice("--app-env=".length);
    else throw new Error(`Unsupported argument: ${item}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const connectionString = args.databaseUrl || getDatabaseUrl();
if (!connectionString) throw new Error("DATABASE_URL or KITCHEN_PROJECT_DATABASE_URL is required.");

const inferredAppEnv = args.appEnv || process.env.APP_ENV || (args.schema === "prod" || args.schema === "dev" ? args.schema : undefined);
const appEnv = normalizeAppEnvironment(inferredAppEnv, process.env.NODE_ENV);
const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
assertEnvironmentSchemaMatch(appEnv, schema);

const now = new Date().toISOString();
const organization = seedClientProfile;

try {
  await withSchemaClient(connectionString, schema, async (client) => {
    await client.query(
      `
        INSERT INTO arcigy_organizations (
          organization_id,
          name,
          legal_name,
          settings,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (organization_id) DO UPDATE SET
          name = EXCLUDED.name,
          legal_name = EXCLUDED.legal_name,
          settings = EXCLUDED.settings,
          updated_at = EXCLUDED.updated_at,
          db_updated_at = now()
      `,
      [
        organization.clientId,
        organization.company.name,
        organization.company.legalName ?? null,
        JSON.stringify({
          company: organization.company,
          workshop: organization.workshop,
          contact: organization.contact,
          branding: organization.branding,
          defaults: organization.defaults,
          roles: organization.organization.roles
        }),
        organization.createdAt,
        now
      ]
    );

    for (const user of organization.organization.users) {
      await client.query(
        `
          INSERT INTO arcigy_organization_users (
            user_id,
            organization_id,
            name,
            email,
            position,
            photo_asset_id,
            is_active,
            profile,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10::timestamptz)
          ON CONFLICT (user_id) DO UPDATE SET
            organization_id = EXCLUDED.organization_id,
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            position = EXCLUDED.position,
            photo_asset_id = EXCLUDED.photo_asset_id,
            is_active = EXCLUDED.is_active,
            profile = EXCLUDED.profile,
            updated_at = EXCLUDED.updated_at,
            db_updated_at = now()
        `,
        [
          user.id,
          organization.clientId,
          user.name,
          user.email ?? null,
          user.position,
          user.photoUrl,
          user.isActive,
          JSON.stringify({ organizationRole: user.role, permissions: user.permissions }),
          organization.createdAt,
          now
        ]
      );
      await client.query(
        `
          INSERT INTO arcigy_organization_memberships (
            organization_id,
            user_id,
            role,
            permissions,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
          ON CONFLICT (organization_id, user_id) DO UPDATE SET
            role = EXCLUDED.role,
            permissions = EXCLUDED.permissions,
            updated_at = EXCLUDED.updated_at
        `,
        [
          organization.clientId,
          user.id,
          user.role === "administrator" ? "owner" : user.role === "team_member" ? "designer" : "viewer",
          JSON.stringify(user.permissions),
          organization.createdAt,
          now
        ]
      );
    }

    for (const user of seedAuthUsers) {
      await client.query(
        `
          INSERT INTO arcigy_auth_identities (
            identity_id,
            user_id,
            username,
            email,
            password_hash,
            provider,
            is_active,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 'password', $6, $7::timestamptz, $8::timestamptz)
          ON CONFLICT (identity_id) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            is_active = EXCLUDED.is_active,
            updated_at = EXCLUDED.updated_at
        `,
        [
          `password:${user.username.toLowerCase()}`,
          user.userId,
          user.username,
          user.email ?? null,
          user.passwordHash,
          user.isActive,
          user.createdAt,
          now
        ]
      );
    }
  });
  console.log(`[db:seed] Arcigy seed applied to schema ${schema}`);
} finally {
  await closeSchemaPools();
}
