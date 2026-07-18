import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const BACKUP_MAGIC = Buffer.from("ARCIGYB1", "ascii");
export const BACKUP_VERSION = 1;
export const REQUIRED_B2_CAPABILITIES = Object.freeze(["listFiles", "readFiles", "writeFiles"]);
export const REQUIRED_B2_RESTORE_CAPABILITIES = Object.freeze(["listFiles", "readFiles"]);
export const FORBIDDEN_B2_CAPABILITIES = Object.freeze([
  "deleteFiles",
  "bypassGovernance",
  "writeKeys",
  "deleteKeys",
  "writeBuckets",
  "deleteBuckets",
  "writeBucketEncryption",
  "writeBucketRetentions",
  "writeFileLegalHolds",
  "writeFileRetentions"
]);

const MAX_HEADER_BYTES = 8 * 1024;

function fail(message) {
  throw new Error(`Arcigy backup configuration error: ${message}`);
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function positiveInteger(value, name, minimum, maximum) {
  if (!/^[0-9]+$/u.test(value)) fail(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function safePrefix(value) {
  const normalized = value.replace(/^\/+|\/+$/gu, "");
  if (!normalized || normalized.split("/").some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(part))) {
    fail("ARCIGY_BACKUP_OBJECT_PREFIX contains an unsafe path segment.");
  }
  return normalized;
}

export function parseDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.username || url.pathname === "/") {
    fail("DATABASE_URL must include PostgreSQL host, user, and database.");
  }
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    sslmode: url.searchParams.get("sslmode") || "prefer"
  };
}

export function validateB2BackupEnvironment(env = process.env) {
  const bucket = required(env, "ARCIGY_BACKUP_B2_BUCKET");
  if (!/^[a-z0-9][a-z0-9-]{4,61}[a-z0-9]$/u.test(bucket)) fail("ARCIGY_BACKUP_B2_BUCKET is invalid.");
  const config = {
    bucket,
    keyId: required(env, "ARCIGY_BACKUP_B2_KEY_ID"),
    applicationKey: required(env, "ARCIGY_BACKUP_B2_APPLICATION_KEY"),
    encryptionPassphrase: required(env, "ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE"),
    prefix: safePrefix(env.ARCIGY_BACKUP_OBJECT_PREFIX || "arcigy/prod/postgres"),
    intervalMinutes: positiveInteger(env.ARCIGY_BACKUP_INTERVAL_MINUTES || "360", "ARCIGY_BACKUP_INTERVAL_MINUTES", 15, 1440),
    partBytes: positiveInteger(env.ARCIGY_BACKUP_PART_BYTES || String(10 * 1024 * 1024), "ARCIGY_BACKUP_PART_BYTES", 5 * 1024 * 1024, 100 * 1024 * 1024)
  };
  if (Buffer.byteLength(config.encryptionPassphrase, "utf8") < 24) {
    fail("ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE must be at least 24 bytes.");
  }
  return config;
}

export function validateBackupEnvironment(env = process.env) {
  return { ...validateB2BackupEnvironment(env), database: parseDatabaseUrl(required(env, "DATABASE_URL")) };
}

export function postgresEnvironment(database) {
  return {
    PGHOST: database.host,
    PGPORT: database.port,
    PGUSER: database.user,
    PGPASSWORD: database.password,
    PGDATABASE: database.database,
    PGSSLMODE: database.sslmode
  };
}

export function validateB2Authorization(authorization, expectedBucket, purpose = "writer") {
  const allowed = authorization?.apiInfo?.storageApi?.allowed || authorization?.allowed;
  if (!allowed || !Array.isArray(allowed.capabilities)) fail("B2 authorization response lacks allowed capabilities.");
  const capabilities = new Set(allowed.capabilities);
  const requiredCapabilities = purpose === "restore" ? REQUIRED_B2_RESTORE_CAPABILITIES : REQUIRED_B2_CAPABILITIES;
  const missing = requiredCapabilities.filter((capability) => !capabilities.has(capability));
  if (missing.length > 0) fail(`B2 application key lacks: ${missing.join(", ")}.`);
  const forbidden = FORBIDDEN_B2_CAPABILITIES.filter((capability) => capabilities.has(capability));
  if (forbidden.length > 0) fail(`B2 application key is over-privileged: ${forbidden.join(", ")}.`);
  const buckets = Array.isArray(allowed.buckets) ? allowed.buckets : [];
  const bucket = buckets.find((item) => item?.name === expectedBucket);
  const bucketName = allowed.bucketName || bucket?.name;
  if (bucketName !== expectedBucket || (buckets.length > 0 && buckets.length !== 1)) fail("B2 application key is not restricted to the configured backup bucket.");
  const prefix = allowed.namePrefix || allowed.buckets?.[0]?.namePrefix || "";
  if (!prefix.startsWith("arcigy/prod/")) fail("B2 application key must be restricted to the Arcigy production backup namespace.");
  return { bucketId: allowed.bucketId || bucket?.id, bucketName, prefix };
}

