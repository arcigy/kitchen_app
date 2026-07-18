type ReadinessEndpoint = "health" | "ready";

function fail(message: string): never {
  throw new Error(`Deployment readiness verification failed: ${message}`);
}

function recordFromJson(text: string, endpoint: ReadinessEndpoint): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    fail(`/${endpoint} did not return JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`/${endpoint} did not return a JSON object.`);
  }
  return value as Record<string, unknown>;
}

export function verifyDeploymentReadinessResponse(endpoint: ReadinessEndpoint, text: string): void {
  const payload = recordFromJson(text, endpoint);
  if (payload.ok !== true) fail(`/${endpoint} did not report ok=true.`);
  if (endpoint !== "ready") return;
  if (payload.storage !== "postgres") fail("/ready did not report PostgreSQL storage.");
  if (
    typeof payload.latencyMs !== "number"
    || !Number.isFinite(payload.latencyMs)
    || payload.latencyMs < 0
    || payload.latencyMs > 60_000
  ) {
    fail("/ready did not report a bounded database latency.");
  }
}

async function main(): Promise<void> {
  const endpoint = process.argv[2];
  if (endpoint !== "health" && endpoint !== "ready") {
    throw new Error("Usage: tsx scripts/verifyReadinessResponse.ts <health|ready>");
  }
  let text = "";
  for await (const chunk of process.stdin) text += String(chunk);
  verifyDeploymentReadinessResponse(endpoint, text);
}

if (process.argv[1]?.endsWith("verifyReadinessResponse.ts")) {
  await main();
}
