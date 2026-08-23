import type { AuthenticatedClientSession } from "../client/client-types";
import { verifyPassword } from "./password";
import type { UserRepository } from "./user-repository";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "scrypt$v1$arcigy-auth-timing-dummy-v1$AOtGjhqwPnS7cfYyBYlyJgJgNx5k9Lvxn3sLCRz2oomMmzKAbCuKDV5x0qo1ZC2RTvFochrOm6jMPlLu7XShmA";

export type UserService = ReturnType<typeof createUserService>;

export function createUserService(
  repository: UserRepository,
  dependencies: { verifyPassword?: typeof verifyPassword } = {}
) {
  const verify = dependencies.verifyPassword ?? verifyPassword;
  return {
    async getUserById(userId: string) {
      return repository.findByUserId(userId);
    },

    async authenticate(company: string, username: string, password: string, now = new Date()): Promise<AuthenticatedClientSession | null> {
      const user = await repository.findByCompanyAndUsername(company, username);
      return await createSession(user, password, now, verify);
    },

    async authenticateByUsername(username: string, password: string, now = new Date()): Promise<AuthenticatedClientSession | null> {
      const user = await repository.findByUsername(username);
      return await createSession(user, password, now, verify);
    }
  };
}

async function createSession(
  user: Awaited<ReturnType<UserRepository["findByUsername"]>>,
  password: string,
  now: Date,
  verify: typeof verifyPassword
): Promise<AuthenticatedClientSession | null> {
  const passwordMatches = await verify(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.isActive || !passwordMatches) return null;

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
