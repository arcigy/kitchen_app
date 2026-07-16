import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";

const DURATION_BUCKETS_SECONDS = [1, 2.5, 5, 10, 15, 30, 60, 120, 300, 600] as const;
const LONG_TASK_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600] as const;
const MEMORY_BUCKETS_BYTES = [
  64 * 1024 * 1024,
  128 * 1024 * 1024,
  256 * 1024 * 1024,
  512 * 1024 * 1024,
  1024 * 1024 * 1024,
  2 * 1024 * 1024 * 1024,
  4 * 1024 * 1024 * 1024,
  8 * 1024 * 1024 * 1024,
  16 * 1024 * 1024 * 1024,
  32 * 1024 * 1024 * 1024,
  64 * 1024 * 1024 * 1024
] as const;
const MAX_DURATION_MS = 15 * 60 * 1_000;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024 * 1024;

const JOURNEY_VARIANTS = {
  app_data_load: ["local", "network", "persistent_cache", "session_cache"],
  project_open: [
    "blank",
    "blank_local",
    "blank_network",
    "blank_persistent_cache",
    "blank_session_cache",
    "created",
    "created_local",
    "created_network",
    "created_persistent_cache",
    "created_session_cache",
    "loaded",
    "loaded_local",
    "loaded_network",
    "loaded_persistent_cache",
    "loaded_session_cache"
  ]
} as const;

type ClientJourney = keyof typeof JOURNEY_VARIANTS;
type ClientJourneyOutcome = "failure" | "success";

export type ClientJourneyMetric = {
  journey: ClientJourney;
  variant: string;
  outcome: ClientJourneyOutcome;
  durationMs: number;
};

export type ClientRuntimeMetric = {
  signal: "js_error" | "long_task" | "memory_used" | "unhandled_rejection";
  value: number;
};

type Aggregate = ClientJourneyMetric & {
  count: number;
  durationSecondsSum: number;
  buckets: number[];
};

type HistogramAggregate = {
  count: number;
  sum: number;
  buckets: number[];
};

export type ClientJourneyMetrics = ReturnType<typeof createClientJourneyMetrics>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseClientJourneyMetric(value: unknown): ClientJourneyMetric | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).sort().join("\u0000") !== "durationMs\u0000journey\u0000outcome\u0000variant") return null;
  const journey = value.journey;
  const variant = value.variant;
  const outcome = value.outcome;
  const durationMs = value.durationMs;
  if (typeof journey !== "string" || !(journey in JOURNEY_VARIANTS)) return null;
  if (typeof variant !== "string" || !(JOURNEY_VARIANTS[journey as ClientJourney] as readonly string[]).includes(variant)) return null;
  if (outcome !== "success" && outcome !== "failure") return null;
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) return null;
  return { journey: journey as ClientJourney, variant, outcome, durationMs };
}

export function parseClientRuntimeMetric(value: unknown): ClientRuntimeMetric | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).sort().join("\u0000") !== "signal\u0000value") return null;
  const signal = value.signal;
  const metricValue = value.value;
  if (signal !== "js_error" && signal !== "long_task" && signal !== "memory_used" && signal !== "unhandled_rejection") return null;
  if (typeof metricValue !== "number" || !Number.isFinite(metricValue)) return null;
  if ((signal === "js_error" || signal === "unhandled_rejection") && metricValue !== 1) return null;
  if (signal === "long_task" && (metricValue < 0 || metricValue > MAX_DURATION_MS)) return null;
  if (signal === "memory_used" && (metricValue < 0 || metricValue > MAX_MEMORY_BYTES)) return null;
  return { signal, value: metricValue };
}

function metricKey(metric: ClientJourneyMetric): string {
  return `${metric.journey}\u0000${metric.variant}\u0000${metric.outcome}`;
}

function positiveNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function createHistogramAggregate(bucketCount: number): HistogramAggregate {
  return { count: 0, sum: 0, buckets: Array.from({ length: bucketCount }, () => 0) };
}

function recordHistogram(aggregate: HistogramAggregate, value: number, buckets: readonly number[]): void {
  aggregate.count += 1;
  aggregate.sum += value;
  buckets.forEach((bucket, index) => {
    if (value <= bucket) aggregate.buckets[index] += 1;
  });
}

function appendHistogram(
  lines: string[],
  metricName: string,
  aggregate: HistogramAggregate,
  buckets: readonly number[]
): void {
  buckets.forEach((bucket, index) => {
    lines.push(`${metricName}_bucket{le="${positiveNumber(bucket)}"} ${aggregate.buckets[index]}`);
  });
  lines.push(`${metricName}_bucket{le="+Inf"} ${aggregate.count}`);
  lines.push(`${metricName}_sum ${positiveNumber(aggregate.sum)}`);
  lines.push(`${metricName}_count ${aggregate.count}`);
}

