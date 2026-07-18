import type { SupplierCandidateSubmission, SupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import {
  attachSupplierBridgeSession,
  cancelSupplierBridgeSession,
  confirmSupplierCandidate,
  loadSupplierBridgeSession,
  SupplierBridgeApiError,
  skipSupplierSyncItem,
  submitSupplierCandidate
} from "./api";
import { mockSupplierAdapter } from "./adapters/mockSupplierAdapter";
import { backendBaseUrlForArcigyOrigin } from "./config";
import { configuredSupplierPortal } from "./config";
import { exactAdapterForSupplier } from "./suppliers/registry";
import { bridgeLog } from "./logger";
import {
  BRIDGE_CHANNEL,
  parseBridgeRuntimeRequest,
  parseBridgeRuntimeResponse,
  parseSupplierPageCapture,
  type BridgeRuntimeRequest,
  type BridgeRuntimeResponse
} from "./messages";
import {
  loadSupplierBridgeProgress,
  loadSupplierBridgeSecrets,
  appendSupplierBridgeTrace,
  saveSupplierBridgeProjectContext,
  saveSupplierBridgeProgress,
  saveSupplierBridgeSecrets,
  type SupplierBridgeProgress
} from "./storage";

const sidePanelOpenedFromArcigyClick = new Set<number>();

async function openSidePanel(tabId?: number): Promise<boolean> {
  try {
    if (typeof tabId === "number") {
      await chrome.sidePanel.open({ tabId });
      sidePanelOpenedFromArcigyClick.add(tabId);
    }
    else {
      const window = await chrome.windows.getLastFocused();
      if (typeof window.id !== "number") return false;
      await chrome.sidePanel.open({ windowId: window.id });
    }
    return true;
  } catch (error) {
    bridgeLog("warn", "side_panel_open_failed", { message: error instanceof Error ? error.message : "unknown" });
    return false;
  }
}

async function saveView(progress: SupplierBridgeProgress, view: SupplierSyncSessionView, warning?: string | null): Promise<SupplierBridgeProgress> {
  const latest = await loadSupplierBridgeProgress();
  const base = latest?.sessionId === progress.sessionId ? latest : progress;
  const next: SupplierBridgeProgress = { ...base, view, lastWarning: warning === undefined ? base.lastWarning : warning, updatedAt: new Date().toISOString() };
  await saveSupplierBridgeProgress(next);
  return next;
}

async function trace(progress: SupplierBridgeProgress, stage: string, outcome: "ok" | "warning" | "error", code: string | null = null): Promise<SupplierBridgeProgress> {
  const next = appendSupplierBridgeTrace(progress, { stage, outcome, code });
  await saveSupplierBridgeProgress(next);
  return next;
}

function safeBridgeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Supplier Bridge request failed.";
  return message.replace(/\b(?:authorization|bearer|(?:access|bridge)?[_-]?token|cookie|password|secret)\b\s*[:=]?\s*\S+/gi, "[redacted]").slice(0, 500);
}

function failureTraceCode(error: unknown): string {
  if (error instanceof SupplierBridgeApiError) {
    return error.requestId ? `HTTP_${error.status}:${error.requestId}` : `HTTP_${error.status}`;
  }
  return "BRIDGE_REQUEST_FAILED";
}

async function recordRouteFailure(message: BridgeRuntimeRequest, error: unknown): Promise<void> {
  const progress = await loadSupplierBridgeProgress();
  if (!progress) return;
  const stage = message.type === "SIDE_PANEL_COMMAND" && message.command === "assign_current"
    ? "Priradenie materiálu zlyhalo"
    : "Požiadavka Bridge zlyhala";
  await trace({ ...progress, lastWarning: safeBridgeFailureMessage(error) }, stage, "error", failureTraceCode(error));
}

