import type { ClientProfile, OrganizationProfile } from "./client-types";
import { assertValidClientProfile } from "./client-validation";

const PROFILE_STORAGE_PREFIX = "arcigy:kitchen:client-profile:v1:";

export const arcigyOrganizationProfile: OrganizationProfile = {
  name: "Arcigy",
  roles: [
    {
      id: "administrator",
      label: "Spravca",
      description: "Plny pristup k projektom, verziam a nastaveniam organizacie."
    },
    {
      id: "team_member",
      label: "Tvorca",
      description: "Bezny clen timu, ktory pracuje na projektoch."
    },
    {
      id: "observer",
      label: "Pozorovatel",
      description: "Clen timu urceny na prezeranie projektov a zmien."
    }
  ],
  users: [
    {
      id: "user_arcigy_owner",
      name: "Branislav Laubert",
      email: "laubert.bb@gmail.com",
      position: "Projektovy architekt",
      role: "administrator",
      permissions: [
        "projects:view",
        "projects:edit",
        "projects:save",
        "projects:export",
        "versions:view",
        "versions:restore",
        "organization:view",
        "organization:manage"
      ],
      photoUrl: "/organization/branislav.png",
      isActive: true
    },
    {
      id: "user_andrej",
      name: "Andrej",
      email: "andrej@arcigy.local",
      position: "Technicky tvorca",
      role: "team_member",
      permissions: [
        "projects:view",
        "projects:edit",
        "projects:save",
        "projects:export",
        "versions:view",
        "versions:restore",
        "organization:view",
        "organization:manage"
      ],
      photoUrl: "/organization/andrej.png",
      isActive: true
    }
  ]
};

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
  organization: arcigyOrganizationProfile,
  defaults: {
    currency: "EUR",
    language: "sk",
    vatRate: 20
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

export const seedPinoNobiliaClientProfile: ClientProfile = {
  clientId: "client_pino_nobilia_vkh_2026",
  company: {
    name: "PINO/Nobilia VKH 2026",
    legalName: "PINO/Nobilia VKH 2026"
  },
  workshop: {
    address: "Review staging tenant",
    city: "Bratislava",
    country: "Slovakia"
  },
  contact: {
    email: "pino-nobilia@arcigy.local"
  },
  branding: {},
  organization: {
    name: "PINO/Nobilia VKH 2026",
    roles: arcigyOrganizationProfile.roles,
    users: [
      {
        id: "user_pino_nobilia_owner",
        name: "PINO/Nobilia Owner",
        email: "pino-nobilia@arcigy.local",
        position: "Owner",
        role: "administrator",
        permissions: [
          "projects:view",
          "projects:edit",
          "projects:save",
          "projects:export",
          "versions:view",
          "versions:restore",
          "organization:view",
          "organization:manage"
        ],
        photoUrl: "/organization/pino-nobilia.png",
        isActive: true
      }
    ]
  },
  defaults: {
    currency: "EUR",
    language: "sk",
    vatRate: 20
  },
  createdAt: "2026-06-16T00:00:00.000Z",
  updatedAt: "2026-06-16T00:00:00.000Z"
};

const seededProfiles = new Map<string, ClientProfile>([
  [seedClientProfile.clientId, seedClientProfile],
  [seedPinoNobiliaClientProfile.clientId, seedPinoNobiliaClientProfile]
]);

export function getSeededClientProfile(clientId: string): ClientProfile | null {
  return seededProfiles.get(clientId) ?? null;
}

export function listSeededClientProfiles(): ClientProfile[] {
  return [...seededProfiles.values()].map((profile) => structuredClone(profile));
}

export function createLocalClientRepository(storage: Storage = window.localStorage): ClientRepository {
  return {
    getByClientId(clientId) {
      const seeded = getSeededClientProfile(clientId);
      if (seeded) {
        const stored = readStoredProfile(storage, clientId);
        return stored ? normalizeClientProfile(stored) : seeded;
      }

      const stored = readStoredProfile(storage, clientId);
      return stored ? normalizeClientProfile(stored) : null;
    },
    save(profile) {
      const normalized = normalizeClientProfile(profile);
      assertValidClientProfile(normalized);
      storage.setItem(storageKey(normalized.clientId), JSON.stringify(normalized));
      return normalized;
    }
  };
}

function readStoredProfile(storage: Storage, clientId: string): ClientProfile | null {
  const raw = storage.getItem(storageKey(clientId));
  if (!raw) return null;

  try {
    const parsed = normalizeClientProfile(JSON.parse(raw) as ClientProfile);
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

function normalizeClientProfile(profile: ClientProfile): ClientProfile {
  return {
    ...profile,
    organization: profile.organization ?? arcigyOrganizationProfile
  };
}