export function createEncryptionEnvelope(passphrase, createdAt = new Date().toISOString()) {
  const salt = randomBytes(32);
  const iv = randomBytes(12);
  const header = Buffer.from(JSON.stringify({
    version: BACKUP_VERSION,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    createdAt
  }), "utf8");
  if (header.length > MAX_HEADER_BYTES) fail("encrypted backup header exceeds the safe limit.");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  return {
    header: Buffer.concat([BACKUP_MAGIC, length, header]),
    key: scryptSync(passphrase, salt, 32, { maxmem: 128 * 1024 * 1024 }),
    iv,
    metadata: JSON.parse(header.toString("utf8"))
  };
}

export function deriveEncryptionKey(metadata, passphrase) {
  const salt = Buffer.from(metadata?.salt || "", "base64");
  if (salt.length !== 32) fail("backup envelope key material is invalid.");
  return scryptSync(passphrase, salt, 32, { maxmem: 128 * 1024 * 1024 });
}

export function parseEncryptionEnvelope(value) {
  const source = Buffer.from(value);
  if (source.length < BACKUP_MAGIC.length + 4 || !source.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    fail("backup does not have an Arcigy encrypted envelope.");
  }
  const headerLength = source.readUInt32BE(BACKUP_MAGIC.length);
  if (headerLength < 1 || headerLength > MAX_HEADER_BYTES || source.length < BACKUP_MAGIC.length + 4 + headerLength) {
    fail("backup envelope header is invalid.");
  }
  let metadata;
  try {
    metadata = JSON.parse(source.subarray(BACKUP_MAGIC.length + 4, BACKUP_MAGIC.length + 4 + headerLength).toString("utf8"));
  } catch {
    fail("backup envelope header is not JSON.");
  }
  if (metadata?.version !== BACKUP_VERSION || metadata.algorithm !== "aes-256-gcm" || metadata.kdf !== "scrypt") {
    fail("backup envelope algorithm is unsupported.");
  }
  return { metadata, ciphertextOffset: BACKUP_MAGIC.length + 4 + headerLength };
}

export function encryptBackupPayload(plaintext, passphrase, createdAt) {
  const envelope = createEncryptionEnvelope(passphrase, createdAt);
  const cipher = createCipheriv("aes-256-gcm", envelope.key, envelope.iv);
  cipher.setAAD(envelope.header);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([envelope.header, ciphertext, cipher.getAuthTag()]);
}

export function decryptBackupPayload(value, passphrase) {
  const source = Buffer.from(value);
  const parsed = parseEncryptionEnvelope(source);
  if (source.length < parsed.ciphertextOffset + 16) fail("backup ciphertext is incomplete.");
  const iv = Buffer.from(parsed.metadata.iv, "base64");
  if (iv.length !== 12) fail("backup envelope key material is invalid.");
  const key = deriveEncryptionKey(parsed.metadata, passphrase);
  const tag = source.subarray(source.length - 16);
  const ciphertext = source.subarray(parsed.ciphertextOffset, source.length - 16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(source.subarray(0, parsed.ciphertextOffset));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    fail("backup authentication failed.");
  }
}

export function buildBackupObjectKey(prefix, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/gu, "-");
  return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}/${stamp}-postgres.pgdump.arcigy`;
}

export function validateRestoreObjectKey(value, prefix) {
  const normalized = value.replace(/^\/+|\/+$/gu, "");
  if (!normalized.startsWith(`${prefix}/`) || !normalized.endsWith(".pgdump.arcigy") || normalized.split("/").some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(part))) {
    fail("ARCIGY_RESTORE_OBJECT_KEY is outside the approved backup namespace.");
  }
  return normalized;
}

export function validateIsolatedRestoreTarget(value, isolatedAcknowledged) {
  if (isolatedAcknowledged !== "true") fail("ARCIGY_RESTORE_ISOLATED=true is required.");
  const database = parseDatabaseUrl(value);
  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  if (!loopbackHosts.has(database.host.toLowerCase()) || !database.database.startsWith("arcigy_restore_")) {
    fail("restore target must be a new loopback database named arcigy_restore_*.");
  }
  return database;
}
