import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const HASH_PREFIX = "scrypt";
const HASH_VERSION = "v1";
const KEY_LENGTH = 64;

export async function hashPassword(password: string, salt = randomBytes(16).toString("base64url")): Promise<string> {
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return [HASH_PREFIX, HASH_VERSION, salt, derived.toString("base64url")].join("$");
}

export function hashPasswordSync(password: string, salt = randomBytes(16).toString("base64url")): string {
  const derived = scryptSync(password, salt, KEY_LENGTH) as Buffer;
  return [HASH_PREFIX, HASH_VERSION, salt, derived.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [prefix, version, salt, expectedKey] = passwordHash.split("$");
  if (prefix !== HASH_PREFIX || version !== HASH_VERSION || !salt || !expectedKey) return false;

  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(expectedKey, "base64url");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
