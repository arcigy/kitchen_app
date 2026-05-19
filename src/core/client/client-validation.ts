import type { ClientProfile } from "./client-types";

export type ClientProfileValidationResult = {
  ok: boolean;
  errors: string[];
};

const currencies = new Set<ClientProfile["defaults"]["currency"]>(["EUR", "CZK"]);
const languages = new Set<ClientProfile["defaults"]["language"]>(["sk", "cz", "en"]);

export function validateClientProfile(profile: ClientProfile): ClientProfileValidationResult {
  const errors: string[] = [];

  requireText(profile.clientId, "clientId", errors);
  requireText(profile.company.name, "company.name", errors);
  requireText(profile.workshop.address, "workshop.address", errors);
  requireText(profile.workshop.city, "workshop.city", errors);
  requireText(profile.workshop.country, "workshop.country", errors);
  requireText(profile.createdAt, "createdAt", errors);
  requireText(profile.updatedAt, "updatedAt", errors);

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
