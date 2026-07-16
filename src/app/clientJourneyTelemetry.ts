export type BrowserJourneyMetric = {
  journey: "app_data_load" | "project_open";
  variant:
    | "blank"
    | "blank_local"
    | "blank_network"
    | "blank_persistent_cache"
    | "blank_session_cache"
    | "created"
    | "created_local"
    | "created_network"
    | "created_persistent_cache"
    | "created_session_cache"
    | "loaded"
    | "loaded_local"
    | "loaded_network"
    | "loaded_persistent_cache"
    | "loaded_session_cache"
    | "local"
    | "network"
    | "persistent_cache"
    | "session_cache";
  outcome: "failure" | "success";
  durationMs: number;
};

export type BrowserRuntimeMetric = {
  signal: "js_error" | "long_task" | "memory_used" | "unhandled_rejection";
  value: number;
};

export function browserJourneyNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function reportBrowserMetric(metric: BrowserJourneyMetric | BrowserRuntimeMetric): void {
  try {
    const sendBeacon = window.navigator?.sendBeacon;
    if (typeof sendBeacon !== "function") return;
    const body = JSON.stringify(metric);
    sendBeacon.call(window.navigator, "/api/client-metrics", new Blob([body], { type: "application/json" }));
  } catch {
    // Telemetry is best effort and must never affect a product journey.
  }
}

export function reportBrowserJourney(metric: BrowserJourneyMetric): void {
  reportBrowserMetric({
    journey: metric.journey,
    variant: metric.variant,
    outcome: metric.outcome,
    durationMs: Math.max(0, Math.min(15 * 60 * 1_000, metric.durationMs))
  });
}

export function reportBrowserRuntime(metric: BrowserRuntimeMetric): void {
  reportBrowserMetric({ signal: metric.signal, value: metric.value });
}
