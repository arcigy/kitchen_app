import type { AuthenticatedClientSession } from "../client/client-types";
import { verifyPassword } from "./password";
import type { UserRepository } from "./user-repository";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type UserService = ReturnType<typeof createUserService>;

export function createUserService(repository: UserRepository) {
  return {
    async getUserById(userId: string) {
      return repository.findByUserId(userId);
    },

    async authenticate(company: string, username: string, password: string, now = new Date()): Promise<AuthenticatedClientSession | null> {
      const user = await repository.findByCompanyAndUsername(company, username);
      return await createSession(user, password, now);
    },

    async authenticateByUsername(username: string, password: string, now = new Date()): Promise<AuthenticatedClientSession | null> {
      const user = await repository.findByUsername(username);
      return await createSession(user, password, now);
    }
  };
}

async function createSession(
  user: Awaited<ReturnType<UserRepository["findByUsername"]>>,
  password: string,
  now: Date
): Promise<AuthenticatedClientSession | null> {
  if (!user || !user.isActive) return null;
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  return {
    version: 1,
    userId: user.userId,
    clientId: user.clientId,
    role: user.role,
    displayName: user.displayName,
    issuedAt,
    expiresAt
  };
}