async function activeSession(): Promise<{ progress: SupplierBridgeProgress; accessToken: string }> {
  const [progress, secrets] = await Promise.all([loadSupplierBridgeProgress(), loadSupplierBridgeSecrets()]);
  if (!progress || !secrets || secrets.sessionId !== progress.sessionId || !secrets.accessToken) {
    throw new Error("Supplier Bridge is not attached to an active session.");
  }
  if (secrets.accessTokenExpiresAt && Date.parse(secrets.accessTokenExpiresAt) <= Date.now()) {
    throw new Error("Supplier Bridge access expired. Start a new session in Arcigy.");
  }
  return { progress, accessToken: secrets.accessToken };
}

async function refresh(): Promise<SupplierSyncSessionView> {
  const { progress, accessToken } = await activeSession();
  const view = await loadSupplierBridgeSession(progress.backendBaseUrl, progress.sessionId, accessToken);
  await saveView(progress, view);
  return view;
}

async function startSession(message: Extract<BridgeRuntimeRequest, { type: "START_SUPPLIER_SESSION" }>, tabId?: number): Promise<BridgeRuntimeResponse> {
  const backendBaseUrl = backendBaseUrlForArcigyOrigin(message.arcigyOrigin);
  await saveSupplierBridgeSecrets({
    version: 1,
    sessionId: message.sessionId,
    bridgeToken: message.bridgeToken,
    accessToken: null,
    accessTokenExpiresAt: null
  });
  const attachment = await attachSupplierBridgeSession(backendBaseUrl, message.sessionId, message.bridgeToken);
  await saveSupplierBridgeProjectContext({
    version: 1,
    projectId: attachment.view.session.projectId,
    projectLabel: message.projectLabel,
    updatedAt: new Date().toISOString()
  });
  await saveSupplierBridgeSecrets({
    version: 1,
    sessionId: message.sessionId,
    bridgeToken: null,
    accessToken: attachment.accessToken,
    accessTokenExpiresAt: attachment.accessTokenExpiresAt
  });
  await saveSupplierBridgeProgress({
    version: 1,
    sessionId: message.sessionId,
    projectLabel: message.projectLabel,
    arcigyOrigin: message.arcigyOrigin,
    backendBaseUrl,
    supplierId: attachment.view.session.supplierId,
    activeSupplierTabId: null,
    supplierTabState: null,
    view: attachment.view,
    lastWarning: null,
    trace: [{ at: new Date().toISOString(), stage: "Projekt pripojený", outcome: "ok", code: null }],
    updatedAt: new Date().toISOString()
  });
  bridgeLog("info", "session_attached", { sessionId: message.sessionId });
  const supplier = await openSupplier();
  const progress = await loadSupplierBridgeProgress();
  const openedFromSupplierClick = typeof tabId === "number" && sidePanelOpenedFromArcigyClick.delete(tabId);
  const opened = openedFromSupplierClick || await openSidePanel(progress?.activeSupplierTabId ?? tabId);
  if (progress) await trace(progress, "Otvorenie panelu", opened ? "ok" : "error", opened ? (openedFromSupplierClick ? "OPENED_FROM_SUPPLIER_CLICK" : null) : "SIDE_PANEL_OPEN_FAILED");
  return {
    ok: supplier.ok,
    opened,
    view: supplier.view ?? attachment.view,
    errorCode: supplier.ok ? (opened ? null : "SIDE_PANEL_OPEN_FAILED") : supplier.errorCode ?? "SUPPLIER_OPEN_FAILED",
    ...(supplier.message ? { message: supplier.message } : {})
  };
}

async function setProjectContext(message: Extract<BridgeRuntimeRequest, { type: "SET_SUPPLIER_PROJECT_CONTEXT" }>): Promise<BridgeRuntimeResponse> {
  await saveSupplierBridgeProjectContext({
    version: 1,
    projectId: message.projectId,
    projectLabel: message.projectLabel,
    updatedAt: new Date().toISOString()
  });
  return { ok: true, opened: false };
}

