import type { SupplierSyncSessionView } from "../core/supplier-bridge/supplier-bridge-types";
import { EMPTY_SUPPLIER_BRIDGE_PANEL_STATE, type SupplierBridgePanelState } from "../ui/materialsPhasePanel";
import { cancelSupplierSyncSession, createSupplierSyncSession, loadConfiguredSuppliers, loadSupplierSyncSession } from "./supplierBridgeApi";

export type ConfiguredSupplierId = string;

type BridgeRequestType = "START_SUPPLIER_SESSION" | "OPEN_SUPPLIER_BRIDGE" | "GET_SUPPLIER_SESSION_STATUS" | "CANCEL_SUPPLIER_SESSION" | "SET_SUPPLIER_PROJECT_CONTEXT";
type BridgeResponse = { source: "ARCIGY_EXTENSION"; type: "ARCIGY_BRIDGE_READY" | "SUPPLIER_BRIDGE_RESULT"; requestId: string; nonce: string; sessionId: string | null; ok: boolean; opened: boolean; errorCode: string | null };

export type SupplierBridgeWebControllerArgs = {
  getProjectId: () => string | null;
  getProjectLabel?: () => string | null;
  onStateChanged: (state: SupplierBridgePanelState) => void;
  onProjectMaterialsChanged: () => Promise<void> | void;
  pollIntervalMs?: number;
};

function parseResponse(value: unknown): BridgeResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.source !== "ARCIGY_EXTENSION" || !["ARCIGY_BRIDGE_READY", "SUPPLIER_BRIDGE_RESULT"].includes(String(input.type))) return null;
  if (typeof input.requestId !== "string" || typeof input.nonce !== "string" || (input.sessionId !== null && typeof input.sessionId !== "string")) return null;
  if (typeof input.ok !== "boolean" || typeof input.opened !== "boolean" || (input.errorCode !== null && typeof input.errorCode !== "string")) return null;
  return input as BridgeResponse;
}

function warningsFor(view: SupplierSyncSessionView): string[] {
  return [...new Set(view.items.flatMap((item) => item.errorCode ? [item.errorCode] : item.status === "failed" ? ["Položku sa nepodarilo spracovať."] : []))];
}

function stateFromView(view: SupplierSyncSessionView, current: SupplierBridgePanelState): SupplierBridgePanelState {
  return {
    ...current,
    busy: false,
    sessionStatus: view.session.status,
    processed: view.counts.processed,
    total: view.counts.total,
    needsConfirmation: view.counts.needsConfirmation,
    completed: view.counts.completed,
    warnings: warningsFor(view)
  };
}

