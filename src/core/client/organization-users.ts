import type { OrganizationUser } from "./client-types";

export function findOrganizationUser(users: readonly OrganizationUser[], userId: string | null | undefined): OrganizationUser | null {
  if (!userId) return null;
  return users.find((user) => user.id === userId) ?? null;
}

export function organizationUserName(users: readonly OrganizationUser[], userId: string | null | undefined): string {
  return findOrganizationUser(users, userId)?.name ?? (userId ? `User ${userId}` : "Unknown user");
}

export function organizationUserEmail(user: OrganizationUser | null): string {
  return user?.email ?? "account@arcigy.local";
}

export function organizationUserInitial(user: OrganizationUser | null): string {
  const value = user?.name.trim() ?? "";
  return value ? value.slice(0, 1).toUpperCase() : "?";
}
