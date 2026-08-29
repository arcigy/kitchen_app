import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { fetchExternalText } from "../src/server/external-http";

export type SaasEnvironmentCode = "develop" | "main";

export type ReadyPayload = {
  ok: true;
  storage: "file" | "postgres";
  latencyMs: number;
};

type PrometheusSample = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

export type ScrapeState = {
  measuredAt: string;
  eligibleRequests: number;
  eligibleHistogramBuckets: Record<string, number>;
  browserJourneyTotals?: Record<string, number>;
  browserJourneySuccesses?: Record<string, number>;
  browserJourneyBuckets?: Record<string, Record<string, number>>;
  browserRuntimeErrors?: Record<string, number>;
  browserLongTaskBuckets?: Record<string, number>;
  browserMemoryBuckets?: Record<string, number>;
};

export type OdooMetricPoint = {
  code: string;
  value: number;
  numerator?: number;
  denominator?: number;
  sample_count?: number;
  status: "healthy" | "warning" | "critical" | "unknown";
  measured_at: string;
  freshness_seconds: number;
  external_key?: string;
  period_start?: string;
  period_end?: string;
  granularity?: "5m" | "hour" | "day" | "month";
};

type EnvironmentConfig = {
  environment: SaasEnvironmentCode;
  baseUrl: string;
  metricsToken?: string;
  releaseVersion?: string;
  commitSha?: string;
};

type SyncConfig = {
  odooUrl: string;
  odooDatabase?: string;
  odooApiKey: string;
  stateFile: string;
  environments: EnvironmentConfig[];
};

type PersistedState = Partial<Record<SaasEnvironmentCode, ScrapeState>>;

const EXCLUDED_ROUTES = new Set(["/health", "/ready", "/metrics"]);
const EXCLUDED_VALIDATION_STATUSES = new Set([400, 404, 422]);
const FRESHNESS_SECONDS = 300;
const RECOGNIZED_ARCIGY_METRICS = new Set([
  "arcigy_http_requests_in_flight",
  "arcigy_http_requests_total",
  "arcigy_http_request_duration_seconds_bucket",
  "arcigy_process_uptime_seconds",
  "arcigy_browser_journey_total",
  "arcigy_browser_journey_duration_seconds_bucket",
  "arcigy_browser_runtime_errors_total",
  "arcigy_browser_long_task_duration_seconds_bucket",
  "arcigy_browser_memory_used_bytes_bucket"
]);

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const labels: Record<string, string> = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)="((?:\\.|[^"\\])*)"(?:,|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    labels[match[1]] = match[2]
      .replaceAll("\\n", "\n")
      .replaceAll('\\"', '"')
      .replaceAll("\\\\", "\\");
  }
  return labels;
}

export function parsePrometheusText(text: string): PrometheusSample[] {
  const samples: PrometheusSample[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)$/.exec(line);
    if (!match) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;
    samples.push({ name: match[1], labels: parseLabels(match[2]), value });
  }
  return samples;
}

export function validatePrometheusPayload(text: string, contentType?: string | null): PrometheusSample[] {
  if (contentType?.toLowerCase().includes("text/html") || /^\s*<(?:!doctype\s+html|html)\b/i.test(text)) {
    throw new Error("/metrics returned HTML instead of Prometheus telemetry.");
  }
  const samples = parsePrometheusText(text);
  if (!samples.some((sample) => RECOGNIZED_ARCIGY_METRICS.has(sample.name))) {
    throw new Error("/metrics did not contain any recognized Arcigy telemetry.");
  }
  return samples;
}

export function parseReadyPayload(text: string): ReadyPayload {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("/ready returned invalid JSON.");
  }
  if (!value || typeof value !== "object") throw new Error("/ready payload must be an object.");
  const record = value as Record<string, unknown>;
  const latencyMs = record.latencyMs;
  if (record.ok !== true || (record.storage !== "file" && record.storage !== "postgres")) {
    throw new Error("/ready payload has an invalid readiness contract.");
  }
  if (typeof latencyMs !== "number" || !Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 60_000) {
    throw new Error("/ready latencyMs must be finite and between 0 and 60000.");
  }
  return { ok: true, storage: record.storage, latencyMs };
}

