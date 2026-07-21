import type {
  ClientProfile,
  OrganizationPermission,
  OrganizationRoleDefinition,
  OrganizationRoleId,
  OrganizationUser
} from "./client-types";
import { arcigyOrganizationProfile, getSeededClientProfile } from "./client-repository";
import { assertValidClientProfile } from "./client-validation";
import { withSchemaClient } from "../database/postgres-client";

type OrganizationRow = {
  organization_id: string;
  name: string;
  legal_name: string | null;
  settings: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

type OrganizationUserRow = {
  user_id: string;
  name: string;
  email: string | null;
  position: string | null;
  photo_asset_id: string | null;
  is_active: boolean;
  role: string;
  permissions: unknown;
};

type OrganizationSettings = {
  company?: ClientProfile["company"];
  workshop?: ClientProfile["workshop"];
  contact?: ClientProfile["contact"];
  branding?: ClientProfile["branding"];
  defaults?: ClientProfile["defaults"];
  roles?: OrganizationRoleDefinition[];
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeOrganizationRole(role: string): OrganizationRoleId {
  const normalized = role.trim().toLowerCase();
  if (normalized === "administrator" || normalized === "owner" || normalized === "admin") return "administrator";
  if (normalized === "team_member" || normalized === "designer") return "team_member";
  return "observer";
}

function normalizePermissions(value: unknown): OrganizationPermission[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is OrganizationPermission => typeof item === "string");
}

function readSettings(value: unknown): OrganizationSettings {
  return value && typeof value === "object" ? value as OrganizationSettings : {};
}

function rowToUser(row: OrganizationUserRow): OrganizationUser {
  return {
    id: row.user_id,
    name: row.name,
    email: row.email ?? undefined,
    position: row.position ?? "Team member",
    role: normalizeOrganizationRole(row.role),
    permissions: normalizePermissions(row.permissions),
    photoUrl: row.photo_asset_id ?? "/organization/default-user.svg",
    isActive: row.is_active
  };
}

export async function loadPostgresClientProfile(args: {
  connectionString: string;
  schema: string;
  clientId: string;
}): Promise<ClientProfile | null> {
  return withSchemaClient(args.connectionString, args.schema, async (client) => {
    const organizationResult = await client.query<OrganizationRow>(
      `
        SELECT organization_id, name, legal_name, settings, created_at, updated_at
        FROM arcigy_organizations
        WHERE organization_id = $1
        LIMIT 1
      `,
      [args.clientId]
    );
    const organization = organizationResult.rows[0];
    if (!organization) return getSeededClientProfile(args.clientId);

    const usersResult = await client.query<OrganizationUserRow>(
      `
        SELECT
          u.user_id,
          u.name,
          u.email,
          u.position,
          u.photo_asset_id,
          u.is_active,
          m.role,
          m.permissions
        FROM arcigy_organization_users u
        JOIN arcigy_organization_memberships m
          ON m.user_id = u.user_id
         AND m.organization_id = u.organization_id
        WHERE u.organization_id = $1
        ORDER BY u.created_at, u.user_id
      `,
      [args.clientId]
    );

    const settings = readSettings(organization.settings);
    const seeded = getSeededClientProfile(args.clientId);
    const profile: ClientProfile = {
      clientId: organization.organization_id,
      company: settings.company ?? {
        name: seeded?.company.name ?? organization.name,
        legalName: seeded?.company.legalName ?? organization.legal_name ?? undefined
      },
      workshop: settings.workshop ?? seeded?.workshop ?? {
        address: organization.name,
        city: "Bratislava",
        country: "Slovakia"
      },
      contact: settings.contact ?? seeded?.contact ?? {},
      branding: settings.branding ?? seeded?.branding ?? {},
      organization: {
        name: organization.name,
        roles: settings.roles ?? seeded?.organization.roles ?? arcigyOrganizationProfile.roles,
        users: usersResult.rows.map(rowToUser)
      },
      defaults: settings.defaults ?? seeded?.defaults ?? {
        currency: "EUR",
        language: "sk",
        vatRate: 20
      },
      createdAt: toIso(organization.created_at),
      updatedAt: toIso(organization.updated_at)
    };
    assertValidClientProfile(profile);
    return profile;
  });
}
