import { execFile, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);
const DEFAULT_LOCAL_PORT = 55432;
const APP_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

function parseEnvFile(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (match) values[match[1]!] = match[2]!;
  }
  return values;
}

async function caproverApi<T>(
  baseUrl: string,
  pathname: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers: {
      "x-namespace": "captain",
      ...(options.token ? { "x-captain-auth": options.token } : {}),
      ...(options.body ? { "content-type": "application/json" } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json() as { status?: number; description?: string; data?: T };
  if (!response.ok || (payload.status !== 100 && payload.status !== 101) || payload.data == null) {
    throw new Error(`CapRover ${pathname} failed: ${payload.description ?? response.statusText}`);
  }
  return payload.data;
}

function envMap(items: Array<{ key?: unknown; value?: unknown }> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items ?? []) {
    if (typeof item.key === "string" && typeof item.value === "string") result[item.key] = item.value;
  }
  return result;
}

function requireValue(values: Record<string, string>, key: string): string {
  const value = values[key]?.trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function waitForPort(host: string, port: number, tunnel: ChildProcess, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let finished = false;
    const done = (error?: Error) => {
      if (finished) return;
      finished = true;
      error ? reject(error) : resolve();
    };
    tunnel.once("exit", (code) => done(new Error(`SSH database tunnel exited before it became ready (code ${code ?? "unknown"}).`)));
    const probe = () => {
      const socket = net.connect({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        done();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) done(new Error(`SSH database tunnel did not open ${host}:${port}.`));
        else setTimeout(probe, 200);
      });
    };
    probe();
  });
}

