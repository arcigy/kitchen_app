import "./style.css";
import { startApp } from "./app";

const viewer = document.getElementById("viewer");
const form = document.getElementById("form");
const errors = document.getElementById("errors");
const parts = document.getElementById("parts");
const exportOut = document.getElementById("exportOut") as HTMLTextAreaElement | null;
const copyBtn = document.getElementById("copyBtn") as HTMLButtonElement | null;
const copyStatus = document.getElementById("copyStatus");
const measureBtn = document.getElementById("measureBtn") as HTMLButtonElement | null;
const clearMeasuresBtn = document.getElementById("clearMeasuresBtn") as HTMLButtonElement | null;
const axisLock = document.getElementById("axisLock") as HTMLInputElement | null;
const measureReadout = document.getElementById("measureReadout");
const exportSceneBtn = document.getElementById("exportSceneBtn") as HTMLButtonElement | null;
const resetViewBtn = document.getElementById("resetViewBtn") as HTMLButtonElement | null;

function showFatal(err: unknown) {
  // Surface startup errors in the UI so users don't need DevTools open.
  const el = document.getElementById("errors");
  if (!el) {
    // eslint-disable-next-line no-console
    console.error("Fatal startup error (no #errors element):", err);
    return;
  }

  const msg =
    err instanceof Error
      ? `${err.name}: ${err.message}${err.stack ? `\n\n${err.stack}` : ""}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err, null, 2);

  el.classList.add("visible");
  el.innerHTML = `<div style="font-weight:600; margin-bottom:6px;">App startup error</div><pre style="margin:0; white-space:pre-wrap;">${escapeHtml(
    msg
  )}</pre>`;

  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
}

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

window.addEventListener("error", (ev) => {
  // Some errors will already be caught by try/catch below, but this covers async crashes too.
  if (ev.error) showFatal(ev.error);
  else if (ev.message) showFatal(String(ev.message));
});

window.addEventListener("unhandledrejection", (ev) => {
  showFatal((ev as PromiseRejectionEvent).reason);
});

// Vite HMR: make sure we don't leak WebGL contexts across reloads.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      const w = window as any;
      w.__kitchen_webgl_cleanup?.dispose?.();
      w.__kitchen_webgl_cleanup = undefined;
    } catch {
      // ignore
    }
  });
}

if (
  !viewer ||
  !form ||
  !errors ||
  !parts ||
  !exportOut ||
  !copyBtn ||
  !copyStatus ||
  !measureBtn ||
  !clearMeasuresBtn ||
  !axisLock ||
  !measureReadout ||
  !exportSceneBtn ||
  !resetViewBtn
) {
  throw new Error("Missing required DOM elements (viewer/form/errors/parts/exportOut/measure...).");
}

try {
  startApp({
    viewerEl: viewer,
    formEl: form,
    errorsEl: errors,
    partsEl: parts,
    exportOutEl: exportOut,
    copyBtn,
    copyStatusEl: copyStatus,
    measureBtn,
    clearMeasuresBtn,
    axisLockEl: axisLock,
    measureReadoutEl: measureReadout,
    resetBtn: document.getElementById("resetBtn") as HTMLButtonElement,
    resetViewBtn,
    exportBtn: document.getElementById("exportBtn") as HTMLButtonElement,
    exportSceneBtn
  });
} catch (e) {
  showFatal(e);
}
