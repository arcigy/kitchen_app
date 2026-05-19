import type { ClientRole } from "./client/client-types";

export type Permission = "clientProfile:read" | "clientProfile:update";

const rolePermissions: Record<ClientRole, Permission[]> = {
  owner: ["clientProfile:read", "clientProfile:update"],
  admin: ["clientProfile:read", "clientProfile:update"],
  designer: ["clientProfile:read"],
  viewer: ["clientProfile:read"]
};

export function hasPermission(role: ClientRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}
