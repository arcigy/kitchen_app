import { supplierBridgeBuild } from "../config";
import { captureDiagnosticField } from "../diagnosticSanitizer";
import { parseBridgeRuntimeRequest, type BridgeRuntimeResponse, type DiagnosticFieldCapture } from "../messages";

type RecorderWindow = Window & { __arcigyDiagnosticRecorderInstalled?: boolean };
const recorderWindow = window as RecorderWindow;

async function pickElement(field: Parameters<typeof captureDiagnosticField>[1], pageType: Parameters<typeof captureDiagnosticField>[2]): Promise<DiagnosticFieldCapture> {
  return new Promise((resolve, reject) => {
    let highlighted: HTMLElement | null = null;
    const previousOutline = new WeakMap<HTMLElement, string>();
    const cleanup = () => {
      if (highlighted) highlighted.style.outline = previousOutline.get(highlighted) ?? "";
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
    const onPointerOver = (event: PointerEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target || target === document.documentElement || target === document.body) return;
      if (highlighted) highlighted.style.outline = previousOutline.get(highlighted) ?? "";
      highlighted = target;
      previousOutline.set(target, target.style.outline);
      target.style.outline = "2px solid #6655ff";
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cleanup();
      resolve(captureDiagnosticField(target, field, pageType, supplierBridgeBuild.version));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cleanup();
      reject(new Error("Diagnostic selection cancelled."));
    };
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
  });
}

if (supplierBridgeBuild.debug && !recorderWindow.__arcigyDiagnosticRecorderInstalled) {
  recorderWindow.__arcigyDiagnosticRecorderInstalled = true;
  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse: (response: BridgeRuntimeResponse) => void) => {
    const message = parseBridgeRuntimeRequest(raw);
    if (!message || message.type !== "START_DIAGNOSTIC_PICK") return false;
    void pickElement(message.field, message.pageType)
      .then((diagnostic) => sendResponse({ ok: true, diagnostic }))
      .catch((error: unknown) => sendResponse({
        ok: false,
        errorCode: "DIAGNOSTIC_SELECTION_CANCELLED",
        message: error instanceof Error ? error.message : "Diagnostic selection cancelled."
      }));
    return true;
  });
}