async function openSupplier(): Promise<BridgeRuntimeResponse> {
  const { progress } = await activeSession();
  const item = progress.view.currentItem;
  let url: string;
  let supplierId: string;
  const selectedPortal = configuredSupplierPortal(progress.supplierId);
  if (selectedPortal) {
    supplierId = progress.supplierId;
    url = selectedPortal.startUrl;
  } else if (item?.exactLookup) {
    supplierId = item.exactLookup.supplierId;
    const portal = configuredSupplierPortal(supplierId);
    const adapter = exactAdapterForSupplier(supplierId);
    if (!portal || !adapter) return { ok: false, errorCode: "ADAPTER_NOT_VERIFIED", message: "This supplier adapter has not passed real Czech portal reconnaissance." };
    const plan = adapter.buildProductLookupPlan(item.exactLookup.supplierProductId);
    url = plan.type === "direct_url" ? plan.url : plan.type === "search_form" ? plan.searchPageUrl : portal.startUrl;
  } else {
    if (!item) return { ok: false, errorCode: "NO_PENDING_ITEM", message: "There is no pending material item." };
    if (!__SUPPLIER_BRIDGE_DEBUG__) return { ok: false, errorCode: "REAL_FIXTURES_REQUIRED", message: "A verified exact supplier lookup is required." };
    supplierId = "mock-supplier";
    const simulatorUrl = mockSupplierAdapter.buildSearchUrl?.(item.query);
    if (!simulatorUrl) return { ok: false, errorCode: "SEARCH_URL_UNAVAILABLE", message: "Supplier simulator URL is unavailable." };
    const supplierUrl = new URL(simulatorUrl);
    if (item.expectedManufacturer) supplierUrl.searchParams.set("manufacturer", item.expectedManufacturer);
    if (item.expectedDecorCode) supplierUrl.searchParams.set("decor", item.expectedDecorCode);
    if (item.expectedSurfaceCode) supplierUrl.searchParams.set("surface", item.expectedSurfaceCode);
    if (item.expectedProductType) supplierUrl.searchParams.set("productType", item.expectedProductType);
    if (item.expectedThicknessMm !== null) supplierUrl.searchParams.set("thickness", String(item.expectedThicknessMm));
    url = supplierUrl.toString();
  }
  const existingId = progress.supplierTabState?.supplierId === supplierId ? progress.supplierTabState.tabId : null;
  let tab = typeof existingId === "number" ? await chrome.tabs.get(existingId).catch(() => null) : null;
  if (!tab) {
    const portal = configuredSupplierPortal(supplierId);
    const matchingTabs = portal ? await chrome.tabs.query({ url: portal.origins.map((origin) => `${origin}/*`) }) : [];
    tab = matchingTabs.find((candidate) => typeof candidate.id === "number") ?? null;
  }
  if (tab?.id) await chrome.tabs.update(tab.id, { active: true });
  else tab = await chrome.tabs.create({ url, active: true });
  if (typeof tab.id !== "number") throw new Error("Supplier tab could not be created.");
  const next = {
    ...progress,
    activeSupplierTabId: tab.id,
    supplierTabState: {
      supplierId,
      tabId: tab.id,
      currentLookupRequestId: item?.exactLookup?.requestId ?? null,
      manuallyModified: false
    },
    updatedAt: new Date().toISOString()
  };
  await saveSupplierBridgeProgress(next);
  await trace(next, "Karta dodávateľa otvorená", "ok");
  return { ok: true, view: next.view };
}

async function waitForTabComplete(tabId: number, timeoutMs = 15_000): Promise<chrome.tabs.Tab> {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return current;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Supplier page did not finish loading in time."));
    }, timeoutMs);
    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }, tab: chrome.tabs.Tab) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function submissionId(sessionId: string, itemId: string, productCode: string, path: string): string {
  const raw = `${sessionId}:${itemId}:${productCode}:${path}`;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619);
  return `capture-${itemId}-${(hash >>> 0).toString(16)}`.slice(0, 180);
}