async function main() {
  const envFile = process.env.CAPROVER_ENV_FILE ?? path.join(os.homedir(), "Downloads", "CAPROVER", ".env");
  const knownHostsFile = process.env.CAPROVER_SSH_KNOWN_HOSTS ?? path.join(path.dirname(envFile), ".ssh-known-hosts");
  const localEnv = parseEnvFile(await readFile(envFile, "utf-8"));
  const rootDomain = requireValue(localEnv, "CAPROVER_ROOT_DOMAIN");
  const password = requireValue(localEnv, "CAPROVER_PASSWORD");
  const baseUrl = `http://captain.${rootDomain}/api/v2`;
  const login = await caproverApi<{ token: string }>(baseUrl, "/login", { method: "POST", body: { password } });
  const definitions = await caproverApi<{ appDefinitions?: Array<{
    appName?: string;
    envVars?: Array<{ key?: unknown; value?: unknown }>;
    ports?: Array<{ hostPort?: unknown; containerPort?: unknown }>;
  }> }>(
    baseUrl,
    "/user/apps/appDefinitions",
    { token: login.token }
  );

  const databaseAppName = process.env.CAPROVER_DATABASE_APP ?? "kitchenapp-db";
  const tunnelAppName = process.env.CAPROVER_DATABASE_TUNNEL_APP ?? "kitchenapp-db-tunnel";
  if (!APP_NAME_RE.test(databaseAppName)) throw new Error("CAPROVER_DATABASE_APP is invalid.");
  if (!APP_NAME_RE.test(tunnelAppName)) throw new Error("CAPROVER_DATABASE_TUNNEL_APP is invalid.");
  const databaseApp = definitions.appDefinitions?.find((item) => item.appName === databaseAppName);
  const tunnelApp = definitions.appDefinitions?.find((item) => item.appName === tunnelAppName);
  if (!databaseApp) throw new Error(`CapRover database app ${databaseAppName} was not found.`);
  if (!tunnelApp) throw new Error(`CapRover database tunnel app ${tunnelAppName} was not found.`);
  const databaseEnv = envMap(databaseApp.envVars);
  const tunnelEnv = envMap(tunnelApp.envVars);
  const sshHost = process.env.CAPROVER_SSH_HOST ?? rootDomain.match(IPV4_RE)?.[0];
  if (!sshHost) throw new Error("CAPROVER_SSH_HOST is required when the root domain does not contain an IP address.");
  const sshUser = process.env.CAPROVER_SSH_USER ?? "root";
  const sshTarget = `${sshUser}@${sshHost}`;
  const sshBaseArgs = [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=8",
    "-o", `UserKnownHostsFile=${knownHostsFile}`
  ];
  const localPort = Number(process.env.LOCAL_PORT ?? DEFAULT_LOCAL_PORT);
  if (!Number.isSafeInteger(localPort) || localPort <= 0 || localPort > 65_535) throw new Error("LOCAL_PORT is invalid.");
  const sshForwardPort = Number(process.env.SSH_FORWARD_PORT ?? localPort + 1);
  if (!Number.isSafeInteger(sshForwardPort) || sshForwardPort <= 0 || sshForwardPort > 65_535 || sshForwardPort === localPort) {
    throw new Error("SSH_FORWARD_PORT is invalid.");
  }
  const publishedTunnelPort = tunnelApp.ports?.find((item) => Number(item.containerPort) === Number(tunnelEnv.TUNNEL_PORT))?.hostPort
    ?? tunnelApp.ports?.[0]?.hostPort;
  const remoteTunnelPort = Number(process.env.CAPROVER_DATABASE_TUNNEL_PORT ?? publishedTunnelPort ?? 55432);
  if (!Number.isSafeInteger(remoteTunnelPort) || remoteTunnelPort <= 0 || remoteTunnelPort > 65_535) {
    throw new Error("CapRover TUNNEL_PORT is invalid.");
  }
  const tunnelToken = requireValue(tunnelEnv, "TUNNEL_TOKEN");
  await execFileAsync("ssh", [...sshBaseArgs, sshTarget, `nc -z -w 3 127.0.0.1 ${remoteTunnelPort}`], { windowsHide: true });
  const sshTunnel = spawn("ssh", [
    ...sshBaseArgs,
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3",
    "-N",
    "-L", `${sshForwardPort}:127.0.0.1:${remoteTunnelPort}`,
    sshTarget
  ], { stdio: ["ignore", "inherit", "inherit"], windowsHide: true });

  await waitForPort("127.0.0.1", sshForwardPort, sshTunnel);
  const tokenBridge = net.createServer((local) => {
    local.setKeepAlive(true, 10_000);
    const connectTimer = setTimeout(() => close(), 5_000);
    const remote = net.connect({ host: "127.0.0.1", port: sshForwardPort }, () => {
      clearTimeout(connectTimer);
      remote.setKeepAlive(true, 10_000);
      remote.write(`TOKEN ${tunnelToken}\n`);
      local.pipe(remote);
      remote.pipe(local);
    });
    const close = () => {
      clearTimeout(connectTimer);
      local.destroy();
      remote.destroy();
    };
    local.once("error", close);
    remote.once("error", close);
  });
  await new Promise<void>((resolve, reject) => {
    tokenBridge.once("error", reject);
    tokenBridge.listen(localPort, "127.0.0.1", resolve);
  });

  let stopping = false;
  const stopTunnel = () => {
    if (stopping) return;
    stopping = true;
    tokenBridge.close();
    sshTunnel.kill("SIGTERM");
  };
  process.once("exit", stopTunnel);
  process.once("SIGINT", stopTunnel);
  process.once("SIGTERM", stopTunnel);

  const username = requireValue(databaseEnv, "POSTGRES_USER");
  const database = requireValue(databaseEnv, "POSTGRES_DB");
  const databaseUrl = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(requireValue(databaseEnv, "POSTGRES_PASSWORD"))}@127.0.0.1:${localPort}/${encodeURIComponent(database)}`;
  const verification = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000, query_timeout: 5_000 });
  await verification.connect();
  await verification.query("SELECT 1");
  await verification.end();

  process.env.DATABASE_URL = databaseUrl;
  process.env.KITCHEN_PROJECT_STORAGE = "postgres";
  process.env.DATABASE_SCHEMA = process.env.DATABASE_SCHEMA ?? "prod";
  process.env.APP_ENV = process.env.APP_ENV ?? "prod";
  process.env.ARCIGY_OBJECT_STORAGE_PREFIX = process.env.ARCIGY_OBJECT_STORAGE_PREFIX ?? "prod";
  console.log(`[dev:online:postgres] verified SSH database tunnel on 127.0.0.1:${localPort}; starting Arcigy.`);

  let runtimeStarted = false;
  sshTunnel.once("exit", (code) => {
    if (!runtimeStarted || stopping) return;
    console.error(`[dev:online:postgres] SSH tunnel stopped unexpectedly (code ${code ?? "unknown"}).`);
    process.kill(process.pid, "SIGINT");
    setTimeout(() => process.exit(1), 500).unref();
  });
  runtimeStarted = true;
  await import("./devLocal");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
