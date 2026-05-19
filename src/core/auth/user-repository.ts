import type { AuthUser } from "./user-types";

const now = "2026-01-01T00:00:00.000Z";

export const seedAuthUsers: readonly AuthUser[] = [
  {
    userId: "user_arcigy_owner",
    username: "arcigy",
    displayName: "Arcigy",
    passwordHash: "scrypt$v1$arcigy-demo-user-v1$8njWgz7dBVvOZjK3cVRe55r00Z7FWwuazch_8kKcHiX2umbC1lsHDTsagCc6FKbsnD75F6y6CpN9k-rmEnBkVw",
    clientId: "client_arcigy_demo",
    role: "owner",
    isActive: true,
    createdAt: now,
    updatedAt: now
  }
] as const;

export type UserRepository = {
  findByUsername(username: string): Promise<AuthUser | null>;
  findByUserId(userId: string): Promise<AuthUser | null>;
};

export function createInMemoryUserRepository(users: readonly AuthUser[] = seedAuthUsers): UserRepository {
  const usersByUsername = new Map(users.map((user) => [normalizeUsername(user.username), user]));
  const usersById = new Map(users.map((user) => [user.userId, user]));

  return {
    async findByUsername(username: string): Promise<AuthUser | null> {
      return usersByUsername.get(normalizeUsername(username)) ?? null;
    },
    async findByUserId(userId: string): Promise<AuthUser | null> {
      return usersById.get(userId) ?? null;
    }
  };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}
