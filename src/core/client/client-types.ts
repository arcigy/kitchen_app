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

  defaults: {
    currency: "EUR" | "CZK";
    language: "sk" | "cz" | "en";
    vatRate?: number;
  };

  createdAt: string;
  updatedAt: string;
};

export type ClientRole = "owner" | "admin" | "designer" | "viewer";

export type AppSession = {
  userId: string;
  clientId: string;
  role: ClientRole;
};

export type AuthenticatedClientSession = AppSession & {
  version: 1;
  displayName: string;
  issuedAt: string;
  expiresAt: string;
};

export type ClientProfileInput = Omit<ClientProfile, "clientId" | "createdAt" | "updatedAt">;
