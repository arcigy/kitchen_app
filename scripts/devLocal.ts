import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const nodeBin = process.execPath;
const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const host = "127.0.0.1";
const vitePort = 5180;
const workerPort = Number(process.env.BLENDER_WORKER_PORT || 5191);

async function assertPortAvailable(port: number, label: string) {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      const suffix = error.code === "EADDRINUSE" ? "address already in use" : error.message;
      reject(new Error(`[dev:local] ${label} port ${port} unavailable: ${suffix}. Stop the existing dev server first.`));
    });
    probe.once("listening", () => {
      probe.close(() => resolve());
    });
    probe.listen(port, host);
  });
}
async function main() {
  await assertPortAvailable(vitePort, "Vite");
  await assertPortAvailable(workerPort, "worker");

  const worker = spawn(nodeBin, [tsxCli, "scripts/worker.ts"], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, BLENDER_WORKER_PORT: String(workerPort) }
  });
  const vite = spawn(nodeBin, [viteCli, "--host", host, "--port", String(vitePort), "--strictPort"], { stdio: "inherit", cwd: process.cwd() });

  const shutdown = () => {
    try {
      worker.kill("SIGTERM");
    } catch {
      // ignore
    }
    try {
      vite.kill("SIGTERM");
    } catch {
      // ignore
    }
  };

  process.on("SIGINT", () => shutdown());
  process.on("SIGTERM", () => shutdown());

  const onExit = (code: number | null, label: string) => {
    const c = code ?? 0;
    if (c !== 0) {
      shutdown();
      process.exitCode = c;
      return;
    }
    // If one exits cleanly, stop the other too.
    shutdown();
    console.error(`[dev:local] ${label} exited.`);
  };

  worker.on("exit", (code) => onExit(code, "worker"));
  vite.on("exit", (code) => onExit(code, "vite"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
