import { hashPasswordSync } from "./password";
import type { AuthUser } from "./user-types";

const now = "2026-01-01T00:00:00.000Z";

export const seedAuthUsers: readonly AuthUser[] = [
  {
    userId: "user_arcigy_owner",
    username: "arcigy",
    displayName: "Branislav",
    organizationName: "Arcigy Kitchen",
    passwordHash: "scrypt$v1$arcigy-demo-user-v1$8njWgz7dBVvOZjK3cVRe55r00Z7FWwuazch_8kKcHiX2umbC1lsHDTsagCc6FKbsnD75F6y6CpN9k-rmEnBkVw",
    clientId: "client_arcigy_demo",
    role: "owner",
    isActive: true,
    createdAt: now,
    updatedAt: now
  },
  {
    userId: "user_arcigy_owner",
    username: "branislav",
    displayName: "Branislav",
    organizationName: "Arcigy Kitchen",
    passwordHash: "scrypt$v1$arcigy-branislav-v1$aznlvrD7jfACWGm_7BPjvR3MSsqm5XMj02N6dnvcZBp4eB16FfYVxArHi8GSFziL8v1p_4-jNTvnap5Krhu5Mg",
    clientId: "client_arcigy_demo",
    role: "owner",
    isActive: true,
    createdAt: now,
    updatedAt: now
  },
  {
    userId: "user_andrej",
    username: "andrej",
    displayName: "Andrej",
    organizationName: "Arcigy Kitchen",
    passwordHash: "scrypt$v1$arcigy-andrej-v1$rWGv-on9xwMalvviwsGE-HM2omuoERWOpiK7tH0tWAN6-GbBeztqrf9RBEnzAufO5bfLbox3r97rXb0ornZKeA",
    clientId: "client_arcigy_demo",
    role: "owner",
    isActive: true,
    createdAt: now,
    updatedAt: now
  }
] as const;

export function createDevelopmentAuthUsers(password: string): readonly AuthUser[] {
  const passwordHash = hashPasswordSync(password);
  return seedAuthUsers.map((user) => ({ ...user, passwordHash }));
}

export type UserRepository = {
  findByUsername(username: string): Promise<AuthUser | null>;
  findByCompanyAndUsername(company: string, username: string): Promise<AuthUser | null>;
  findByUserId(userId: string): Promise<AuthUser | null>;
};

export function createInMemoryUserRepository(users: readonly AuthUser[] = seedAuthUsers): UserRepository {
  const usersByUsername = new Map(users.map((user) => [normalizeUsername(user.username), user]));
  const usersByCompanyAndUsername = new Map(
    users.map((user) => [loginLookupKey(user.organizationName, user.username), user])
  );
  const usersById = new Map(users.map((user) => [user.userId, user]));

  return {
    async findByUsername(username: string): Promise<AuthUser | null> {
      return usersByUsername.get(normalizeUsername(username)) ?? null;
    },
    async findByCompanyAndUsername(company: string, username: string): Promise<AuthUser | null> {
      return usersByCompanyAndUsername.get(loginLookupKey(company, username)) ?? null;
    },
    async findByUserId(userId: string): Promise<AuthUser | null> {
      return usersById.get(userId) ?? null;
    }
  };
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function normalizeCompany(company: string): string {
  return company.trim().replace(/\s+/g, " ").toLowerCase();
}

function loginLookupKey(company: string, username: string): string {
  return `${normalizeCompany(company)}\u0000${normalizeUsername(username)}`;
}
