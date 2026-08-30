export type ClientProfile = {
  clientId: string;

  company: {
    name: string;
    legalName?: string;
    businessId?: string;
    vatId?: string;
  };

  workshop: {
    address: string;
    city: string;
    postalCode?: string;
    country: string;
    lat?: number;
    lng?: number;
  };

  contact: {
    email?: string;
    phone?: string;
    website?: string;
  };

  branding: {
    logoUrl?: string;
  };

  organization: OrganizationProfile;

  defaults: {
    currency: "EUR" | "CZK";
    language: "sk" | "cs" | "en";
    vatRate?: number;
  };

  release?: FeatureReleaseSettings;

  createdAt: string;
  updatedAt: string;
};

export type ClientRole = "owner" | "admin" | "designer" | "viewer";

export type OrganizationRoleId = "administrator" | "team_member" | "observer";

export type OrganizationRoleDefinition = {
  id: OrganizationRoleId;
  label: string;
  description: string;
};

export type OrganizationPermission =
  | "projects:view"
  | "projects:edit"
  | "projects:save"
  | "projects:export"
  | "versions:view"
  | "versions:restore"
  | "organization:view"
  | "organization:manage";

export type FeatureReleaseSettings = {
  channel: "stable" | "founder";
  enabledFeatures: string[];
};

export type OrganizationUser = {
  id: string;
  name: string;
  email?: string;
  position: string;
  role: OrganizationRoleId;
  permissions: OrganizationPermission[];
  photoUrl: string;
  isActive: boolean;
  release?: FeatureReleaseSettings;
};

export type OrganizationProfile = {
  name: string;
  roles: OrganizationRoleDefinition[];
  users: OrganizationUser[];
};

export type AppSession = {
  userId: string;
  clientId: string;
  role: ClientRole;
};

export type AuthenticatedClientSession = AppSession & {
  version: 1;
  sessionId?: string;
  displayName: string;
  issuedAt: string;
  expiresAt: string;
};

export type ClientProfileInput = Omit<ClientProfile, "clientId" | "createdAt" | "updatedAt">;
