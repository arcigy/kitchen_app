import { describe, expect, it, vi } from "vitest";
import { authorizeB2 } from "./b2-native.mjs";
import { hasExclusiveAdvisoryLock } from "./backup-runner.mjs";
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
});
