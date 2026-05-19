import type { ClientRole } from "../client/client-types";

export type AuthUser = {
  userId: string;
  username: string;
  email?: string;
  displayName: string;
  passwordHash: string;
  clientId: string;
  role: ClientRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
