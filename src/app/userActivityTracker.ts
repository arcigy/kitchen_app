import type { UserActivityPulse, UserActivityPulseState } from "../core/user-activity/user-activity-types";
import { subscribeToLanguageChange, t } from "../i18n";

type UserActivityClientConfig = {
  enabled: boolean;
  heartbeatIntervalMs: number;
  idleThresholdMs: number;
  disclosure: string;
};

type ListenerName = "activity" | "visibility" | "focus" | "blur" | "pagehide" | "pageshow";
type SendMode = "fetch" | "beacon";

export type UserActivityTrackerDependencies = {
  loadConfig(): Promise<UserActivityClientConfig>;
  sendPulse(pulse: UserActivityPulse, mode: SendMode): Promise<void>;
  now(): Date;
  createTrackerId(): string;
  isVisible(): boolean;
  isFocused(): boolean;
  localDate(now: Date): string;
  timeZone(): string;
  addListener(name: ListenerName, listener: () => void): void;
  removeListener(name: ListenerName, listener: () => void): void;
  setInterval(callback: () => void, intervalMs: number): number;
  clearInterval(handle: number): void;
  mountIndicator(disclosure: string): { setState(state: UserActivityPulseState): void; remove(): void };
};

export type UserActivityTrackerController = ReturnType<typeof createUserActivityTracker>;

export function createUserActivityTracker(deps: UserActivityTrackerDependencies) {
  let started = false;
  let enabled = false;
  let sequence = 0;
  let lastInteractionAt = 0;
  let lastSentState: UserActivityPulseState | null = null;
  let heartbeatHandle: number | null = null;
  let idleThresholdMs = 0;
  let indicator: ReturnType<UserActivityTrackerDependencies["mountIndicator"]> | null = null;
  const trackerId = deps.createTrackerId();

  const currentState = (nowMs: number): UserActivityPulseState => {
    if (!deps.isVisible() || !deps.isFocused()) return "hidden";
    return nowMs - lastInteractionAt >= idleThresholdMs ? "idle" : "active";
  };

  const send = async (
    force: boolean,
    overrideState?: UserActivityPulseState,
    mode: SendMode = "fetch"
  ): Promise<void> => {
    if (!started || !enabled) return;
    const now = deps.now();
    const state = overrideState ?? currentState(now.getTime());
    if (!force && state === lastSentState) return;
    sequence += 1;
    lastSentState = state;
    indicator?.setState(state);
    try {
      await deps.sendPulse({
        trackerId,
        sequence,
        state,
        localDate: deps.localDate(now),
        timeZone: deps.timeZone()
      }, mode);
    } catch {
      // Activity accounting is best effort and must never interrupt editor work.
    }
  };

  const onActivity = (): void => {
    const wasIdle = currentState(deps.now().getTime()) !== "active";
    lastInteractionAt = deps.now().getTime();
    if (wasIdle) void send(false);
  };
  const onVisibility = (): void => { void send(false); };
  const onPageHide = (): void => { void send(true, "hidden", "beacon"); };
  const listeners: Array<[ListenerName, () => void]> = [
    ["activity", onActivity],
    ["visibility", onVisibility],
    ["focus", onVisibility],
    ["blur", onVisibility],
    ["pagehide", onPageHide],
    ["pageshow", onVisibility]
  ];

  const start = async (): Promise<void> => {
    if (started) return;
    started = true;
    let config: UserActivityClientConfig;
    try {
      config = await deps.loadConfig();
    } catch {
      started = false;
      return;
    }
    if (!started) return;
    if (!config.enabled) {
      started = false;
      return;
    }
    enabled = true;
    idleThresholdMs = config.idleThresholdMs;
    lastInteractionAt = deps.now().getTime();
    indicator = deps.mountIndicator(config.disclosure);
    for (const [name, listener] of listeners) deps.addListener(name, listener);
    heartbeatHandle = deps.setInterval(() => { void send(true); }, config.heartbeatIntervalMs);
    await send(true);
  };

  const stop = async (): Promise<void> => {
    if (!started) return;
    for (const [name, listener] of listeners) deps.removeListener(name, listener);
    if (heartbeatHandle !== null) deps.clearInterval(heartbeatHandle);
    heartbeatHandle = null;
    await send(true, "hidden");
    indicator?.remove();
    indicator = null;
    enabled = false;
    started = false;
  };

  return { start, stop };
}

function browserLocalDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function createDefaultDependencies(): UserActivityTrackerDependencies | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const activityEvents = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
  const targets: Record<Exclude<ListenerName, "activity">, EventTarget> = {
    visibility: document,
    focus: window,
    blur: window,
    pagehide: window,
    pageshow: window
  };
  const eventName: Record<Exclude<ListenerName, "activity">, string> = {
    visibility: "visibilitychange",
    focus: "focus",
    blur: "blur",
    pagehide: "pagehide",
    pageshow: "pageshow"
  };
  return {
    loadConfig: async () => {
      const response = await fetch("/api/user-activity/config", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("User activity configuration is unavailable.");
      const value = await response.json() as Partial<UserActivityClientConfig>;
      if (
        typeof value.enabled !== "boolean"
        || typeof value.heartbeatIntervalMs !== "number"
        || typeof value.idleThresholdMs !== "number"
        || typeof value.disclosure !== "string"
      ) throw new Error("Invalid user activity configuration.");
      return value as UserActivityClientConfig;
    },
    sendPulse: async (pulse, mode) => {
      const body = JSON.stringify(pulse);
      if (mode === "beacon" && typeof navigator.sendBeacon === "function") {
        const queued = navigator.sendBeacon(
          "/api/user-activity/pulse",
          new Blob([body], { type: "application/json; charset=utf-8" })
        );
        if (queued) return;
      }
      const response = await fetch("/api/user-activity/pulse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body,
        keepalive: true
      });
      if (!response.ok) throw new Error("User activity pulse was rejected.");
    },
    now: () => new Date(),
    createTrackerId: () => crypto.randomUUID(),
    isVisible: () => document.visibilityState === "visible",
    isFocused: () => document.hasFocus(),
    localDate: browserLocalDate,
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    addListener: (name, listener) => {
      if (name === "activity") {
        for (const type of activityEvents) window.addEventListener(type, listener, { passive: true });
        return;
      }
      targets[name].addEventListener(eventName[name], listener);
    },
    removeListener: (name, listener) => {
      if (name === "activity") {
        for (const type of activityEvents) window.removeEventListener(type, listener);
        return;
      }
      targets[name].removeEventListener(eventName[name], listener);
    },
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: (handle) => window.clearInterval(handle),
    mountIndicator: (disclosure) => {
      const element = document.createElement("div");
      element.className = "user-activity-indicator";
      element.setAttribute("role", "status");
      element.setAttribute("aria-live", "polite");
      let currentState: UserActivityPulseState = "hidden";
      const render = (): void => {
        element.title = t(disclosure);
        element.textContent = currentState === "active"
          ? t("Activity tracking: active")
          : currentState === "idle"
            ? t("Activity tracking: idle")
            : t("Activity tracking: outside the app");
      };
      const unsubscribe = subscribeToLanguageChange(render);
      render();
      document.body.append(element);
      return {
        setState: (state) => {
          currentState = state;
          element.dataset.state = state;
          render();
        },
        remove: () => {
          unsubscribe();
          element.remove();
        }
      };
    }
  };
}

let defaultController: UserActivityTrackerController | null = null;

function getDefaultController(): UserActivityTrackerController | null {
  if (defaultController) return defaultController;
  const deps = createDefaultDependencies();
  if (!deps) return null;
  defaultController = createUserActivityTracker(deps);
  return defaultController;
}

export async function startUserActivityTracking(): Promise<void> {
  await getDefaultController()?.start();
}

export async function stopUserActivityTracking(): Promise<void> {
  await getDefaultController()?.stop();
}
