import type { ClientProfile } from "./client-types";

export type ClientProfileValidationResult = {
  ok: boolean;
  errors: string[];
};

const currencies = new Set<ClientProfile["defaults"]["currency"]>(["EUR", "CZK"]);
const languages = new Set<ClientProfile["defaults"]["language"]>(["sk", "cs", "en"]);
const organizationRoles = new Set(["administrator", "team_member", "observer"]);

export function validateClientProfile(profile: ClientProfile): ClientProfileValidationResult {
  const errors: string[] = [];

  requireText(profile.clientId, "clientId", errors);
  requireText(profile.company.name, "company.name", errors);
  requireText(profile.workshop.address, "workshop.address", errors);
  requireText(profile.workshop.city, "workshop.city", errors);
  requireText(profile.workshop.country, "workshop.country", errors);
  requireText(profile.createdAt, "createdAt", errors);
  requireText(profile.updatedAt, "updatedAt", errors);
  if (!profile.organization) {
    errors.push("organization is required.");
  } else {
    requireText(profile.organization.name, "organization.name", errors);
    if (profile.organization.users.length === 0) errors.push("organization.users must include at least one user.");

    for (const user of profile.organization.users) {
      requireText(user.id, "organization.users.id", errors);
      requireText(user.name, "organization.users.name", errors);
      requireText(user.position, "organization.users.position", errors);
      requireText(user.photoUrl, "organization.users.photoUrl", errors);
      if (!organizationRoles.has(user.role)) errors.push(`organization user role is invalid: ${user.role}`);
    }
  }

  if (!currencies.has(profile.defaults.currency)) errors.push("defaults.currency is invalid.");
  if (!languages.has(profile.defaults.language)) errors.push("defaults.language is invalid.");

  validateOptionalNumber(profile.workshop.lat, "workshop.lat", errors);
  validateOptionalNumber(profile.workshop.lng, "workshop.lng", errors);
  validateOptionalNumber(profile.defaults.vatRate, "defaults.vatRate", errors);

  if (profile.defaults.vatRate !== undefined && (profile.defaults.vatRate < 0 || profile.defaults.vatRate > 100)) {
    errors.push("defaults.vatRate must be between 0 and 100.");
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidClientProfile(profile: ClientProfile): void {
  const result = validateClientProfile(profile);
  if (!result.ok) {
    throw new Error(`Invalid client profile: ${result.errors.join(" ")}`);
  }
}

function requireText(value: string, field: string, errors: string[]): void {
  if (value.trim().length === 0) errors.push(`${field} is required.`);
}

function validateOptionalNumber(value: number | undefined, field: string, errors: string[]): void {
  if (value !== undefined && !Number.isFinite(value)) errors.push(`${field} must be a finite number.`);
}
