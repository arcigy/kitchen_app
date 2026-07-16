import type { SaasLoadScenario } from "./saasLoadTestConfig";

export type SaasLoadSample = {
  name: string;
  durationMs: number;
  ok: boolean;
  status: number;
  decodedResponseBytes: number;
};

export type SaasLoadMetricSummaryInput = {
  samples: SaasLoadSample[];
  target: string;
  scenario: SaasLoadScenario;
  concurrency: number;
  elapsedSeconds: number;
  p95ThresholdMs: number;
  errorRateThreshold: number;
};

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))]!;
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function statusCounts(samples: SaasLoadSample[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(samples.map((sample) => sample.status))]
      .sort((left, right) => left - right)
      .map((status) => [String(status), samples.filter((sample) => sample.status === status).length])
  );
}

function aggregate(samples: SaasLoadSample[], elapsedSeconds: number) {
  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const failures = samples.filter((sample) => !sample.ok).length;
  const decodedResponseBytes = samples.reduce((sum, sample) => sum + sample.decodedResponseBytes, 0);
  return {
    requests: samples.length,
    requestsPerSecond: round(samples.length / elapsedSeconds),
    failures,
    errorRate: round(samples.length > 0 ? failures / samples.length : 1, 6),
    decodedResponseBytes,
    decodedResponseMegabytes: round(decodedResponseBytes / (1024 * 1024)),
    decodedResponseMegabytesPerSecond: round(decodedResponseBytes / (1024 * 1024) / elapsedSeconds),
    latencyMs: {
      p50: round(percentile(durations, 0.5)),
      p95: round(percentile(durations, 0.95)),
      p99: round(percentile(durations, 0.99)),
      max: round(durations.at(-1) ?? 0)
    },
    statusCounts: statusCounts(samples)
  };
}

export function summarizeSaasLoadTest(input: SaasLoadMetricSummaryInput) {
  const elapsedSeconds = Math.max(0.001, input.elapsedSeconds);
  const total = aggregate(input.samples, elapsedSeconds);
  const routeNames = [...new Set(input.samples.map((sample) => sample.name))].sort();
  const byRoute = routeNames.map((name) => ({
    name,
    ...aggregate(input.samples.filter((sample) => sample.name === name), elapsedSeconds)
  }));
  return {
    ok: input.samples.length > 0
      && total.errorRate <= input.errorRateThreshold
      && total.latencyMs.p95 <= input.p95ThresholdMs,
    target: input.target,
    scenario: input.scenario,
    concurrency: input.concurrency,
    durationSeconds: round(elapsedSeconds),
    ...total,
    thresholds: {
      p95Ms: input.p95ThresholdMs,
      errorRate: input.errorRateThreshold
    },
    byRoute
  };
}
