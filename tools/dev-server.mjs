import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const cwd = process.cwd();
const tmpDir = path.join(cwd, "tmp");
const pidFile = path.join(tmpDir, "vite.pid");
const outLog = path.join(tmpDir, "vite.out.log");
const errLog = path.join(tmpDir, "vite.err.log");

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

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

function getListeningPid(port) {
  const p = Number(port);
  if (!Number.isFinite(p) || p <= 0) return null;

  // Prefer checking whether the port is LISTENING; this is more reliable than process.kill(pid,0) on Windows.
  if (process.platform === "win32") {
    const cmd = `netstat -ano | findstr :${p} | findstr LISTENING`;
    const res = spawnSync("cmd", ["/c", cmd], { encoding: "utf8" });
    const out = String(res.stdout || "").trim();
    if (!out) return null;
    // Example line: TCP  127.0.0.1:5180  0.0.0.0:0  LISTENING  28708
    const lines = out.split(/\r?\n/g).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/\sLISTENING\s+(\d+)\s*$/i);
      if (m) return Number(m[1]);
    }
    return null;
  }

  // Non-Windows: best-effort fallback to pid file check only.
  return null;
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
  // In some restricted environments (e.g. sandboxed Windows), deleting files may be blocked
  // even though rewriting is allowed. Instead of unlink, invalidate the pid file.
  if (!fs.existsSync(pidFile)) return;
  try {
    fs.writeFileSync(pidFile, "invalid\n", "utf8");
  } catch {
    // ignore
  }
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

  const portPid = getListeningPid(safePort);
  if (portPid) {
    // Someone is already listening on this port, assume it's an existing Vite instance.
    writePid(portPid);
    console.log(`Vite already listening on http://${host}:${safePort}/ (pid ${portPid}).`);
    console.log(`Logs: ${outLog} / ${errLog}`);
    return;
  }

  const viteEntry = resolveViteEntry();
  const viteBin = resolveViteBin();
  if (!fs.existsSync(viteEntry) && !fs.existsSync(viteBin)) {
    console.error("Vite binary not found. Run `npm install` first.");
    process.exitCode = 1;
    return;
  }

  // Always start with clean logs so old failures don't look like current failures.
  fs.writeFileSync(outLog, `# ${nowStamp()} dev-server start\n`, "utf8");
  fs.writeFileSync(errLog, `# ${nowStamp()} dev-server start\n`, "utf8");
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
    const portPid = getListeningPid("5180");
    if (portPid) {
      console.log(`Pid file not running, but port 5180 is LISTENING (pid ${portPid}).`);
      console.log("Not stopping automatically to avoid killing an unrelated process.");
      console.log("If you want to stop it, run: taskkill /PID <pid> /T /F");
    } else {
      console.log(`Pid ${pid} not running. Cleaning pid file.`);
      removePid();
    }
    return;
  }

  if (process.platform === "win32") {
    // taskkill can fail silently under some restrictions; verify and fallback.
    const tk = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { encoding: "utf8" });
    if (isRunning(pid)) {
      spawnSync("powershell", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`], { encoding: "utf8" });
    }
    if (isRunning(pid)) {
      console.log(`Tried to stop Vite (pid ${pid}) but it is still running.`);
      if (tk.status != null) console.log(`taskkill exit code: ${tk.status}`);
      const portPidAfter = getListeningPid("5180");
      if (portPidAfter) console.log(`Port 5180 still LISTENING (pid ${portPidAfter}).`);
      return;
    }
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
  const portPid = getListeningPid("5180");

  if (!pid && !portPid) {
    console.log("Vite status: stopped.");
    return;
  }

  if (portPid) {
    // If something is listening, prefer that signal (more reliable on Windows).
    if (!pid || pid !== portPid) writePid(portPid);
    console.log(`Vite status: running (listening on 5180, pid ${portPid}).`);
    return;
  }

  if (!pid) {
    console.log("Vite status: unknown (no pid file).");
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
