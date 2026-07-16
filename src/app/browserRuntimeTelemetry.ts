import { reportBrowserRuntime, type BrowserRuntimeMetric } from "./clientJourneyTelemetry";

const MAX_LONG_TASKS = 100;
const MAX_RUNTIME_FAILURES = 20;
const MAX_MEMORY_SAMPLES = 4;
const MAX_LONG_TASK_MS = 15 * 60 * 1_000;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024 * 1024;
const INITIAL_MEMORY_SAMPLE_DELAY_MS = 10_000;

type RuntimeFailureSignal = "js_error" | "unhandled_rejection";

export type BrowserRuntimeTelemetryDependencies = {
  send(metric: BrowserRuntimeMetric): void;
  addEventListener(type: RuntimeFailureSignal, listener: EventListener): void;
  removeEventListener(type: RuntimeFailureSignal, listener: EventListener): void;
  observeLongTasks(onDuration: (durationMs: number) => void): (() => void) | null;
  readMemoryBytes(): Promise<number | null>;
  schedule(callback: () => void, delayMs: number): number;
  cancelScheduled(handle: number): void;
};

export type BrowserRuntimeTelemetryController = ReturnType<typeof createBrowserRuntimeTelemetry>;

export function createBrowserRuntimeTelemetry(deps: BrowserRuntimeTelemetryDependencies) {
  let started = false;
  let longTaskCount = 0;
  let jsErrorCount = 0;
  let rejectionCount = 0;
  let memorySampleCount = 0;
  let disconnectLongTasks: (() => void) | null = null;
  let memoryTimer: number | null = null;

  const send = (metric: BrowserRuntimeMetric): void => {
    try {
      deps.send(metric);
    } catch {
      // Runtime telemetry must never affect the application.
    }
  };

  const reportFailure = (signal: RuntimeFailureSignal): void => {
    const count = signal === "js_error" ? jsErrorCount : rejectionCount;
    if (!started || count >= MAX_RUNTIME_FAILURES) return;
    if (signal === "js_error") jsErrorCount += 1;
    else rejectionCount += 1;
    send({ signal, value: 1 });
  };

  const reportLongTask = (durationMs: number): void => {
    if (!started || longTaskCount >= MAX_LONG_TASKS || !Number.isFinite(durationMs) || durationMs < 0) return;
    longTaskCount += 1;
    send({ signal: "long_task", value: Math.min(MAX_LONG_TASK_MS, durationMs) });
  };

  const onJsError: EventListener = () => reportFailure("js_error");
  const onUnhandledRejection: EventListener = () => reportFailure("unhandled_rejection");

  const sampleMemory = async (): Promise<void> => {
    if (!started || memorySampleCount >= MAX_MEMORY_SAMPLES) return;
    memorySampleCount += 1;
    try {
      const bytes = await deps.readMemoryBytes();
      if (!started || bytes === null || !Number.isFinite(bytes) || bytes < 0) return;
      send({ signal: "memory_used", value: Math.min(MAX_MEMORY_BYTES, bytes) });
    } catch {
      // Unsupported or denied memory measurements are expected and best effort.
    }
  };

  const start = (): void => {
    if (started) return;
    started = true;
    deps.addEventListener("js_error", onJsError);
    deps.addEventListener("unhandled_rejection", onUnhandledRejection);
    try {
      disconnectLongTasks = deps.observeLongTasks(reportLongTask);
    } catch {
      disconnectLongTasks = null;
    }
    memoryTimer = deps.schedule(() => {
      memoryTimer = null;
      void sampleMemory();
    }, INITIAL_MEMORY_SAMPLE_DELAY_MS);
  };

  const stop = (): void => {
    if (!started) return;
    started = false;
    deps.removeEventListener("js_error", onJsError);
    deps.removeEventListener("unhandled_rejection", onUnhandledRejection);
    disconnectLongTasks?.();
    disconnectLongTasks = null;
    if (memoryTimer !== null) deps.cancelScheduled(memoryTimer);
    memoryTimer = null;
  };

  return { start, stop, sampleMemory };
}

type MemoryPerformance = Performance & {
  measureUserAgentSpecificMemory?: () => Promise<{ bytes?: unknown }>;
  memory?: { usedJSHeapSize?: unknown };
};

function createDefaultDependencies(): BrowserRuntimeTelemetryDependencies | null {
  if (typeof window === "undefined" || typeof performance === "undefined") return null;
  const runtimePerformance = performance as MemoryPerformance;
  return {
    send: reportBrowserRuntime,
    addEventListener: (type, listener) => window.addEventListener(type === "js_error" ? "error" : type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type === "js_error" ? "error" : type, listener),
    observeLongTasks: (onDuration) => {
      if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes.includes("longtask")) return null;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) onDuration(entry.duration);
      });
      observer.observe({ type: "longtask", buffered: true });
      return () => observer.disconnect();
    },
    readMemoryBytes: async () => {
      const measure = runtimePerformance.measureUserAgentSpecificMemory;
      if (typeof measure === "function") {
        try {
          const result = await measure.call(runtimePerformance);
          if (typeof result.bytes === "number" && Number.isFinite(result.bytes)) return result.bytes;
        } catch {
          // Cross-origin isolation or browser support may deny the preferred API.
        }
      }
      const legacyBytes = runtimePerformance.memory?.usedJSHeapSize;
      return typeof legacyBytes === "number" && Number.isFinite(legacyBytes) ? legacyBytes : null;
    },
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle)
  };
}

let defaultController: BrowserRuntimeTelemetryController | null = null;

function getDefaultController(): BrowserRuntimeTelemetryController | null {
  if (defaultController) return defaultController;
  const deps = createDefaultDependencies();
  if (!deps) return null;
  defaultController = createBrowserRuntimeTelemetry(deps);
  return defaultController;
}

export function startBrowserRuntimeTelemetry(): void {
  getDefaultController()?.start();
}

export function sampleBrowserRuntimeMemory(): void {
  void getDefaultController()?.sampleMemory();
}
