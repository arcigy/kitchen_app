import { describe, expect, it, vi } from "vitest";
import { authorizeB2 } from "./b2-native.mjs";
import { hasExclusiveAdvisoryLock } from "./backup-runner.mjs";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { encryptReadableToFile } from "./filesystem-backup-runner.mjs";
import {
  buildFilesystemBackupPath,
  buildIsolatedDatabaseRestoreScript,
  buildProductionDumpScript,
  selectLatestFilesystemBackup,
  validateFilesystemBackupEnvironment,
  validateFilesystemRestoreEnvironment
} from "./filesystem-backup-core.mjs";
import {
  BACKUP_MAGIC,
  buildBackupObjectKey,
  createEncryptionEnvelope,
  decryptBackupPayload,
  encryptBackupPayload,
  parseEncryptionEnvelope,
  validateB2Authorization,
  validateBackupEnvironment,
  validateIsolatedRestoreTarget,
  validateRestoreObjectKey
} from "./backup-core.mjs";

const safeEnvironment = {
  DATABASE_URL: "postgresql://backup_user:example-password@postgres.internal:5432/kitchenapp?sslmode=require",
  ARCIGY_BACKUP_B2_BUCKET: "arcigy-kitchen-backup-2026",
  ARCIGY_BACKUP_B2_KEY_ID: "example-key-id",
  ARCIGY_BACKUP_B2_APPLICATION_KEY: "example-application-key",
  ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE: "only-a-test-passphrase-with-enough-bytes",
  ARCIGY_BACKUP_OBJECT_PREFIX: "arcigy/prod/postgres",
  ARCIGY_BACKUP_INTERVAL_MINUTES: "360"
};

