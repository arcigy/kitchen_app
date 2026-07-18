import { createCipheriv, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { authorizeB2, b2ApiCall } from "./b2-native.mjs";
import {
  buildBackupObjectKey,
  createEncryptionEnvelope,
  postgresEnvironment,
  validateBackupEnvironment
} from "./backup-core.mjs";

const ADVISORY_LOCK = "318224719";

function fail(message) {
  throw new Error(`Arcigy backup failed: ${message}`);
}

function log(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`);
}

async function getPartUploadUrl(session, fileId) {
  return b2ApiCall(session, "b2_get_upload_part_url", { fileId });
}

async function uploadPart(upload, partNumber, bytes) {
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  const response = await fetch(upload.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: upload.authorizationToken,
      "Content-Length": String(bytes.length),
      "X-Bz-Part-Number": String(partNumber),
      "X-Bz-Content-Sha1": sha1
    },
    body: bytes,
    signal: AbortSignal.timeout(10 * 60_000)
  });
  if (!response.ok) fail(`B2 upload part ${partNumber} returned HTTP ${response.status}.`);
  return sha1;
}

function run(command, args, env, stdin = "ignore") {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: [stdin, "pipe", "pipe"], windowsHide: true });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (value) => { stderr = `${stderr}${value}`.slice(-2000); });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}: ${stderr.replace(/\s+/gu, " ").trim()}`));
    });
  });
  return { child, done };
}

export function hasExclusiveAdvisoryLock(output) {
  return output.trim() === "t";
}

async function withDatabaseLock(config, callback) {
  const env = postgresEnvironment(config.database);
  const acquire = run("psql", ["-At"], env, "pipe");
  let output = "";
  acquire.child.stdout.setEncoding("utf8");
  acquire.child.stdout.on("data", (value) => { output += value; });
  await new Promise((resolve, reject) => {
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      acquire.child.stdout.off("data", onData);
      callback(value);
    };
    const onData = () => {
      if (/^(t|f)\s*$/mu.test(output)) {
        settle(resolve);
      }
    };
    acquire.child.stdout.on("data", onData);
    acquire.child.once("error", (error) => settle(reject, error));
    acquire.child.once("exit", (code, signal) => settle(reject, new Error(`psql exited with ${code ?? signal} before acquiring the backup lock.`)));
    acquire.child.stdin.write(`SELECT pg_try_advisory_lock(${ADVISORY_LOCK});\n`);
  });
  if (!hasExclusiveAdvisoryLock(output)) {
    acquire.child.stdin.end("\\q\n");
    await acquire.done;
    log("arcigy_backup_skipped", { reason: "another_backup_holds_database_lock" });
    return undefined;
  }
  try {
    return await callback(env);
  } finally {
    acquire.child.stdin.end(`SELECT pg_advisory_unlock(${ADVISORY_LOCK});\n\\q\n`);
    await acquire.done.catch(() => undefined);
  }
}

async function streamEncryptedDump(config, session, pgEnv) {
  const objectKey = buildBackupObjectKey(config.prefix);
  const started = await b2ApiCall(session, "b2_start_large_file", {
    bucketId: session.bucketId,
    fileName: objectKey,
    contentType: "application/octet-stream",
    fileInfo: { "arcigy-backup-format": "arcigy-aes256gcm-v1", "arcigy-source": "postgres" }
  });
  if (!started.fileId) fail("B2 did not return a large-file ID.");
  const envelope = createEncryptionEnvelope(config.encryptionPassphrase);
  const cipher = createCipheriv("aes-256-gcm", envelope.key, envelope.iv);
  cipher.setAAD(envelope.header);
  const dump = run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges"], pgEnv);
  const plainHash = createHash("sha256");
  let buffered = Buffer.from(envelope.header);
  let encryptedBytes = buffered.length;
  const partSha1s = [];
  let upload;

  async function uploadNonFinalParts() {
    while (buffered.length >= config.partBytes * 2) {
      const part = buffered.subarray(0, config.partBytes);
      buffered = buffered.subarray(config.partBytes);
      upload ??= await getPartUploadUrl(session, started.fileId);
      partSha1s.push(await uploadPart(upload, partSha1s.length + 1, part));
    }
  }

  try {
    for await (const source of dump.child.stdout) {
      const plaintext = Buffer.from(source);
      plainHash.update(plaintext);
      const ciphertext = cipher.update(plaintext);
      encryptedBytes += ciphertext.length;
      buffered = Buffer.concat([buffered, ciphertext]);
      await uploadNonFinalParts();
    }
    await dump.done;
    const finalCiphertext = Buffer.concat([cipher.final(), cipher.getAuthTag()]);
    encryptedBytes += finalCiphertext.length;
    buffered = Buffer.concat([buffered, finalCiphertext]);
    upload ??= await getPartUploadUrl(session, started.fileId);
    partSha1s.push(await uploadPart(upload, partSha1s.length + 1, buffered));
    const completed = await b2ApiCall(session, "b2_finish_large_file", { fileId: started.fileId, partSha1Array: partSha1s });
    return { objectKey, fileId: completed.fileId || started.fileId, encryptedBytes, plainSha256: plainHash.digest("hex"), partCount: partSha1s.length };
  } catch (error) {
    await b2ApiCall(session, "b2_cancel_large_file", { fileId: started.fileId }).catch(() => undefined);
    throw error;
  }
}

export async function runBackupOnce(env = process.env) {
  const config = validateBackupEnvironment(env);
  return withDatabaseLock(config, async (pgEnv) => {
    const session = await authorizeB2(config);
    const result = await streamEncryptedDump(config, session, pgEnv);
    log("arcigy_backup_completed", result);
    return result;
  });
}

export async function runScheduledBackups(env = process.env) {
  const config = validateBackupEnvironment(env);
  const intervalMs = config.intervalMinutes * 60_000;
  const run = async () => {
    try { await runBackupOnce(env); }
    catch (error) { log("arcigy_backup_failed", { message: error instanceof Error ? error.message.slice(0, 500) : "unknown" }); }
  };
  await run();
  setInterval(run, intervalMs).unref();
  await new Promise(() => {});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runScheduledBackups();
}
