import process from "node:process";
import { performance } from "node:perf_hooks";
import { resolveSaasLoadTestConfig, type SaasLoadScenario } from "./saasLoadTestConfig";
import { summarizeSaasLoadTest, type SaasLoadSample } from "./saasLoadTestMetrics";

function cookieFrom(response: Response): string {
  const raw = response.headers.get("set-cookie") ?? "";
  const cookie = raw.split(";", 1)[0]?.trim();
  if (!cookie) throw new Error("Login response did not set a session cookie.");
  return cookie;
}

async function measuredFetch(baseUrl: URL, path: string, samples: SaasLoadSample[], init: RequestInit = {}): Promise<Response> {
  const started = performance.now();
  let status = 0;
  try {
    const response = await fetch(new URL(path, baseUrl), { ...init, redirect: "error" });
    status = response.status;
    const body = await response.arrayBuffer();
    samples.push({
      name: path.replace(/\/[^/]+(?=\/load$)/, "/:projectId"),
      durationMs: performance.now() - started,
      ok: response.ok,
      status,
      decodedResponseBytes: body.byteLength
    });
    return response;
  } catch (error) {
    samples.push({ name: path, durationMs: performance.now() - started, ok: false, status, decodedResponseBytes: 0 });
    throw error;
  }
}

async function login(baseUrl: URL, username: string, password: string, samples: SaasLoadSample[]): Promise<string> {
  const response = await measuredFetch(baseUrl, "/api/auth/login", samples, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl.origin },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) throw new Error(`Login failed with HTTP ${response.status}.`);
  return cookieFrom(response);
}

function scenarioPaths(scenario: SaasLoadScenario, projectId?: string): string[] {
  if (scenario === "health") return ["/health", "/ready"];
  if (scenario === "project-list") return ["/api/auth/session", "/api/projects"];
  if (scenario === "project-open") return [`/api/projects/${encodeURIComponent(projectId!)}/load`];
  return ["/api/catalog/bootstrap", "/api/modules"];
}

async function main(): Promise<void> {
  const config = resolveSaasLoadTestConfig(process.env);
  const samples: SaasLoadSample[] = [];
  const startedAt = performance.now();
  const deadline = startedAt + config.durationSeconds * 1_000;
  const workers: Promise<void>[] = [];
  let stopping = false;

  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });

  const runWorker = async () => {
    let cookie = "";
    if (config.scenario !== "health") {
      cookie = await login(config.baseUrl, config.username!, config.password!, samples);
    }
    while (!stopping && performance.now() < deadline) {
      for (const path of scenarioPaths(config.scenario, config.projectId)) {
        try {
          await measuredFetch(config.baseUrl, path, samples, cookie ? { headers: { Cookie: cookie } } : {});
        } catch {
          // Failure is recorded and evaluated against the configured threshold.
        }
      }
      if (config.thinkTimeMs > 0) await new Promise((resolve) => setTimeout(resolve, config.thinkTimeMs));
    }
  };

  const rampDelayMs = config.concurrency > 1 ? (config.rampSeconds * 1_000) / (config.concurrency - 1) : 0;
  for (let index = 0; index < config.concurrency; index += 1) {
    workers.push(runWorker().catch((error) => {
      samples.push({ name: "worker_setup", durationMs: 0, ok: false, status: 0, decodedResponseBytes: 0 });
      console.error(error instanceof Error ? error.message : String(error));
    }));
    if (rampDelayMs > 0 && index < config.concurrency - 1) await new Promise((resolve) => setTimeout(resolve, rampDelayMs));
  }
  await Promise.all(workers);

  const summary = summarizeSaasLoadTest({
    samples,
    target: config.baseUrl.origin,
    scenario: config.scenario,
    concurrency: config.concurrency,
    elapsedSeconds: (performance.now() - startedAt) / 1_000,
    p95ThresholdMs: config.p95ThresholdMs,
    errorRateThreshold: config.errorRateThreshold
  });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