describe("Arcigy off-host backup contract", () => {
  it("accepts only a bounded, valid backup runtime configuration", () => {
    const config = validateBackupEnvironment(safeEnvironment);
    expect(config.database.password).toBe("example-password");
    expect(config.intervalMinutes).toBe(360);
    expect(() => validateBackupEnvironment({ ...safeEnvironment, ARCIGY_BACKUP_INTERVAL_MINUTES: "2" })).toThrow(/between 15 and 1440/);
    expect(() => validateBackupEnvironment({ ...safeEnvironment, ARCIGY_BACKUP_OBJECT_PREFIX: "../other-tenant" })).toThrow(/unsafe path/);
  });

  it("requires a bucket-restricted B2 writer with no deletion or administration rights", () => {
    const authorization = { apiInfo: { storageApi: { allowed: { buckets: [{ id: "bucket-id", name: safeEnvironment.ARCIGY_BACKUP_B2_BUCKET }], namePrefix: "arcigy/prod/", capabilities: ["listFiles", "readFiles", "writeFiles"] } } } };
    expect(validateB2Authorization(authorization, safeEnvironment.ARCIGY_BACKUP_B2_BUCKET)).toMatchObject({ bucketId: "bucket-id" });
    const allowed = authorization.apiInfo.storageApi.allowed;
    expect(() => validateB2Authorization({ apiInfo: { storageApi: { allowed: { ...allowed, capabilities: [...allowed.capabilities, "deleteFiles"] } } } }, safeEnvironment.ARCIGY_BACKUP_B2_BUCKET)).toThrow(/over-privileged/);
    expect(() => validateB2Authorization({ apiInfo: { storageApi: { allowed: { ...allowed, buckets: [{ id: "other", name: "other-bucket" }] } } } }, safeEnvironment.ARCIGY_BACKUP_B2_BUCKET)).toThrow(/not restricted/);
  });

  it("writes a bounded, parseable authenticated-encryption envelope", () => {
    const envelope = createEncryptionEnvelope(safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE, "2026-07-16T00:00:00.000Z");
    expect(envelope.header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)).toBe(true);
    expect(parseEncryptionEnvelope(envelope.header)).toMatchObject({ metadata: { version: 1, algorithm: "aes-256-gcm" } });
    const encrypted = encryptBackupPayload(Buffer.from("synthetic pg_dump fixture"), safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE, "2026-07-16T00:00:00.000Z");
    expect(decryptBackupPayload(encrypted, safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE).toString("utf8")).toBe("synthetic pg_dump fixture");
    encrypted[encrypted.length - 1] ^= 1;
    expect(() => decryptBackupPayload(encrypted, safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE)).toThrow(/authentication failed/);
  });

  it("uses a non-tenant, sortable object path", () => {
    expect(buildBackupObjectKey("arcigy/prod/postgres", new Date("2026-07-16T12:34:56.789Z"))).toBe("arcigy/prod/postgres/2026/07/16/2026-07-16T12-34-56-789Z-postgres.pgdump.arcigy");
  });

  it("treats only PostgreSQL's positive lock response as exclusive access", () => {
    expect(hasExclusiveAdvisoryLock("t\n")).toBe(true);
    expect(hasExclusiveAdvisoryLock("f\n")).toBe(false);
    expect(hasExclusiveAdvisoryLock("unexpected")).toBe(false);
  });

  it("allows restore only for a selected object and a newly named loopback database", () => {
    expect(validateRestoreObjectKey("arcigy/prod/postgres/2026/07/16/test.pgdump.arcigy", "arcigy/prod/postgres")).toContain("2026/07/16");
    expect(() => validateRestoreObjectKey("other-tenant/backup.pgdump.arcigy", "arcigy/prod/postgres")).toThrow(/outside the approved/);
    expect(validateIsolatedRestoreTarget("postgresql://restore:password@127.0.0.1:5432/arcigy_restore_drill", "true")).toMatchObject({ database: "arcigy_restore_drill" });
    expect(() => validateIsolatedRestoreTarget("postgresql://restore:password@db.internal:5432/arcigy_restore_drill", "true")).toThrow(/loopback/);
    expect(() => validateIsolatedRestoreTarget("postgresql://restore:password@127.0.0.1:5432/kitchenapp", "true")).toThrow(/arcigy_restore/);
  });

  it("reads the current B2 v4 nested authorization shape before uploading", async () => {
    const response = {
      authorizationToken: "test-token",
      apiInfo: {
        storageApi: {
          apiUrl: "https://api.example.invalid",
          downloadUrl: "https://download.example.invalid",
          allowed: {
            buckets: [{ id: "bucket-id", name: safeEnvironment.ARCIGY_BACKUP_B2_BUCKET }],
            namePrefix: "arcigy/prod/",
            capabilities: ["listFiles", "readFiles", "writeFiles"]
          }
        }
      }
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    try {
      await expect(authorizeB2(validateBackupEnvironment(safeEnvironment))).resolves.toMatchObject({ bucketId: "bucket-id", apiUrl: "https://api.example.invalid" });
      expect(globalThis.fetch).toHaveBeenCalledWith("https://api.backblazeb2.com/b2api/v4/b2_authorize_account", expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /u) }) }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("validates an acknowledged absolute filesystem target and contained restore artifact", () => {
    const root = path.resolve("C:/Arcigy Backups/Production");
    const artifact = buildFilesystemBackupPath(root, new Date("2026-07-17T12:34:56.789Z"));
    const env = {
      ARCIGY_BACKUP_OFFSITE_ACK: "true",
      ARCIGY_BACKUP_TARGET_ROOT: root,
      ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE: safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE,
      ARCIGY_BACKUP_SSH_HOST: "178.104.175.242",
      ARCIGY_BACKUP_SSH_USER: "root",
      ARCIGY_BACKUP_SSH_KNOWN_HOSTS: path.resolve("C:/Arcigy/.ssh-known-hosts"),
      ARCIGY_RESTORE_ISOLATED: "true",
      ARCIGY_RESTORE_FILE: artifact
    };
    expect(validateFilesystemBackupEnvironment(env)).toMatchObject({ targetRoot: root, intervalHours: 24 });
    expect(validateFilesystemRestoreEnvironment(env).artifactPath).toBe(artifact);
    expect(validateFilesystemRestoreEnvironment({ ...env, ARCIGY_RESTORE_FILE: "", ARCIGY_RESTORE_LATEST: "true" })).toMatchObject({ selectLatest: true, artifactPath: undefined });
    expect(artifact.replaceAll("\\", "/")).toContain("2026/07/17/2026-07-17T12-34-56-789Z-postgres-prod.pgdump.arcigy");
    expect(() => validateFilesystemRestoreEnvironment({ ...env, ARCIGY_RESTORE_FILE: path.resolve(root, "../other.pgdump.arcigy") })).toThrow(/inside ARCIGY_BACKUP_TARGET_ROOT/);
    expect(() => validateFilesystemBackupEnvironment({ ...env, ARCIGY_BACKUP_OFFSITE_ACK: "false" })).toThrow(/OFFSITE_ACK/);
  });

  it("uses fixed production and isolated restore service contracts", () => {
    const dump = buildProductionDumpScript();
    expect(dump).toContain("srv-captain--kitchenapp-db");
    expect(dump).toContain("--schema=prod");
    expect(dump).toContain("--format=custom");
    expect(dump).toContain("flock --nonblock /tmp/arcigy-production-backup.lock");
    expect(dump).not.toContain("ARCIGY_BACKUP");
    const restore = buildIsolatedDatabaseRestoreScript("0123456789abcdef");
    expect(restore).toContain("--network none");
    expect(restore).toContain("com.arcigy.restore-drill=true");
    expect(restore).toContain("postgres:16-alpine");
    expect(restore).toContain("docker rm -f");
    expect(restore).toContain("rowCountSha256");
    expect(restore).not.toContain("kitchenapp\"");
  });

  it("streams an authenticated filesystem artifact without plaintext temp output", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arcigy-filesystem-backup-test-"));
    const targetPath = path.join(directory, "synthetic.pgdump.arcigy");
    const plaintext = Buffer.from("synthetic production pg_dump fixture");
    try {
      const result = await encryptReadableToFile({
        readable: Readable.from([plaintext.subarray(0, 10), plaintext.subarray(10)]),
        targetPath,
        passphrase: safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE
      });
      const encrypted = await readFile(targetPath);
      expect(result.plaintextBytes).toBe(plaintext.length);
      expect(result.encryptedBytes).toBe(encrypted.length);
      expect(decryptBackupPayload(encrypted, safeEnvironment.ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE)).toEqual(plaintext);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("selects only the lexically latest completed encrypted database artifact", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "arcigy-filesystem-latest-test-"));
    try {
      const olderDirectory = path.join(directory, "2026", "07", "16");
      const newerDirectory = path.join(directory, "2026", "07", "17");
      await mkdir(olderDirectory, { recursive: true });
      await mkdir(newerDirectory, { recursive: true });
      await writeFile(path.join(olderDirectory, "2026-07-16T00-00-00-000Z-postgres-prod.pgdump.arcigy"), "older");
      const newest = path.join(newerDirectory, "2026-07-17T00-00-00-000Z-postgres-prod.pgdump.arcigy");
      await writeFile(newest, "newest");
      await writeFile(`${newest}.partial-test`, "partial");
      await expect(selectLatestFilesystemBackup(directory)).resolves.toBe(newest);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
