import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  RESTORE_DRILL_SCHEMA,
  assertEquivalentRestoreEvidence,
  createDisposableDatabaseNames,
  resolvePortablePostgresBin,
  resolveRestoreDrillConfig
} from "./postgresRestoreDrillConfig";
import {
  RESTORE_DRILL_POSTGRES_USER,
  collectRestoreDrillEvidence,
  runRestoreDrillMigrations,
  seedSyntheticArcigyData
} from "./runPostgresRestoreDrill";

const COMMAND_TIMEOUT_MS = 5 * 60_000;

type CommandOptions = {
  env?: NodeJS.ProcessEnv;
  ignoreOutput?: boolean;
  timeoutMs?: number;
};

function safeDiagnostic(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgresql://[redacted]")
    .replace(/password=[^\s]+/gi, "password=[redacted]")
    .trim()
    .split(/\r?\n/, 1)[0]
    .slice(0, 240);
}

function run(command: string, args: string[], label: string, options: CommandOptions = {}): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env,
    stdio: options.ignoreOutput ? "ignore" : "pipe",
    timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) throw new Error(`${label} could not run: ${safeDiagnostic(result.error.message)}`);
  if (result.status !== 0) {
    const diagnostic = safeDiagnostic(
      (typeof result.stderr === "string" ? result.stderr : "") ||
      (typeof result.stdout === "string" ? result.stdout : "") ||
      "unknown command failure"
    );
    throw new Error(`${label} failed${diagnostic ? `: ${diagnostic}` : "."}`);
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

function executableName(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

async function resolveExecutables(binDirectory: string): Promise<Record<string, string>> {
  const resolvedBin = await realpath(binDirectory);
  const names = ["initdb", "pg_ctl", "postgres", "createdb", "pg_dump", "pg_restore"] as const;
  const executables: Record<string, string> = {};
  for (const name of names) {
    const executable = path.join(resolvedBin, executableName(name));
    const metadata = await stat(executable).catch(() => null);
    if (!metadata?.isFile()) throw new Error(`Portable PostgreSQL is missing ${executableName(name)}.`);
    executables[name] = executable;
  }
  const version = run(executables.postgres, ["--version"], "Portable PostgreSQL version check").trim();
  if (!/^postgres \(PostgreSQL\) 16\.[0-9]+/.test(version)) {
    throw new Error("Portable restore drill requires PostgreSQL server major version 16.");
  }
  return executables;
}

async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a loopback PostgreSQL port."));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function postgresEnvironment(password: string): NodeJS.ProcessEnv {
  const env = { ...process.env, PGPASSWORD: password };
  delete env.DATABASE_URL;
  delete env.KITCHEN_PROJECT_DATABASE_URL;
  delete env.PROJECT_DATABASE_URL;
  return env;
}

function connectionString(password: string, port: number, databaseName: string): string {
  return `postgresql://${RESTORE_DRILL_POSTGRES_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}`;
}

async function assertDisposableTempRoot(root: string): Promise<void> {
  const resolvedRoot = await realpath(root);
  const resolvedTemp = await realpath(tmpdir());
  if (!resolvedRoot.startsWith(`${resolvedTemp}${path.sep}`) ||
      !path.basename(resolvedRoot).startsWith("arcigy-restore-drill-")) {
    throw new Error("Refusing cleanup outside the Arcigy restore-drill temporary namespace.");
  }
}

async function removeDisposableTempRoot(root: string): Promise<void> {
  await assertDisposableTempRoot(root);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Portable restore-drill temporary files remained locked after PostgreSQL shutdown.");
}

export async function runPortablePostgresRestoreDrill(): Promise<void> {
  resolveRestoreDrillConfig();
  const binDirectory = resolvePortablePostgresBin();
  const executables = await resolveExecutables(binDirectory);
  const nonce = randomBytes(5).toString("hex");
  const names = createDisposableDatabaseNames(nonce);
  const password = randomBytes(24).toString("hex");
  const port = await reserveLoopbackPort();
  const root = await mkdtemp(path.join(tmpdir(), "arcigy-restore-drill-"));
  const dataDirectory = path.join(root, "data");
  const passwordFile = path.join(root, "pwfile");
  const logFile = path.join(root, "postgres.log");
  const backupPath = path.join(root, "arcigy-restore-drill.dump");
  const env = postgresEnvironment(password);
  let serverStarted = false;

  try {
    await writeFile(passwordFile, password, { encoding: "utf8", mode: 0o600 });
    run(executables.initdb, [
      "--pgdata",
      dataDirectory,
      "--username",
      RESTORE_DRILL_POSTGRES_USER,
      "--pwfile",
      passwordFile,
      "--auth-host=scram-sha-256",
      "--auth-local=trust",
      "--encoding=UTF8",
      "--locale=C"
    ], "Portable PostgreSQL initialization", { env });
    await rm(passwordFile, { force: true });
    run(executables.pg_ctl, [
      "--pgdata",
      dataDirectory,
      "--log",
      logFile,
      "--options",
      `-p ${port} -h 127.0.0.1`,
      "--wait",
      "--timeout=60",
      "start"
    ], "Portable PostgreSQL startup", { env, ignoreOutput: true, timeoutMs: 90_000 });
    serverStarted = true;

    const connectionArgs = [
      "--host=127.0.0.1",
      `--port=${port}`,
      `--username=${RESTORE_DRILL_POSTGRES_USER}`
    ];
    run(executables.createdb, [...connectionArgs, names.source], "Disposable source database creation", { env });
    const sourceUrl = connectionString(password, port, names.source);
    const targetUrl = connectionString(password, port, names.target);

    runRestoreDrillMigrations(sourceUrl);
    runRestoreDrillMigrations(sourceUrl);
    await seedSyntheticArcigyData(sourceUrl);
    const sourceEvidence = await collectRestoreDrillEvidence(sourceUrl);

    run(executables.pg_dump, [
      ...connectionArgs,
      `--dbname=${names.source}`,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${backupPath}`
    ], "Synthetic PostgreSQL backup", { env });
    const backupSha256 = createHash("sha256").update(await readFile(backupPath)).digest("hex");
    const archiveList = run(executables.pg_restore, ["--list", backupPath], "Backup archive inspection", { env });
    if (!archiveList.includes(`TABLE ${RESTORE_DRILL_SCHEMA} arcigy_projects`) ||
        !archiveList.includes(`TABLE DATA ${RESTORE_DRILL_SCHEMA} arcigy_project_saves`)) {
      throw new Error("Backup archive does not contain the required Arcigy project tables and data.");
    }

    const restoreStartedAt = Date.now();
    run(executables.createdb, [...connectionArgs, names.target], "Disposable restore target creation", { env });
    run(executables.pg_restore, [
      ...connectionArgs,
      `--dbname=${names.target}`,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      backupPath
    ], "Isolated PostgreSQL restore", { env });
    runRestoreDrillMigrations(targetUrl);
    runRestoreDrillMigrations(targetUrl);
    const targetEvidence = await collectRestoreDrillEvidence(targetUrl);
    assertEquivalentRestoreEvidence(sourceEvidence, targetEvidence);

    const restoreDurationMs = Date.now() - restoreStartedAt;
    const totalRows = Object.values(targetEvidence.tableCounts).reduce((sum, count) => sum + count, 0);
    const version = run(executables.postgres, ["--version"], "Portable PostgreSQL version evidence").trim();
    console.log(JSON.stringify({
      event: "arcigy_postgres_restore_drill",
      outcome: "passed",
      runtime: "portable",
      postgresVersion: version,
      schema: RESTORE_DRILL_SCHEMA,
      backupSha256,
      migrationCount: targetEvidence.migrationVersions.length,
      tableCount: Object.keys(targetEvidence.tableCounts).length,
      rowCount: totalRows,
      constraintCount: targetEvidence.constraintCount,
      indexCount: targetEvidence.indexCount,
      representativeProject: targetEvidence.representative,
      achievedRpoSeconds: 0,
      achievedRtoSeconds: Number((restoreDurationMs / 1000).toFixed(3))
    }));
  } finally {
    await rm(passwordFile, { force: true }).catch(() => undefined);
    const hasPostmasterPid = await access(path.join(dataDirectory, "postmaster.pid")).then(() => true, () => false);
    if (serverStarted || hasPostmasterPid) {
      run(executables.pg_ctl, [
        "--pgdata",
        dataDirectory,
        "--wait",
        "--timeout=60",
        "--mode=fast",
        "stop"
      ], "Portable PostgreSQL shutdown", { env, ignoreOutput: true, timeoutMs: 90_000 });
    }
    await removeDisposableTempRoot(root);
  }
}

await runPortablePostgresRestoreDrill();
