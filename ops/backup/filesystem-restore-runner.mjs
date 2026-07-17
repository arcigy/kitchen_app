import { createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { deriveEncryptionKey, parseEncryptionEnvelope } from "./backup-core.mjs";
import { buildIsolatedDatabaseRestoreScript, selectLatestFilesystemBackup, validateFilesystemRestoreEnvironment } from "./filesystem-backup-core.mjs";

function fail(message) {
  throw new Error(`Arcigy filesystem restore failed: ${message}`);
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`);
}

async function readEnvelope(filePath) {
  const handle = await open(filePath, "r");
  try {
    const fixed = Buffer.alloc(12);
    const fixedRead = await handle.read(fixed, 0, fixed.length, 0);
    if (fixedRead.bytesRead !== fixed.length) fail("encrypted backup header is truncated.");
    const headerLength = fixed.readUInt32BE(8);
    if (headerLength < 1 || headerLength > 8 * 1024) fail("encrypted backup has an invalid header length.");
    const header = Buffer.alloc(12 + headerLength);
    const headerRead = await handle.read(header, 0, header.length, 0);
    if (headerRead.bytesRead !== header.length) fail("encrypted backup header is truncated.");
    return { header, ...parseEncryptionEnvelope(header) };
  } finally {
    await handle.close();
  }
}

function spawnIsolatedRestore(config, script) {
  const encoded = Buffer.from(script, "utf8").toString("base64");
  const remoteCommand = `sh -c "$(printf %s '${encoded}' | base64 -d)"`;
  const child = spawn("ssh", [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${config.ssh.knownHosts}`,
    "-o", "ConnectTimeout=15",
    `${config.ssh.user}@${config.ssh.host}`,
    remoteCommand
  ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (value) => { stdout = `${stdout}${value}`.slice(-20_000); });
  child.stderr.on("data", (value) => { stderr = `${stderr}${value}`.slice(-2000); });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ssh isolated restore exited with ${code ?? signal}: ${stderr.replace(/\s+/gu, " ").trim()}`));
    });
  });
  return { child, done };
}

export async function runFilesystemRestoreVerification(env = process.env) {
  const config = validateFilesystemRestoreEnvironment(env);
  const artifactPath = config.selectLatest ? await selectLatestFilesystemBackup(config.targetRoot) : config.artifactPath;
  const fileStats = await stat(artifactPath);
  const envelope = await readEnvelope(artifactPath);
  if (fileStats.size < envelope.ciphertextOffset + 16) fail("encrypted backup is truncated.");
  const iv = Buffer.from(envelope.metadata.iv || "", "base64");
  if (iv.length !== 12) fail("encrypted backup IV is invalid.");
  const tag = Buffer.alloc(16);
  const handle = await open(artifactPath, "r");
  try {
    const tagRead = await handle.read(tag, 0, tag.length, fileStats.size - tag.length);
    if (tagRead.bytesRead !== tag.length) fail("encrypted backup authentication tag is truncated.");
  } finally {
    await handle.close();
  }
  const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(envelope.metadata, config.encryptionPassphrase), iv);
  decipher.setAAD(envelope.header);
  decipher.setAuthTag(tag);
  const restoreId = randomBytes(8).toString("hex");
  const remote = spawnIsolatedRestore(config, buildIsolatedDatabaseRestoreScript(restoreId));
  const startedAt = Date.now();
  try {
    await pipeline(
      createReadStream(artifactPath, { start: envelope.ciphertextOffset, end: fileStats.size - tag.length - 1 }),
      decipher,
      remote.child.stdin
    );
    const output = await remote.done;
    const line = output.trim().split(/\r?\n/u).findLast((value) => value.startsWith("{"));
    if (!line) fail("isolated restore returned no verification evidence.");
    const evidence = JSON.parse(line);
    if (evidence?.restored !== true || evidence.target !== "isolated_ephemeral_container" || evidence.tables < 1 || evidence.migrations < 1
      || !Number.isSafeInteger(evidence.totalRows) || evidence.totalRows < 1 || !/^[a-f0-9]{64}$/u.test(evidence.rowCountSha256 || "")) {
      fail("isolated restore evidence is incomplete.");
    }
    const result = { ...evidence, encryptedBytes: fileStats.size, rtoSeconds: Math.ceil((Date.now() - startedAt) / 1000) };
    log("arcigy_filesystem_restore_completed", result);
    return result;
  } catch (error) {
    remote.child.kill();
    await remote.done.catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runFilesystemRestoreVerification();
  } catch (error) {
    log("arcigy_filesystem_restore_failed", { message: error instanceof Error ? error.message.slice(0, 500) : "unknown" });
    process.exitCode = 1;
  }
}
