import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildFilesystemBackupPath, buildProductionDumpScript, validateFilesystemBackupEnvironment } from "./filesystem-backup-core.mjs";
import { createEncryptionEnvelope } from "./backup-core.mjs";

function fail(message) {
  throw new Error(`Arcigy filesystem backup failed: ${message}`);
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`);
}

function sshArgs(config, remoteCommand = "sh -s") {
  return [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", `UserKnownHostsFile=${config.ssh.knownHosts}`,
    "-o", "ConnectTimeout=15",
    `${config.ssh.user}@${config.ssh.host}`,
    remoteCommand
  ];
}

function spawnProductionDump(config) {
  const child = spawn("ssh", sshArgs(config), { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (value) => { stderr = `${stderr}${value}`.slice(-2000); });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`ssh backup source exited with ${code ?? signal}: ${stderr.replace(/\s+/gu, " ").trim()}`));
    });
  });
  child.stdin.end(buildProductionDumpScript());
  return { readable: child.stdout, done, terminate: () => child.kill() };
}

async function writeAll(handle, value) {
  let offset = 0;
  while (offset < value.length) {
    const result = await handle.write(value, offset, value.length - offset);
    if (result.bytesWritten < 1) fail("encrypted artifact write made no progress.");
    offset += result.bytesWritten;
  }
}

export async function encryptReadableToFile({ readable, sourceDone = Promise.resolve(), targetPath, passphrase }) {
  const partialPath = `${targetPath}.partial-${randomBytes(8).toString("hex")}`;
  const envelope = createEncryptionEnvelope(passphrase);
  const cipher = createCipheriv("aes-256-gcm", envelope.key, envelope.iv);
  cipher.setAAD(envelope.header);
  const plaintextHash = createHash("sha256");
  const encryptedHash = createHash("sha256");
  let plaintextBytes = 0;
  let encryptedBytes = 0;
  let handle;
  try {
    await mkdir(path.dirname(targetPath), { recursive: true });
    handle = await open(partialPath, "wx", 0o600);
    await writeAll(handle, envelope.header);
    encryptedHash.update(envelope.header);
    encryptedBytes += envelope.header.length;
    for await (const value of readable) {
      const plaintext = Buffer.from(value);
      plaintextHash.update(plaintext);
      plaintextBytes += plaintext.length;
      const ciphertext = cipher.update(plaintext);
      if (ciphertext.length > 0) {
        await writeAll(handle, ciphertext);
        encryptedHash.update(ciphertext);
        encryptedBytes += ciphertext.length;
      }
    }
    await sourceDone;
    if (plaintextBytes === 0) fail("production dump stream was empty.");
    const finalBytes = Buffer.concat([cipher.final(), cipher.getAuthTag()]);
    await writeAll(handle, finalBytes);
    encryptedHash.update(finalBytes);
    encryptedBytes += finalBytes.length;
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(partialPath, targetPath);
    return {
      plaintextBytes,
      encryptedBytes,
      plaintextSha256: plaintextHash.digest("hex"),
      encryptedSha256: encryptedHash.digest("hex")
    };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(partialPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function runFilesystemBackupOnce(env = process.env, now = new Date()) {
  const config = validateFilesystemBackupEnvironment(env);
  await access(config.ssh.knownHosts, constants.R_OK);
  const targetPath = buildFilesystemBackupPath(config.targetRoot, now);
  const source = spawnProductionDump(config);
  try {
    const result = await encryptReadableToFile({
      readable: source.readable,
      sourceDone: source.done,
      targetPath,
      passphrase: config.encryptionPassphrase
    });
    const relativePath = path.relative(config.targetRoot, targetPath).replaceAll("\\", "/");
    log("arcigy_filesystem_backup_completed", { ...result, relativePath, source: "postgres_prod" });
    return { ...result, targetPath, relativePath };
  } catch (error) {
    source.terminate();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runFilesystemBackupOnce();
  } catch (error) {
    log("arcigy_filesystem_backup_failed", { message: error instanceof Error ? error.message.slice(0, 500) : "unknown" });
    process.exitCode = 1;
  }
}