async function captureCurrentPage(syncItemId?: string): Promise<BridgeRuntimeResponse> {
  const { progress, accessToken } = await activeSession();
  const item = syncItemId ? progress.view.items.find((entry) => entry.id === syncItemId) : progress.view.currentItem;
  if (!item) return { ok: false, errorCode: "NO_PENDING_ITEM", message: "There is no pending material item." };
  const tabId = progress.activeSupplierTabId;
  if (typeof tabId !== "number") return { ok: false, errorCode: "SUPPLIER_TAB_REQUIRED", message: "Open the supplier page first." };
  const supplierTab = await waitForTabComplete(tabId);
  const supplierId = item.exactLookup?.supplierId ?? progress.supplierId;
  const portal = configuredSupplierPortal(supplierId);
  if (portal) {
    const supplierUrl = supplierTab.url ? new URL(supplierTab.url) : null;
    if (!portal || !supplierUrl || !(portal.origins as readonly string[]).includes(supplierUrl.origin)) {
      await saveSupplierBridgeProgress({
        ...progress,
        supplierTabState: progress.supplierTabState ? { ...progress.supplierTabState, manuallyModified: true } : null,
        lastWarning: "Supplier tab was manually moved outside the configured Czech supplier origin.",
        updatedAt: new Date().toISOString()
      });
      return { ok: false, errorCode: "SUPPLIER_TAB_ORIGIN_CHANGED", message: "Karta bola presunutá mimo povolenej českej domény dodávateľa." };
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: ["supplier-content.js"] });
  }
  const raw = await chrome.tabs.sendMessage(tabId, item.exactLookup ? {
      channel: BRIDGE_CHANNEL,
      type: "CAPTURE_EXACT_SUPPLIER_PRODUCT",
      requestedProductId: item.exactLookup.supplierProductId,
      expectedProductType: item.expectedProductType ?? "unknown",
      expectedManufacturer: item.expectedManufacturer,
      expectedThicknessMm: item.expectedThicknessMm
    } : portal ? {
      channel: BRIDGE_CHANNEL,
      type: "CAPTURE_CURRENT_SUPPLIER_PRODUCT",
      expectedProductType: item.expectedProductType ?? "unknown",
      expectedManufacturer: item.expectedManufacturer,
      expectedThicknessMm: item.expectedThicknessMm
    } : { channel: BRIDGE_CHANNEL, type: "CAPTURE_SUPPLIER_PAGE" });
  const response = parseBridgeRuntimeResponse(raw);
  const capture = response?.ok ? parseSupplierPageCapture(response.capture) : null;
  if (!capture) {
    return { ok: false, errorCode: response?.errorCode ?? "CAPTURE_INVALID", message: response?.message ?? "Supplier page capture failed." };
  }
  let view = progress.view;
  for (const candidate of capture.candidates) {
    const submission: SupplierCandidateSubmission = {
      submissionId: submissionId(progress.sessionId, item.id, candidate.supplierProductCode, candidate.sourcePath),
      syncItemId: item.id,
      supplierProductCode: candidate.supplierProductCode,
      normalizedProduct: candidate.normalizedProduct,
      sourcePageType: candidate.sourcePageType,
      sourcePath: candidate.sourcePath,
      observedAt: candidate.observedAt,
      price: candidate.price
    };
    view = (await submitSupplierCandidate(progress.backendBaseUrl, progress.sessionId, accessToken, submission)).view;
  }
  const warning = [...capture.warnings, ...(capture.errorCode ? [capture.errorCode] : [])].join(" ") || null;
  await saveView(progress, view, warning);
  await trace(await loadSupplierBridgeProgress() ?? progress, "Produkt načítaný", capture.candidates.length > 0 ? "ok" : "error", capture.errorCode);
  bridgeLog("info", "page_captured", { sessionId: progress.sessionId, candidateCount: capture.candidates.length });
  return { ok: capture.candidates.length > 0, view, capture, errorCode: capture.candidates.length > 0 ? null : capture.errorCode };
}

