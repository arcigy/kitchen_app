import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const cwd = process.cwd();
const tmpDir = path.join(cwd, "tmp");
const pidFile = path.join(tmpDir, "vite.pid");
const outLog = path.join(tmpDir, "vite.out.log");
const errLog = path.join(tmpDir, "vite.err.log");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function isRunning(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function ensureTmp() {
  fs.mkdirSync(tmpDir, { recursive: true });
}

function readPid() {
  if (!fs.existsSync(pidFile)) return null;
  const n = Number(String(fs.readFileSync(pidFile, "utf8")).trim());
  return Number.isFinite(n) ? n : null;
}

function writePid(pid) {
  ensureTmp();
  fs.writeFileSync(pidFile, `${pid}\n`, "utf8");
}

function removePid() {
  if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
}

function resolveViteBin() {
  const binDir = path.join(cwd, "node_modules", ".bin");
  const bin = process.platform === "win32" ? path.join(binDir, "vite.cmd") : path.join(binDir, "vite");
  return bin;
}

function resolveViteEntry() {
  // Prefer invoking the JS entry via `node` so we get a stable PID (especially on Windows).
  return path.join(cwd, "node_modules", "vite", "bin", "vite.js");
}

function start() {
  ensureTmp();

  const existingPid = readPid();
  if (existingPid && isRunning(existingPid)) {
    console.log(`Vite already running (pid ${existingPid}).`);
    return;
  }

  if (existingPid && !isRunning(existingPid)) removePid();

  const fileEnv = readEnvFile(path.join(cwd, ".env"));
  const host = fileEnv.VITE_DEV_HOST || fileEnv.HOST || "127.0.0.1";
  const portRaw = fileEnv.VITE_DEV_PORT || fileEnv.PORT || "5180";
  const port = Number(portRaw);
  const safePort = Number.isFinite(port) ? String(port) : "5180";

  const viteEntry = resolveViteEntry();
  const viteBin = resolveViteBin();
  if (!fs.existsSync(viteEntry) && !fs.existsSync(viteBin)) {
    console.error("Vite binary not found. Run `npm install` first.");
    process.exitCode = 1;
    return;
  }

  const outFd = fs.openSync(outLog, "a");
  const errFd = fs.openSync(errLog, "a");

  const commonOpts = {
    cwd,
    detached: true,
    windowsHide: true,
    env: { ...process.env, ...fileEnv },
    stdio: ["ignore", outFd, errFd]
  };

  const child = fs.existsSync(viteEntry)
    ? spawn(process.execPath, [viteEntry, "--host", host, "--port", safePort], commonOpts)
    : spawn(viteBin, ["--host", host, "--port", safePort], commonOpts);

  child.unref();
  writePid(child.pid);
  console.log(`Vite started (pid ${child.pid}) on http://${host}:${safePort}/`);
  console.log(`Logs: ${outLog} / ${errLog}`);
}

function stop() {
  const pid = readPid();
  if (!pid) {
    console.log("No pid file. Vite not running (or started manually).");
    return;
  }

  if (!isRunning(pid)) {
    console.log(`Pid ${pid} not running. Cleaning pid file.`);
    removePid();
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      process.kill(pid, "SIGTERM");
    }
  }

  console.log(`Stopped Vite (pid ${pid}).`);
  removePid();
}

function status() {
  const pid = readPid();
  if (!pid) {
    console.log("Vite status: stopped (no pid file).");
    return;
  }
  console.log(`Vite status: ${isRunning(pid) ? "running" : "stopped"} (pid ${pid}).`);
  if (!isRunning(pid)) removePid();
}

const cmd = process.argv[2];
if (cmd === "start") start();
else if (cmd === "stop") stop();
else if (cmd === "status") status();
else {
  console.log("Usage: node tools/dev-server.mjs <start|stop|status>");
  process.exitCode = 2;
}
