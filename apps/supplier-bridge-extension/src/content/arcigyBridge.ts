import { isAllowedArcigyOrigin } from "../config";
import {
  BRIDGE_CHANNEL,
  parseArcigyWindowRequest,
  parseBridgeRuntimeResponse,
  type ArcigyWindowResponse,
  type BridgeRuntimeRequest
} from "../messages";
import {
  isProjectMaterialsUpdatedNotice,
  PROJECT_MATERIALS_UPDATED_EVENT
} from "../projectMaterialsNotifier";

const origin = window.location.origin;
const seenRequests = new Set<string>();

function post(response: ArcigyWindowResponse): void {
  window.postMessage(response, origin);
}

if (isAllowedArcigyOrigin(origin)) {
  post({
    source: "ARCIGY_EXTENSION",
    type: "ARCIGY_BRIDGE_READY",
    requestId: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
    sessionId: null,
    ok: true,
    opened: false,
    errorCode: null
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isProjectMaterialsUpdatedNotice(message)) return;
    window.dispatchEvent(new CustomEvent(PROJECT_MATERIALS_UPDATED_EVENT, {
      detail: { projectId: message.projectId }
    }));
  });

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== origin || !isAllowedArcigyOrigin(event.origin)) return;
    const message = parseArcigyWindowRequest(event.data);
    if (!message) return;
    const replayKey = `${message.requestId}\u0000${message.nonce}`;
    if (seenRequests.has(replayKey)) {
      post({
        source: "ARCIGY_EXTENSION",
        type: "SUPPLIER_BRIDGE_RESULT",
        requestId: message.requestId,
        nonce: message.nonce,
        sessionId: message.sessionId,
        ok: false,
        opened: false,
        errorCode: "DUPLICATE_REQUEST"
      });
      return;
    }
    seenRequests.add(replayKey);
    if (seenRequests.size > 100) seenRequests.delete(seenRequests.values().next().value ?? replayKey);
    const runtimeMessage: BridgeRuntimeRequest = message.type === "START_SUPPLIER_SESSION"
      ? {
          channel: BRIDGE_CHANNEL,
          type: "START_SUPPLIER_SESSION",
          requestId: message.requestId,
          nonce: message.nonce,
          sessionId: message.sessionId,
          bridgeToken: message.bridgeToken!,
          arcigyOrigin: origin,
          projectLabel: message.projectLabel ?? ""
        }
      : message.type === "SET_SUPPLIER_PROJECT_CONTEXT"
        ? {
            channel: BRIDGE_CHANNEL,
            type: "SET_SUPPLIER_PROJECT_CONTEXT",
            requestId: message.requestId,
            nonce: message.nonce,
            sessionId: message.sessionId,
            arcigyOrigin: origin,
            projectId: message.projectId!,
            projectLabel: message.projectLabel ?? ""
          }
      : {
          channel: BRIDGE_CHANNEL,
          type: message.type,
          requestId: message.requestId,
          nonce: message.nonce,
          sessionId: message.sessionId,
          arcigyOrigin: origin
        };
    void chrome.runtime.sendMessage(runtimeMessage).then((raw: unknown) => {
      const result = parseBridgeRuntimeResponse(raw) ?? { ok: false, errorCode: "INVALID_EXTENSION_RESPONSE" };
      post({
        source: "ARCIGY_EXTENSION",
        type: "SUPPLIER_BRIDGE_RESULT",
        requestId: message.requestId,
        nonce: message.nonce,
        sessionId: message.sessionId,
        ok: result.ok === true,
        opened: result.opened === true,
        errorCode: typeof result.errorCode === "string" ? result.errorCode : result.ok ? null : "EXTENSION_REQUEST_FAILED"
      });
    }).catch(() => {
      post({
        source: "ARCIGY_EXTENSION",
        type: "SUPPLIER_BRIDGE_RESULT",
        requestId: message.requestId,
        nonce: message.nonce,
        sessionId: message.sessionId,
        ok: false,
        opened: false,
        errorCode: "EXTENSION_UNAVAILABLE"
      });
    });
  });

  // Chrome allows sidePanel.open only from a direct user gesture. Opening it here keeps
  // the gesture alive; the web controller attaches the project session immediately after.
  window.addEventListener("change", (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || target.dataset.supplierPicker !== "true" || !target.value) return;
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    void chrome.runtime.sendMessage({
      channel: BRIDGE_CHANNEL,
      type: "OPEN_SUPPLIER_BRIDGE",
      requestId,
      nonce,
      sessionId: "arcigy-connection-probe",
      arcigyOrigin: origin
    } satisfies BridgeRuntimeRequest).catch(() => undefined);
  }, true);
}
