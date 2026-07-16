import { createDecipheriv } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { authorizeB2, downloadB2File } from "./b2-native.mjs";
import {
  deriveEncryptionKey,
  parseEncryptionEnvelope,
  postgresEnvironment,
  validateB2BackupEnvironment,
  validateIsolatedRestoreTarget,
  validateRestoreObjectKey
} from "./backup-core.mjs";

function fail(message) {
  throw new Error(`Arcigy restore failed: ${message}`);
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`);
}

function runCapture(command, args, env) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (value) => { stdout = `${stdout}${value}`.slice(-2_000_000); });
  child.stderr.on("data", (value) => { stderr = `${stderr}${value}`.slice(-2000); });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with ${code ?? signal}: ${stderr.replace(/\s+/gu, " ").trim()}`));
    });
  });
}

async function readEnvelope(filePath) {
  const handle = await open(filePath, "r");
  try {
    const fixed = Buffer.alloc(12);
    await handle.read(fixed, 0, fixed.length, 0);
    const headerLength = fixed.readUInt32BE(8);
    if (headerLength < 1 || headerLength > 8 * 1024) fail("encrypted backup has an invalid header length.");
    const header = Buffer.alloc(12 + headerLength);
    await handle.read(header, 0, header.length, 0);
    const parsed = parseEncryptionEnvelope(header);
    return { header, ...parsed };
  } finally {
    await handle.close();
  }
}

async function decryptArchive(encryptedPath, archivePath, passphrase) {
  const encryptedStats = await stat(encryptedPath);
  const envelope = await readEnvelope(encryptedPath);
  if (encryptedStats.size < envelope.ciphertextOffset + 16) fail("encrypted backup is truncated.");
  const iv = Buffer.from(envelope.metadata.iv, "base64");
  if (iv.length !== 12) fail("encrypted backup IV is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(envelope.metadata, passphrase), iv);
  decipher.setAAD(envelope.header);
  const tag = Buffer.alloc(16);
  const handle = await open(encryptedPath, "r");
  try {
    await handle.read(tag, 0, tag.length, encryptedStats.size - tag.length);
  } finally {
    await handle.close();
  }
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(encryptedPath, { start: envelope.ciphertextOffset, end: encryptedStats.size - tag.length - 1 }),
    decipher,
    createWriteStream(archivePath, { mode: 0o600 })
  );
  return stat(archivePath);
}

export async function runRestoreVerification(env = process.env) {
  const config = validateB2BackupEnvironment(env);
  const objectKey = validateRestoreObjectKey(env.ARCIGY_RESTORE_OBJECT_KEY || "", config.prefix);
  const session = await authorizeB2(config, "restore");
  const directory = await mkdtemp(path.join(tmpdir(), "arcigy-restore-"));
  const encryptedPath = path.join(directory, "backup.pgdump.arcigy");
  const archivePath = path.join(directory, "backup.pgdump");
  await chmod(directory, 0o700);
  try {
    const response = await downloadB2File(session, config.bucket, objectKey);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(encryptedPath, { mode: 0o600 }));
    const archiveStats = await decryptArchive(encryptedPath, archivePath, config.encryptionPassphrase);
    const listing = await runCapture("pg_restore", ["--list", archivePath], {});
    const archiveEntries = listing.split(/\r?\n/u).filter((line) => line.trim() && !line.startsWith(";")).length;
    if (archiveEntries === 0) fail("pg_restore found no archive entries.");
    const result = { objectKey, encryptedBytes: (await stat(encryptedPath)).size, archiveBytes: archiveStats.size, archiveEntries };
    if (env.ARCIGY_RESTORE_EXECUTE === "true") {
      const target = validateIsolatedRestoreTarget(env.ARCIGY_RESTORE_TARGET_DATABASE_URL || "", env.ARCIGY_RESTORE_ISOLATED);
      await runCapture("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", target.database, archivePath], postgresEnvironment(target));
      log("arcigy_restore_completed", { ...result, target: "isolated_loopback", restored: true });
    } else {
      log("arcigy_restore_verified", { ...result, restored: false });
    }
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runRestoreVerification();
}