export function createClientJourneyMetrics() {
  const aggregates = new Map<string, Aggregate>();
  const runtimeErrorCounts = new Map<ClientRuntimeMetric["signal"], number>();
  const longTasks = createHistogramAggregate(LONG_TASK_BUCKETS_SECONDS.length);
  const memorySamples = createHistogramAggregate(MEMORY_BUCKETS_BYTES.length);

  const record = (metric: ClientJourneyMetric): void => {
    const durationSeconds = metric.durationMs / 1_000;
    const key = metricKey(metric);
    const aggregate = aggregates.get(key) ?? {
      ...metric,
      count: 0,
      durationSecondsSum: 0,
      buckets: DURATION_BUCKETS_SECONDS.map(() => 0)
    };
    aggregate.count += 1;
    aggregate.durationSecondsSum += durationSeconds;
    DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      if (durationSeconds <= bucket) aggregate.buckets[index] += 1;
    });
    aggregates.set(key, aggregate);
  };

  const recordRuntime = (metric: ClientRuntimeMetric): void => {
    if (metric.signal === "js_error" || metric.signal === "unhandled_rejection") {
      runtimeErrorCounts.set(metric.signal, (runtimeErrorCounts.get(metric.signal) ?? 0) + 1);
      return;
    }
    if (metric.signal === "long_task") {
      recordHistogram(longTasks, metric.value / 1_000, LONG_TASK_BUCKETS_SECONDS);
      return;
    }
    recordHistogram(memorySamples, metric.value, MEMORY_BUCKETS_BYTES);
  };

  const render = (): string => {
    const lines = [
      "# HELP arcigy_browser_journey_total Completed browser journeys reported by authenticated clients.",
      "# TYPE arcigy_browser_journey_total counter",
      "# HELP arcigy_browser_journey_duration_seconds Authenticated browser journey duration in seconds.",
      "# TYPE arcigy_browser_journey_duration_seconds histogram",
      "# HELP arcigy_browser_runtime_errors_total Authenticated browser runtime failures by fixed signal.",
      "# TYPE arcigy_browser_runtime_errors_total counter",
      "# HELP arcigy_browser_long_task_duration_seconds Authenticated browser main-thread long-task duration in seconds.",
      "# TYPE arcigy_browser_long_task_duration_seconds histogram",
      "# HELP arcigy_browser_memory_used_bytes Authenticated browser page memory samples in bytes.",
      "# TYPE arcigy_browser_memory_used_bytes histogram"
    ];
    for (const aggregate of [...aggregates.values()].sort((left, right) => metricKey(left).localeCompare(metricKey(right)))) {
      const labels = `journey="${aggregate.journey}",variant="${aggregate.variant}",outcome="${aggregate.outcome}"`;
      lines.push(`arcigy_browser_journey_total{${labels}} ${aggregate.count}`);
      DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
        lines.push(`arcigy_browser_journey_duration_seconds_bucket{${labels},le="${bucket}"} ${aggregate.buckets[index]}`);
      });
      lines.push(`arcigy_browser_journey_duration_seconds_bucket{${labels},le="+Inf"} ${aggregate.count}`);
      lines.push(`arcigy_browser_journey_duration_seconds_sum{${labels}} ${positiveNumber(aggregate.durationSecondsSum)}`);
      lines.push(`arcigy_browser_journey_duration_seconds_count{${labels}} ${aggregate.count}`);
    }
    for (const signal of ["js_error", "unhandled_rejection"] as const) {
      const count = runtimeErrorCounts.get(signal);
      if (count) lines.push(`arcigy_browser_runtime_errors_total{signal="${signal}"} ${count}`);
    }
    appendHistogram(lines, "arcigy_browser_long_task_duration_seconds", longTasks, LONG_TASK_BUCKETS_SECONDS);
    appendHistogram(lines, "arcigy_browser_memory_used_bytes", memorySamples, MEMORY_BUCKETS_BYTES);
    return `${lines.join("\n")}\n`;
  };

  return { record, recordRuntime, render };
}

type ClientJourneyMetricsEndpointDeps = {
  getContext(cookieHeader: string | string[] | undefined): Promise<ClientContext>;
  readJsonBody(req: http.IncomingMessage): Promise<unknown>;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
  metrics: ClientJourneyMetrics;
};

export async function handleClientJourneyMetricsApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ClientJourneyMetricsEndpointDeps
): Promise<boolean> {
  if (req.method !== "POST" || url.pathname !== "/api/client-metrics") return false;

  await deps.getContext(req.headers.cookie);
  const body = await deps.readJsonBody(req);
  const journeyMetric = parseClientJourneyMetric(body);
  const runtimeMetric = journeyMetric ? null : parseClientRuntimeMetric(body);
  if (!journeyMetric && !runtimeMetric) {
    deps.sendJson(res, 400, { ok: false, error: "Invalid client browser metric." });
    return true;
  }
  if (journeyMetric) deps.metrics.record(journeyMetric);
  else deps.metrics.recordRuntime(runtimeMetric!);
  deps.sendJson(res, 202, { ok: true });
  return true;
}