function eligibleRequestSample(sample: PrometheusSample): boolean {
  const route = sample.labels.route ?? "";
  const status = Number(sample.labels.status);
  return !EXCLUDED_ROUTES.has(route)
    && Number.isInteger(status)
    && !EXCLUDED_VALIDATION_STATUSES.has(status);
}

function sum(samples: readonly PrometheusSample[], predicate: (sample: PrometheusSample) => boolean): number {
  return samples.reduce((total, sample) => total + (predicate(sample) ? sample.value : 0), 0);
}

function aggregateHistogramBuckets(samples: readonly PrometheusSample[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const sample of samples) {
    if (sample.name !== "arcigy_http_request_duration_seconds_bucket" || !eligibleRequestSample(sample)) continue;
    const boundary = sample.labels.le;
    if (!boundary) continue;
    buckets[boundary] = (buckets[boundary] ?? 0) + sample.value;
  }
  return buckets;
}

function aggregateNamedHistogramBuckets(
  samples: readonly PrometheusSample[],
  metricName: string,
  predicate: (sample: PrometheusSample) => boolean = () => true
): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const sample of samples) {
    if (sample.name !== `${metricName}_bucket` || !predicate(sample)) continue;
    const boundary = sample.labels.le;
    if (!boundary) continue;
    buckets[boundary] = (buckets[boundary] ?? 0) + sample.value;
  }
  return buckets;
}

function counterDelta(current: number, previous: number | undefined): number | null {
  if (previous === undefined) return null;
  return current >= previous ? current - previous : current;
}

function bucketDelta(current: Record<string, number>, previous: Record<string, number> | undefined): Record<string, number> | null {
  if (!previous) return null;
  const result: Record<string, number> = {};
  for (const [boundary, value] of Object.entries(current)) {
    result[boundary] = value >= (previous[boundary] ?? 0) ? value - (previous[boundary] ?? 0) : value;
  }
  return result;
}

function histogramQuantile(buckets: Record<string, number>, quantile: number): number | null {
  const finite = Object.entries(buckets)
    .filter(([boundary]) => boundary !== "+Inf")
    .map(([boundary, count]) => [Number(boundary), count] as const)
    .filter(([boundary, count]) => Number.isFinite(boundary) && Number.isFinite(count))
    .sort(([left], [right]) => left - right);
  const total = buckets["+Inf"] ?? finite.at(-1)?.[1] ?? 0;
  if (total <= 0) return null;
  const target = total * quantile;
  const bucket = finite.find(([, count]) => count >= target);
  return bucket?.[0] ?? finite.at(-1)?.[0] ?? null;
}

function higherIsBetter(value: number, warning: number, critical: number) {
  if (value < critical) return "critical" as const;
  if (value < warning) return "warning" as const;
  return "healthy" as const;
}

function lowerIsBetter(value: number, warning: number, critical: number) {
  if (value >= critical) return "critical" as const;
  if (value >= warning) return "warning" as const;
  return "healthy" as const;
}

