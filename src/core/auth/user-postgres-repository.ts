import type { ClientRole } from "../client/client-types";
import { withSchemaClient } from "../database/postgres-client";
import type { AuthUser } from "./user-types";
import type { UserRepository } from "./user-repository";

type UserRow = {
  user_id: string;
  username: string;
  email: string | null;
  display_name: string;
  password_hash: string;
  client_id: string;
  organization_name: string;
  role: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

function normalizeRole(role: string): ClientRole {
  if (role === "owner" || role === "admin" || role === "designer" || role === "viewer") return role;
  if (role === "administrator") return "owner";
  if (role === "team_member") return "designer";
  return "viewer";
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToUser(row: UserRow | undefined): AuthUser | null {
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email ?? undefined,
    displayName: row.display_name,
    organizationName: row.organization_name,
    passwordHash: row.password_hash,
    clientId: row.client_id,
    role: normalizeRole(row.role),
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function createPostgresUserRepository(args: {
  connectionString: string;
  schema: string;
}): UserRepository {
  const selectSql = `
    SELECT
      u.user_id,
      i.username,
      COALESCE(i.email, u.email) AS email,
      u.name AS display_name,
      i.password_hash,
      u.organization_id AS client_id,
      o.name AS organization_name,
      m.role,
      (u.is_active AND i.is_active) AS is_active,
      u.created_at,
      u.updated_at
    FROM arcigy_auth_identities i
    JOIN arcigy_organization_users u ON u.user_id = i.user_id
    JOIN arcigy_organizations o ON o.organization_id = u.organization_id
    JOIN arcigy_organization_memberships m ON m.user_id = u.user_id AND m.organization_id = u.organization_id
  `;

  return {
    async findByUsername(username) {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<UserRow>(
          `${selectSql} WHERE lower(i.username) = lower($1) LIMIT 1`,
          [username.trim()]
        );
        return rowToUser(result.rows[0]);
      });
    },
    async findByCompanyAndUsername(company, username) {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<UserRow>(
          `${selectSql} WHERE lower(i.username) = lower($1)
            AND (lower(o.name) = lower($2) OR lower(COALESCE(o.legal_name, '')) = lower($2))
            LIMIT 1`,
          [username.trim(), company.trim().replace(/\s+/g, " ")]
        );
        return rowToUser(result.rows[0]);
      });
    },
    async findByUserId(userId) {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<UserRow>(
          `${selectSql} WHERE u.user_id = $1 ORDER BY i.provider = 'password' DESC LIMIT 1`,
          [userId]
        );
        return rowToUser(result.rows[0]);
      });
    }
  };
}
