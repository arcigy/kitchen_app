import { createLocalClientRepository } from "../core/client/client-repository";
import type { ClientProfile } from "../core/client/client-types";
import { assertValidClientProfile } from "../core/client/client-validation";

function isClientProfile(value: unknown): value is ClientProfile {
  try {
    assertValidClientProfile(value as ClientProfile);
    return true;
  } catch {
    return false;
  }
}

function readProfileBody(body: unknown): ClientProfile | null {
  if (!body || typeof body !== "object") return null;
  const profile = (body as { profile?: unknown }).profile;
  return isClientProfile(profile) ? profile : null;
}

export async function loadCurrentClientProfileForApp(expectedClientId: string): Promise<ClientProfile> {
  try {
    const response = await fetch("/api/client/profile", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (response.ok) {
      const body = await response.json() as unknown;
      const profile = readProfileBody(body);
      if (profile && profile.clientId === expectedClientId) return profile;
    }
  } catch {
    // Fall through to local seed fallback.
  }

  const localProfile = createLocalClientRepository().getByClientId(expectedClientId);
  if (!localProfile) throw new Error("Client profile was not found.");
  return localProfile;
}
