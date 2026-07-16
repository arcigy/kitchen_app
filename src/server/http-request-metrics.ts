import { timingSafeEqual } from "node:crypto";
import type http from "node:http";

const DURATION_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30] as const;

type MetricKey = string;

type RequestMetric = {
  method: string;
  route: string;
  status: number;
  count: number;
  durationSecondsSum: number;
  buckets: number[];
};

export type HttpRequestMetrics = ReturnType<typeof createHttpRequestMetrics>;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeHttpMetricRoute(rawUrl: string | undefined): string {
  const pathname = String(rawUrl ?? "/").split("?", 1)[0] || "/";
  const segments = pathname.split("/").filter(Boolean).map(safeDecode);
  if (pathname === "/" || pathname === "/health" || pathname === "/ready" || pathname === "/metrics") return pathname;
  if (segments[0] === "assets") return "/assets/*";
  if (segments[0] === "storage") return "/storage/*";
  if (segments[0] !== "api") return "/other";

  const normalized = [...segments];
  if (normalized[1] === "projects" && normalized[2]) normalized[2] = ":projectId";
  if (normalized[1] === "modules" && normalized[2]) normalized[2] = ":modulePackageId";
  if (normalized[1] === "supplier-bridge" && normalized[2] === "sessions" && normalized[3]) normalized[3] = ":sessionId";
  if (normalized[1] === "projects" && normalized[3] === "versions" && normalized[4]) normalized[4] = ":version";
  if (normalized[1] === "projects" && normalized[3] === "supplier-sync-sessions" && normalized[4]) normalized[4] = ":sessionId";
  return `/${normalized.join("/")}`;
}

function key(method: string, route: string, status: number): MetricKey {
  return `${method}\u0000${route}\u0000${status}`;
}

function label(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function positiveNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function createHttpRequestMetrics(options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const startedAtMs = now();
  const metrics = new Map<MetricKey, RequestMetric>();
  let inFlight = 0;

  const register = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const started = now();
    inFlight += 1;
    let recorded = false;
    const record = () => {
      if (recorded) return;
      recorded = true;
      inFlight = Math.max(0, inFlight - 1);
      const method = (req.method ?? "UNKNOWN").toUpperCase();
      const route = normalizeHttpMetricRoute(req.url);
      const status = res.statusCode || 0;
      const durationSeconds = Math.max(0, now() - started) / 1_000;
      const metricKey = key(method, route, status);
      const metric = metrics.get(metricKey) ?? {
        method,
        route,
        status,
        count: 0,
        durationSecondsSum: 0,
        buckets: DURATION_BUCKETS_SECONDS.map(() => 0)
      };
      metric.count += 1;
      metric.durationSecondsSum += durationSeconds;
      DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
        if (durationSeconds <= bucket) metric.buckets[index] += 1;
      });
      metrics.set(metricKey, metric);
    };
    res.once("finish", record);
    res.once("close", record);
  };

  const render = (): string => {
    const lines = [
      "# HELP arcigy_process_uptime_seconds Worker process uptime in seconds.",
      "# TYPE arcigy_process_uptime_seconds gauge",
      `arcigy_process_uptime_seconds ${positiveNumber(Math.max(0, now() - startedAtMs) / 1_000)}`,
      "# HELP arcigy_http_requests_in_flight Requests currently being processed by this worker.",
      "# TYPE arcigy_http_requests_in_flight gauge",
      `arcigy_http_requests_in_flight ${inFlight}`,
      "# HELP arcigy_http_requests_total Completed HTTP requests.",
      "# TYPE arcigy_http_requests_total counter",
      "# HELP arcigy_http_request_duration_seconds HTTP request duration in seconds.",
      "# TYPE arcigy_http_request_duration_seconds histogram"
    ];
    for (const metric of [...metrics.values()].sort((left, right) => key(left.method, left.route, left.status).localeCompare(key(right.method, right.route, right.status)))) {
      const labels = `method="${label(metric.method)}",route="${label(metric.route)}",status="${metric.status}"`;
      lines.push(`arcigy_http_requests_total{${labels}} ${metric.count}`);
      DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
        lines.push(`arcigy_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${metric.buckets[index]}`);
      });
      lines.push(`arcigy_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${metric.count}`);
      lines.push(`arcigy_http_request_duration_seconds_sum{${labels}} ${positiveNumber(metric.durationSecondsSum)}`);
      lines.push(`arcigy_http_request_duration_seconds_count{${labels}} ${metric.count}`);
    }
    return `${lines.join("\n")}\n`;
  };

  return { register, render };
}

function equalToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function canReadHttpMetrics(req: http.IncomingMessage, env: NodeJS.ProcessEnv = process.env): boolean {
  const requiredToken = env.ARCIGY_METRICS_TOKEN?.trim();
  if (!requiredToken) return env.NODE_ENV !== "production";
  const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  return typeof authorization === "string" && authorization.startsWith("Bearer ")
    && equalToken(authorization.slice("Bearer ".length), requiredToken);
}