export function createSupplierBridgeWebController(args: SupplierBridgeWebControllerArgs) {
  let active = false;
  let sessionId: string | null = null;
  let sessionProjectId: string | null = null;
  let pollTimer: number | null = null;
  let pollAbort: AbortController | null = null;
  let state: SupplierBridgePanelState = { ...EMPTY_SUPPLIER_BRIDGE_PANEL_STATE };
  let lastCompleted = 0;
  const pending = new Map<string, { nonce: string; sessionId: string; resolve: (response: BridgeResponse) => void; reject: (error: Error) => void; timer: number }>();
  const emit = (next: SupplierBridgePanelState) => { state = structuredClone(next); args.onStateChanged(state); };

  const onWindowMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const response = parseResponse(event.data);
    if (!response) return;
    if (response.type === "ARCIGY_BRIDGE_READY") {
      emit({ ...state, connection: "connected" });
      return;
    }
    const waiter = pending.get(response.requestId);
    if (!waiter || waiter.nonce !== response.nonce || waiter.sessionId !== response.sessionId) return;
    window.clearTimeout(waiter.timer);
    pending.delete(response.requestId);
    waiter.resolve(response);
  };
  window.addEventListener("message", onWindowMessage);

  const requestExtension = (type: BridgeRequestType, requestedSessionId: string, bridgeToken?: string, timeoutMs = 1_800): Promise<BridgeResponse> => {
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { pending.delete(requestId); reject(new Error("Arcigy Supplier Bridge rozšírenie neodpovedá.")); }, timeoutMs);
      pending.set(requestId, { nonce, sessionId: requestedSessionId, resolve, reject, timer });
      window.postMessage({
        source: "ARCIGY_WEB",
        type,
        requestId,
        nonce,
        sessionId: requestedSessionId,
        ...(bridgeToken ? { bridgeToken, projectLabel: args.getProjectLabel?.() ?? "" } : {}),
        ...(type === "SET_SUPPLIER_PROJECT_CONTEXT" ? { projectId: args.getProjectId() ?? "", projectLabel: args.getProjectLabel?.() ?? "" } : {})
      }, window.location.origin);
    });
  };

  const stopPolling = () => {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
    pollAbort?.abort();
    pollAbort = null;
  };

  const resetProjectSession = (projectId: string | null) => {
    if (sessionProjectId === projectId) return;
    sessionId = null;
    sessionProjectId = projectId;
    lastCompleted = 0;
    emit({ ...state, sessionStatus: null, processed: 0, total: 0, needsConfirmation: 0, completed: 0, warnings: [] });
  };

  const syncProjectContext = async (): Promise<void> => {
    const projectId = args.getProjectId();
    resetProjectSession(projectId);
    if (!projectId) return;
    await requestExtension("SET_SUPPLIER_PROJECT_CONTEXT", "arcigy-project-context", undefined, 1_200);
  };

  const schedulePoll = () => {
    if (!active || !sessionId || ["completed", "cancelled", "expired", "failed"].includes(state.sessionStatus ?? "")) return;
    pollTimer = window.setTimeout(() => void poll(), args.pollIntervalMs ?? 1_500);
  };

  const applyView = async (view: SupplierSyncSessionView) => {
    const changed = view.counts.completed > lastCompleted;
    lastCompleted = view.counts.completed;
    emit(stateFromView(view, state));
    if (changed) await args.onProjectMaterialsChanged();
  };

  const poll = async () => {
    const projectId = args.getProjectId();
    if (!active || !projectId || !sessionId) return;
    pollAbort?.abort();
    const abort = new AbortController();
    pollAbort = abort;
    try { await applyView(await loadSupplierSyncSession(projectId, sessionId, abort.signal)); }
    catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      emit({ ...state, warnings: [...state.warnings, error instanceof Error ? error.message : "Session sa nepodarila obnoviť."].slice(-4) });
    } finally {
      if (pollAbort === abort) pollAbort = null;
      schedulePoll();
    }
  };

  return {
    async open(): Promise<void> {
      active = true;
      const projectId = args.getProjectId();
      emit({ ...state, connection: "checking" });
      try {
        emit({ ...state, suppliers: await loadConfiguredSuppliers() });
      } catch (error) {
        emit({ ...state, suppliers: [], warnings: [...state.warnings, error instanceof Error ? error.message : "Zoznam dodávateľov sa nepodarilo načítať."].slice(-4) });
      }
      if (projectId) {
        try { await syncProjectContext(); }
        catch { /* The connection check below displays extension availability. */ }
      }
      try {
        await requestExtension("OPEN_SUPPLIER_BRIDGE", sessionId ?? "arcigy-connection-probe", undefined, 1_200);
        emit({ ...state, connection: "connected" });
      } catch {
        emit({ ...state, connection: "unavailable" });
      }
      schedulePoll();
    },
    close(): void { active = false; stopPolling(); },
    async syncProjectContext(): Promise<void> {
      await syncProjectContext();
    },
    async start(supplierId: ConfiguredSupplierId): Promise<void> {
      const projectId = args.getProjectId();
      if (!projectId) {
        emit({ ...state, warnings: ["Najprv vytvorte alebo otvorte projekt."] });
        return;
      }
      const supplier = state.suppliers.find((candidate) => candidate.supplierId === supplierId);
      if (!supplier) {
        emit({ ...state, warnings: ["Tento dodávateľ nie je povolený pre aktuálneho klienta."] });
        return;
      }
      // Keep both calls before the first await so Chrome treats them as part of the user's selection gesture.
      const supplierTab = window.open(supplier.startUrl, "_blank", "noopener");
      const earlyPanelOpen = requestExtension("OPEN_SUPPLIER_BRIDGE", "arcigy-connection-probe", undefined, 1_800)
        .catch(() => null);
      stopPolling();
      emit({
        ...state,
        busy: true,
        warnings: supplierTab ? [] : ["Chrome zablokoval otvorenie karty dodávateľa. Povoľte vyskakovacie okná pre Arcigy."],
        fallbackInstruction: false
      });
      try {
        const created = await createSupplierSyncSession(projectId, supplierId);
        sessionId = created.view.session.id;
        sessionProjectId = projectId;
        lastCompleted = created.view.counts.completed;
        emit({ ...stateFromView(created.view, state), busy: true });
        try {
          await earlyPanelOpen;
          const response = await requestExtension("START_SUPPLIER_SESSION", sessionId, created.bridgeToken, 4_000);
          emit({ ...state, busy: false, connection: "connected", fallbackInstruction: !response.opened, warnings: response.ok ? state.warnings : [...state.warnings, response.errorCode ?? "Rozšírenie session neotvorilo."] });
        } catch (error) {
          emit({ ...state, busy: false, connection: "unavailable", fallbackInstruction: true, warnings: [...state.warnings, error instanceof Error ? error.message : "Rozšírenie nie je dostupné."] });
        }
        schedulePoll();
      } catch (error) {
        emit({ ...state, busy: false, warnings: [error instanceof Error ? error.message : "Supplier session sa nepodarila vytvoriť."] });
      }
    },
    async cancel(): Promise<void> {
      const projectId = args.getProjectId();
      if (!projectId || !sessionId) return;
      emit({ ...state, busy: true });
      stopPolling();
      try {
        await applyView(await cancelSupplierSyncSession(projectId, sessionId));
        void requestExtension("CANCEL_SUPPLIER_SESSION", sessionId).catch(() => undefined);
      } catch (error) {
        emit({ ...state, warnings: [error instanceof Error ? error.message : "Session sa nepodarila zrušiť."] });
      } finally { emit({ ...state, busy: false }); }
    },
    destroy(): void {
      active = false; stopPolling(); window.removeEventListener("message", onWindowMessage);
      for (const waiter of pending.values()) { window.clearTimeout(waiter.timer); waiter.reject(new Error("Supplier Bridge controller was destroyed.")); }
      pending.clear();
    }
  };
}
