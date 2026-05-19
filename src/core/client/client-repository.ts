import type { ClientProfile } from "./client-types";
import { assertValidClientProfile } from "./client-validation";

const PROFILE_STORAGE_PREFIX = "arcigy:kitchen:client-profile:v1:";

export type ClientRepository = {
  getByClientId: (clientId: string) => ClientProfile | null;
  save: (profile: ClientProfile) => ClientProfile;
};

export const seedClientProfile: ClientProfile = {
  clientId: "client_arcigy_demo",
  company: {
    name: "Arcigy Kitchen",
    legalName: "Arcigy"
  },
  workshop: {
    address: "Hlavna 1",
    city: "Bratislava",
    country: "Slovakia"
  },
  contact: {
    email: "info@arcigy.local"
  },
  branding: {},
  defaults: {
    currency: "EUR",
    language: "sk",
    vatRate: 20
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

export function createLocalClientRepository(storage: Storage = window.localStorage): ClientRepository {
  return {
    getByClientId(clientId) {
      if (clientId === seedClientProfile.clientId) {
        const stored = readStoredProfile(storage, clientId);
        return stored ?? seedClientProfile;
      }

      return readStoredProfile(storage, clientId);
    },
    save(profile) {
      assertValidClientProfile(profile);
      storage.setItem(storageKey(profile.clientId), JSON.stringify(profile));
      return profile;
    }
  };
}

function readStoredProfile(storage: Storage, clientId: string): ClientProfile | null {
  const raw = storage.getItem(storageKey(clientId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ClientProfile;
    assertValidClientProfile(parsed);
    return parsed.clientId === clientId ? parsed : null;
  } catch {
    storage.removeItem(storageKey(clientId));
    return null;
  }
}

function storageKey(clientId: string): string {
  return `${PROFILE_STORAGE_PREFIX}${clientId}`;
}