export function collectArcigyOdooMetrics(args: {
  metricsText: string;
  metricsContentType?: string | null;
  measuredAt: string;
  ready: boolean;
  readiness?: ReadyPayload;
  previous?: ScrapeState;
}): { metrics: OdooMetricPoint[]; state: ScrapeState } {
  const samples = validatePrometheusPayload(args.metricsText, args.metricsContentType);
  const requestSamples = samples.filter((sample) => sample.name === "arcigy_http_requests_total" && eligibleRequestSample(sample));
  const eligibleRequests = sum(requestSamples, () => true);
  const successfulRequests = sum(requestSamples, (sample) => Number(sample.labels.status) < 400);
  const serverErrors = sum(requestSamples, (sample) => Number(sample.labels.status) >= 500);
  const rateLimited = sum(requestSamples, (sample) => Number(sample.labels.status) === 429);
  const inFlight = sum(samples, (sample) => sample.name === "arcigy_http_requests_in_flight");
  const uptimeSamples = samples.filter((sample) => sample.name === "arcigy_process_uptime_seconds");
  const histogramBuckets = aggregateHistogramBuckets(samples);
  const browserJourneyTotals: Record<string, number> = {};
  const browserJourneySuccesses: Record<string, number> = {};
  const browserJourneyBuckets: Record<string, Record<string, number>> = {};
  for (const journey of ["project_open", "app_data_load"] as const) {
    browserJourneyTotals[journey] = sum(
      samples,
      (sample) => sample.name === "arcigy_browser_journey_total" && sample.labels.journey === journey
    );
    browserJourneySuccesses[journey] = sum(
      samples,
      (sample) => sample.name === "arcigy_browser_journey_total"
        && sample.labels.journey === journey
        && sample.labels.outcome === "success"
    );
    browserJourneyBuckets[journey] = aggregateNamedHistogramBuckets(
      samples,
      "arcigy_browser_journey_duration_seconds",
      (sample) => sample.labels.journey === journey
    );
  }
  const browserRuntimeErrors = Object.fromEntries(
    ["js_error", "unhandled_rejection"].map((signal) => [
      signal,
      sum(
        samples,
        (sample) => sample.name === "arcigy_browser_runtime_errors_total" && sample.labels.signal === signal
      )
    ])
  );
  const browserLongTaskBuckets = aggregateNamedHistogramBuckets(
    samples, "arcigy_browser_long_task_duration_seconds"
  );
  const browserMemoryBuckets = aggregateNamedHistogramBuckets(
    samples, "arcigy_browser_memory_used_bytes"
  );
  const elapsedSeconds = args.previous
    ? Math.max(1, (Date.parse(args.measuredAt) - Date.parse(args.previous.measuredAt)) / 1000)
    : null;
  const requestDelta = counterDelta(eligibleRequests, args.previous?.eligibleRequests);
  const histogramWindow = bucketDelta(histogramBuckets, args.previous?.eligibleHistogramBuckets);
  const metrics: OdooMetricPoint[] = [
    {
      code: "app_health_status",
      value: args.ready ? 1 : 0,
      status: args.ready ? "healthy" : "critical",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    },
    {
      code: "healthy_app_instances",
      value: args.ready ? 1 : 0,
      status: args.ready ? "healthy" : "critical",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    },
    {
      code: "http_requests_in_flight",
      value: inFlight,
      status: args.ready ? "healthy" : "critical",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    },
    {
      code: "http_request_count",
      value: eligibleRequests,
      sample_count: eligibleRequests,
      status: "unknown",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    }
  ];

  if (uptimeSamples.length) {
    metrics.push({
      code: "worker_uptime_seconds",
      value: sum(uptimeSamples, () => true),
      status: "unknown",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    });
  }

  if (args.readiness) {
    const latencySeconds = args.readiness.latencyMs / 1000;
    metrics.push({
      code: "db_readiness_latency_seconds",
      value: latencySeconds,
      sample_count: 1,
      status: args.readiness.storage === "postgres"
        ? lowerIsBetter(latencySeconds, 0.25, 1)
        : "unknown",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    });
  }

  if (eligibleRequests > 0) {
    const successPercent = (successfulRequests / eligibleRequests) * 100;
    const errorPercent = (serverErrors / eligibleRequests) * 100;
    metrics.push(
      {
        code: "http_request_success_rate",
        value: successPercent,
        numerator: successfulRequests,
        denominator: eligibleRequests,
        sample_count: eligibleRequests,
        status: higherIsBetter(successPercent, 99.5, 99),
        measured_at: args.measuredAt,
        freshness_seconds: FRESHNESS_SECONDS
      },
      {
        code: "http_5xx_rate",
        value: errorPercent,
        numerator: serverErrors,
        denominator: eligibleRequests,
        sample_count: eligibleRequests,
        status: lowerIsBetter(errorPercent, 0.5, 1),
        measured_at: args.measuredAt,
        freshness_seconds: FRESHNESS_SECONDS
      },
      {
        code: "http_rate_limited_count",
        value: rateLimited,
        sample_count: eligibleRequests,
        status: lowerIsBetter(rateLimited, 10, 100),
        measured_at: args.measuredAt,
        freshness_seconds: FRESHNESS_SECONDS
      }
    );
  }

  if (elapsedSeconds && requestDelta !== null) {
    metrics.push({
      code: "http_requests_per_second",
      value: requestDelta / elapsedSeconds,
      sample_count: requestDelta,
      status: "unknown",
      measured_at: args.measuredAt,
      freshness_seconds: FRESHNESS_SECONDS
    });
  }

  if (histogramWindow) {
    for (const [code, quantile, warning, critical] of [
      ["http_latency_p50_seconds", 0.5, 0.5, 1],
      ["http_latency_p95_seconds", 0.95, 2, 5],
      ["http_latency_p99_seconds", 0.99, 5, 10]
    ] as const) {
      const value = histogramQuantile(histogramWindow, quantile);
      if (value === null) continue;
      metrics.push({
        code,
        value,
        sample_count: histogramWindow["+Inf"] ?? 0,
        status: lowerIsBetter(value, warning, critical),
        measured_at: args.measuredAt,
        freshness_seconds: FRESHNESS_SECONDS
      });
    }
  }

  if (args.previous) {
    for (const journey of ["project_open", "app_data_load"] as const) {
      const totalDelta = counterDelta(
        browserJourneyTotals[journey], args.previous.browserJourneyTotals?.[journey]
      );
      const successDelta = counterDelta(
        browserJourneySuccesses[journey], args.previous.browserJourneySuccesses?.[journey]
      );
      if (totalDelta !== null && successDelta !== null && totalDelta > 0) {
        const successPercent = successDelta / totalDelta * 100;
        metrics.push({
          code: `${journey}_success_rate`,
          value: successPercent,
          numerator: successDelta,
          denominator: totalDelta,
          sample_count: totalDelta,
          status: higherIsBetter(successPercent, 99, 95),
          measured_at: args.measuredAt,
          freshness_seconds: FRESHNESS_SECONDS
        });
      }
      const windowBuckets = bucketDelta(
        browserJourneyBuckets[journey], args.previous.browserJourneyBuckets?.[journey]
      );
      if (windowBuckets) {
        const p95 = histogramQuantile(windowBuckets, 0.95);
        if (p95 !== null) {
          metrics.push({
            code: `${journey}_p95_seconds`,
            value: p95,
            sample_count: windowBuckets["+Inf"] ?? 0,
            status: lowerIsBetter(p95, journey === "project_open" ? 15 : 10, journey === "project_open" ? 60 : 30),
            measured_at: args.measuredAt,
            freshness_seconds: FRESHNESS_SECONDS
          });
        }
      }
    }
    for (const [signal, code] of [
      ["js_error", "browser_runtime_error_count"],
      ["unhandled_rejection", "browser_unhandled_rejection_count"]
    ] as const) {
      const delta = counterDelta(browserRuntimeErrors[signal], args.previous.browserRuntimeErrors?.[signal]);
      if (delta !== null) {
        metrics.push({
          code,
          value: delta,
          sample_count: delta,
          status: lowerIsBetter(delta, 1, 10),
          measured_at: args.measuredAt,
          freshness_seconds: FRESHNESS_SECONDS
        });
      }
    }
    for (const [code, currentBuckets, previousBuckets, warning, critical] of [
      ["browser_long_task_p95_seconds", browserLongTaskBuckets, args.previous.browserLongTaskBuckets, 0.25, 1],
      ["browser_memory_p95_bytes", browserMemoryBuckets, args.previous.browserMemoryBuckets, 2 * 1024 ** 3, 4 * 1024 ** 3]
    ] as const) {
      const windowBuckets = bucketDelta(currentBuckets, previousBuckets);
      if (!windowBuckets) continue;
      const p95 = histogramQuantile(windowBuckets, 0.95);
      if (p95 === null) continue;
      metrics.push({
        code,
        value: p95,
        sample_count: windowBuckets["+Inf"] ?? 0,
        status: lowerIsBetter(p95, warning, critical),
        measured_at: args.measuredAt,
        freshness_seconds: FRESHNESS_SECONDS
      });
    }
  }

  return {
    metrics,
    state: {
      measuredAt: args.measuredAt,
      eligibleRequests,
      eligibleHistogramBuckets: histogramBuckets,
      browserJourneyTotals,
      browserJourneySuccesses,
      browserJourneyBuckets,
      browserRuntimeErrors,
      browserLongTaskBuckets,
      browserMemoryBuckets
    }
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizedBaseUrl(value: string, name: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error(`${name} must use HTTPS, except for loopback development.`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const environments: EnvironmentConfig[] = [];
  const sharedToken = env.ARCIGY_METRICS_TOKEN?.trim();
  for (const environment of ["develop", "main"] as const) {
    const prefix = `ARCIGY_${environment.toUpperCase()}`;
    environments.push({
      environment,
      baseUrl: normalizedBaseUrl(requiredEnv(env, `${prefix}_URL`), `${prefix}_URL`),
      metricsToken: env[`${prefix}_METRICS_TOKEN`]?.trim() || sharedToken,
      releaseVersion: env[`${prefix}_RELEASE_VERSION`]?.trim(),
      commitSha: env[`${prefix}_COMMIT_SHA`]?.trim()
    });
  }
  return {
    odooUrl: normalizedBaseUrl(requiredEnv(env, "ARCIGY_ODOO_URL"), "ARCIGY_ODOO_URL"),
    odooDatabase: env.ARCIGY_ODOO_DATABASE?.trim(),
    odooApiKey: requiredEnv(env, "ARCIGY_ODOO_API_KEY"),
    stateFile: requiredEnv(env, "ARCIGY_SAAS_SYNC_STATE_FILE"),
    environments
  };
}

async function readState(path: string): Promise<PersistedState> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? parsed as PersistedState : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function scrapeEnvironment(config: EnvironmentConfig, previous?: ScrapeState) {
  const metricsHeaders: Record<string, string> = {};
  if (config.metricsToken) metricsHeaders.Authorization = `Bearer ${config.metricsToken}`;
  const [{ response: metricsResponse, text: metricsText }, { response: readyResponse, text: readyText }] = await Promise.all([
    fetchExternalText(`${config.baseUrl}/metrics`, { headers: metricsHeaders }, { timeoutMs: 10_000, maxBytes: 4 * 1024 * 1024 }),
    fetchExternalText(`${config.baseUrl}/ready`, {}, { timeoutMs: 10_000, maxBytes: 64 * 1024 })
  ]);
  if (!metricsResponse.ok) throw new Error(`${config.environment} /metrics returned ${metricsResponse.status}.`);
  const readiness = readyResponse.ok ? parseReadyPayload(readyText) : undefined;
  const measuredAt = new Date().toISOString();
  return collectArcigyOdooMetrics({
    metricsText,
    metricsContentType: metricsResponse.headers.get("content-type"),
    measuredAt,
    ready: readyResponse.ok,
    readiness,
    previous
  });
}

async function sendToOdoo(config: SyncConfig, environment: EnvironmentConfig, metrics: OdooMetricPoint[]) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.odooApiKey}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Arcigy-SaaS-Metric-Sync/1.0"
  };
  if (config.odooDatabase) headers["X-Odoo-Database"] = config.odooDatabase;
  const payload = {
    payload: {
      environment: environment.environment,
      source_updated_at: new Date().toISOString(),
      release_version: environment.releaseVersion,
      commit_sha: environment.commitSha,
      metrics
    }
  };
  const { response, text } = await fetchExternalText(
    `${config.odooUrl}/json/2/saas.metric.current/ingest_metric_batch`,
    { method: "POST", headers, body: JSON.stringify(payload) },
    { timeoutMs: 15_000, maxBytes: 1024 * 1024 }
  );
  if (!response.ok) throw new Error(`Odoo ingest returned ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as unknown;
}

export async function runSaasOdooMetricSync(env: NodeJS.ProcessEnv = process.env) {
  const config = configFromEnv(env);
  const previous = await readState(config.stateFile);
  const nextState: PersistedState = { ...previous };
  const results = [];
  for (const environment of config.environments) {
    const previousState = previous[environment.environment];
    const collected = await scrapeEnvironment(environment, previousState);
    const metrics = collected.metrics.map((metric) => {
      if (!previousState) return metric;
      const elapsedSeconds = Math.max(
        1,
        (Date.parse(collected.state.measuredAt) - Date.parse(previousState.measuredAt)) / 1000
      );
      const granularity = elapsedSeconds <= 15 * 60 ? "5m" : elapsedSeconds <= 2 * 60 * 60 ? "hour" : "day";
      return {
        ...metric,
        external_key: `${environment.environment}:${metric.code}:${collected.state.measuredAt}`,
        period_start: previousState.measuredAt,
        period_end: collected.state.measuredAt,
        granularity
      } satisfies OdooMetricPoint;
    });
    const result = await sendToOdoo(config, environment, metrics);
    nextState[environment.environment] = collected.state;
    results.push({ environment: environment.environment, metrics: metrics.length, result });
  }
  await writeFile(config.stateFile, JSON.stringify(nextState, null, 2), { encoding: "utf8", mode: 0o600 });
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await runSaasOdooMetricSync();
  console.log(JSON.stringify({ ok: true, results }, null, 2));
}
