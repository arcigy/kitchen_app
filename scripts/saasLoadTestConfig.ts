export type SaasLoadScenario = "health" | "project-list" | "project-open" | "catalog";

export type SaasLoadTestConfig = {
  baseUrl: URL;
  scenario: SaasLoadScenario;
  concurrency: number;
  durationSeconds: number;
  rampSeconds: number;
  thinkTimeMs: number;
  p95ThresholdMs: number;
  errorRateThreshold: number;
  company?: string;
  username?: string;
  password?: string;
  projectId?: string;
};

const PRODUCTION_HOST_PATTERNS = [
  /(^|\.)app\.arcigy\.cloud$/i,
  /arcigy-kitchen(?!-isolated-load)/i,
  /(^|\.)arcigy\.cloud$/i
];

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function finite(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  const value = raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for this scenario.`);
  return value;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isKnownProductionHost(hostname: string): boolean {
  return PRODUCTION_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

export function resolveSaasLoadTestConfig(env: NodeJS.ProcessEnv): SaasLoadTestConfig {
  if (env.ALLOW_ARCIGY_LOAD_TEST !== "true") {
    throw new Error("Refusing load test: set ALLOW_ARCIGY_LOAD_TEST=true after reviewing the target.");
  }
  if (env.LOAD_TEST_TARGET_ENV !== "isolated") {
    throw new Error("Refusing load test: LOAD_TEST_TARGET_ENV must be exactly isolated. Localhost may still tunnel to production.");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:5180/");
  } catch {
    throw new Error("LOAD_TEST_BASE_URL must be a valid HTTP(S) URL.");
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new Error("LOAD_TEST_BASE_URL must be an HTTP(S) URL without embedded credentials.");
  }
  if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new Error("LOAD_TEST_BASE_URL must contain only the target origin.");
  }
  if (!isLoopback(baseUrl.hostname) && env.ALLOW_REMOTE_LOAD_TEST !== "true") {
    throw new Error("Refusing remote load test: set ALLOW_REMOTE_LOAD_TEST=true only for an approved isolated environment.");
  }
  if (isKnownProductionHost(baseUrl.hostname) && env.LOAD_TEST_PRODUCTION_CONFIRMATION !== "I_ACCEPT_CUSTOMER_IMPACT") {
    throw new Error("Refusing known production target. Production load testing requires LOAD_TEST_PRODUCTION_CONFIRMATION=I_ACCEPT_CUSTOMER_IMPACT.");
  }

  const scenario = (env.LOAD_TEST_SCENARIO ?? "health") as SaasLoadScenario;
  if (!["health", "project-list", "project-open", "catalog"].includes(scenario)) {
    throw new Error("LOAD_TEST_SCENARIO must be health, project-list, project-open, or catalog.");
  }

  const authenticated = scenario !== "health";
  return {
    baseUrl,
    scenario,
    concurrency: integer(env, "LOAD_TEST_CONCURRENCY", 10, 1, 5_000),
    durationSeconds: integer(env, "LOAD_TEST_DURATION_SECONDS", 60, 5, 86_400),
    rampSeconds: integer(env, "LOAD_TEST_RAMP_SECONDS", 10, 0, 3_600),
    thinkTimeMs: integer(env, "LOAD_TEST_THINK_TIME_MS", 250, 0, 60_000),
    p95ThresholdMs: finite(env, "LOAD_TEST_P95_THRESHOLD_MS", 2_000, 1, 600_000),
    errorRateThreshold: finite(env, "LOAD_TEST_ERROR_RATE_THRESHOLD", 0.01, 0, 1),
    ...(authenticated ? {
      company: required(env, "ARCIGY_LOAD_TEST_COMPANY"),
      username: required(env, "ARCIGY_LOAD_TEST_USERNAME"),
      password: required(env, "ARCIGY_LOAD_TEST_PASSWORD")
    } : {}),
    ...(scenario === "project-open" ? { projectId: required(env, "ARCIGY_LOAD_TEST_PROJECT_ID") } : {})
  };
}