async function assignCurrentProduct(syncItemId?: string): Promise<BridgeRuntimeResponse> {
  if (!syncItemId) return { ok: false, errorCode: "TARGET_GROUP_REQUIRED", message: "Vyberte cieľovú materiálovú skupinu." };
  const captured = await captureCurrentPage(syncItemId);
  if (!captured.ok || !captured.view || !captured.capture) return captured;
  if (captured.capture.pageType !== "product" || captured.capture.candidates.length !== 1) {
    return { ok: false, errorCode: "PRODUCT_DETAIL_REQUIRED", message: "Otvorte detail jedného produktu a skúste ho pridať znova.", view: captured.view };
  }
  const productCode = captured.capture.candidates[0]!.supplierProductCode;
  const candidates = captured.view.candidates.filter((candidate) => candidate.syncItemId === syncItemId && candidate.supplierProductCode === productCode);
  const candidate = candidates.sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt))[0];
  if (!candidate) return { ok: false, errorCode: "CAPTURED_CANDIDATE_MISSING", message: "Zachytený produkt sa nepodarilo pripraviť na priradenie.", view: captured.view };
  return confirm(candidate.id, syncItemId);
}

async function confirm(candidateId?: string, syncItemId?: string): Promise<BridgeRuntimeResponse> {
  const { progress, accessToken } = await activeSession();
  const item = syncItemId ? progress.view.items.find((entry) => entry.id === syncItemId) : progress.view.currentItem;
  const candidate = candidateId ? progress.view.candidates.find((entry) => entry.id === candidateId) : null;
  if (!item || !candidate || candidate.syncItemId !== item.id) {
    return { ok: false, errorCode: "CANDIDATE_SELECTION_REQUIRED", message: "Select a captured candidate first." };
  }
  const view = await confirmSupplierCandidate(progress.backendBaseUrl, progress.sessionId, accessToken, item.id, candidate.id);
  await trace(await saveView(progress, view, null), "Materiál priradený", "ok");
  return { ok: true, view };
}

async function skip(syncItemId?: string): Promise<BridgeRuntimeResponse> {
  const { progress, accessToken } = await activeSession();
  const item = syncItemId ? progress.view.items.find((entry) => entry.id === syncItemId) : progress.view.currentItem;
  if (!item) return { ok: false, errorCode: "NO_PENDING_ITEM", message: "There is no pending material item." };
  const view = await skipSupplierSyncItem(progress.backendBaseUrl, progress.sessionId, accessToken, item.id, "USER_SKIPPED");
  await saveView(progress, view, null);
  return { ok: true, view };
}

async function cancel(): Promise<BridgeRuntimeResponse> {
  const { progress, accessToken } = await activeSession();
  const view = await cancelSupplierBridgeSession(progress.backendBaseUrl, progress.sessionId, accessToken);
  await saveView(progress, view, null);
  await saveSupplierBridgeSecrets({ version: 1, sessionId: progress.sessionId, bridgeToken: null, accessToken: null, accessTokenExpiresAt: null });
  return { ok: true, view };
}

async function diagnosticPick(message: Extract<BridgeRuntimeRequest, { type: "START_DIAGNOSTIC_PICK" }>): Promise<BridgeRuntimeResponse> {
  if (!__SUPPLIER_BRIDGE_DEBUG__) return { ok: false, errorCode: "DEBUG_BUILD_REQUIRED", message: "Diagnostic capture is available only in the debug build." };
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = tabs[0]?.id;
  if (typeof tabId !== "number") return { ok: false, errorCode: "ACTIVE_TAB_REQUIRED", message: "Open the supplier page first." };
  await chrome.scripting.executeScript({ target: { tabId }, files: ["diagnostic-recorder.js"] });
  const raw = await chrome.tabs.sendMessage(tabId, message);
  return parseBridgeRuntimeResponse(raw) ?? { ok: false, errorCode: "DIAGNOSTIC_INVALID_RESPONSE" };
}

async function diagnosticAnalyze(): Promise<BridgeRuntimeResponse> {
  if (!__SUPPLIER_BRIDGE_DEBUG__) return { ok: false, errorCode: "DEBUG_BUILD_REQUIRED", message: "Diagnostická analýza je dostupná iba v debug zostavení." };
  const { progress } = await activeSession();
  const tabId = progress.activeSupplierTabId;
  if (typeof tabId !== "number") return { ok: false, errorCode: "SUPPLIER_TAB_REQUIRED", message: "Najprv otvorte kartu dodávateľa." };
  const tab = await waitForTabComplete(tabId);
  const portal = configuredSupplierPortal(progress.supplierId);
  const url = tab.url ? new URL(tab.url) : null;
  if (!portal || !url || !(portal.origins as readonly string[]).includes(url.origin)) {
    return { ok: false, errorCode: "SUPPLIER_TAB_ORIGIN_CHANGED", message: "Diagnostika odmietla kartu mimo povolenej českej domény." };
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["supplier-content.js"] });
  const raw = await chrome.tabs.sendMessage(tabId, { channel: BRIDGE_CHANNEL, type: "ANALYZE_SUPPLIER_PAGE" });
  return parseBridgeRuntimeResponse(raw) ?? { ok: false, errorCode: "DIAGNOSTIC_INVALID_RESPONSE" };
}

async function handleSideCommand(message: Extract<BridgeRuntimeRequest, { type: "SIDE_PANEL_COMMAND" }>): Promise<BridgeRuntimeResponse> {
  if (message.command === "status") return { ok: true, view: await refresh() };
  if (message.command === "open_supplier") return openSupplier();
  if (message.command === "capture") return captureCurrentPage(message.syncItemId);
  if (message.command === "assign_current") return assignCurrentProduct(message.syncItemId);
  if (message.command === "analyze") return diagnosticAnalyze();
  if (message.command === "confirm") return confirm(message.candidateId, message.syncItemId);
  if (message.command === "skip") return skip(message.syncItemId);
  return cancel();
}

async function routeMessage(message: BridgeRuntimeRequest, sender: chrome.runtime.MessageSender): Promise<BridgeRuntimeResponse> {
  if (message.type === "START_SUPPLIER_SESSION") return startSession(message, sender.tab?.id);
  if (message.type === "SET_SUPPLIER_PROJECT_CONTEXT") return setProjectContext(message);
  if (message.type === "OPEN_SUPPLIER_BRIDGE") {
    const progress = await loadSupplierBridgeProgress();
    const opened = await openSidePanel(sender.tab?.id);
    if (!progress || progress.sessionId !== message.sessionId) return { ok: opened, opened, errorCode: opened ? null : "SIDE_PANEL_OPEN_FAILED" };
    await trace(progress, "Panel otvorený kliknutím v Arcigy", opened ? "ok" : "error", opened ? null : "SIDE_PANEL_OPEN_FAILED");
    return { ok: opened, opened, view: progress.view, errorCode: opened ? null : "SIDE_PANEL_OPEN_FAILED" };
  }
  if (message.type === "GET_SUPPLIER_SESSION_STATUS") return { ok: true, view: await refresh() };
  if (message.type === "CANCEL_SUPPLIER_SESSION") return cancel();
  if (message.type === "SIDE_PANEL_COMMAND") return handleSideCommand(message);
  if (message.type === "START_DIAGNOSTIC_PICK") return diagnosticPick(message);
  return { ok: false, errorCode: "UNSUPPORTED_MESSAGE" };
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
chrome.action.onClicked.addListener((tab) => { void openSidePanel(tab.id); });
chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (response: BridgeRuntimeResponse) => void) => {
  const message = parseBridgeRuntimeRequest(raw);
  if (!message || message.type === "CAPTURE_SUPPLIER_PAGE") return false;
  void routeMessage(message, sender)
    .then(sendResponse)
    .catch((error: unknown) => {
      const errorMessage = safeBridgeFailureMessage(error);
      bridgeLog("error", "request_failed", { type: message.type, message: errorMessage, code: failureTraceCode(error) });
      void recordRouteFailure(message, error).catch((traceError: unknown) => {
        bridgeLog("warn", "failure_trace_unavailable", { message: safeBridgeFailureMessage(traceError) });
      });
      sendResponse({ ok: false, errorCode: "BRIDGE_REQUEST_FAILED", message: errorMessage });
    });
  return true;
});
