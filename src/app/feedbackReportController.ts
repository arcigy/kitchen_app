export type FeedbackKind = "bug" | "feature_request" | "improvement" | "question" | "other";

type FeedbackReportControllerContext = {
  trigger: HTMLButtonElement;
  canvas: HTMLCanvasElement;
  buildProjectSnapshot: () => unknown;
  getDiagnostics: () => Record<string, unknown>;
};

type RecentAction = { at: string; action: string };

const FEEDBACK_KINDS: ReadonlyArray<{ value: FeedbackKind; label: string }> = [
  { value: "bug", label: "Chyba" },
  { value: "feature_request", label: "Nová funkcia" },
  { value: "improvement", label: "Zlepšenie" },
  { value: "question", label: "Otázka / podpora" },
  { value: "other", label: "Iné" }
];

function submissionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `feedback_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function currentCanvasImage(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL("image/png") : null;
  } catch {
    return null;
  }
}

function safeActionFromEvent(target: EventTarget | null): string | null {
  if (!(target instanceof Element) || target.closest("input, textarea, select, [contenteditable='true']")) return null;
  const button = target.closest<HTMLButtonElement>("button");
  const label = button?.getAttribute("data-quick-action") ?? button?.getAttribute("aria-label");
  return label && /^[\w -]{1,80}$/u.test(label) ? `button:${label}` : null;
}

function safeShortcut(event: KeyboardEvent): string | null {
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return null;
  if (["Escape", "Delete", "Backspace"].includes(event.key)) return `key:${event.key}`;
  if ((event.ctrlKey || event.metaKey) && ["z", "y", "c", "v"].includes(event.key.toLowerCase())) return `key:${event.ctrlKey ? "Ctrl" : "Meta"}+${event.key.toUpperCase()}`;
  return null;
}

export function createFeedbackReportController(ctx: FeedbackReportControllerContext) {
  const recentActions: RecentAction[] = [];
  const recentRuntimeErrors: RecentAction[] = [];
  const record = (action: string | null) => {
    if (!action) return;
    recentActions.push({ at: new Date().toISOString(), action });
    if (recentActions.length > 10) recentActions.shift();
  };
  const recordRuntimeError = (value: unknown) => {
    const message = String(value instanceof Error ? value.message : value)
      .replace(/https?:\/\/[^\s?]+(?:\?[^\s]*)?/gu, "[url]")
      .slice(0, 500);
    if (!message) return;
    recentRuntimeErrors.push({ at: new Date().toISOString(), action: message });
    if (recentRuntimeErrors.length > 10) recentRuntimeErrors.shift();
  };

  const open = () => {
    const screenshotDataUrl = currentCanvasImage(ctx.canvas);
    const overlay = document.createElement("div");
    overlay.className = "feedback-report-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <section class="feedback-report-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-report-title">
        <header><h2 id="feedback-report-title">Nahlásiť problém</h2><button type="button" data-feedback-close aria-label="Zavrieť">×</button></header>
        <p>Spolu s popisom sa pripojí screenshot editora, aktuálny snapshot projektu a technická diagnostika.</p>
        <form id="feedback-report-form" novalidate>
          <label>Typ<select name="kind">${FEEDBACK_KINDS.map((kind) => `<option value="${kind.value}">${kind.label}</option>`).join("")}</select></label>
          <label>Stručný názov problému<input name="title" maxlength="180" required></label>
          <label>Presný opis<textarea name="description" maxlength="8000" required></textarea></label>
          <label>Doplňujúci komentár<textarea name="comment" maxlength="4000"></textarea></label>
          ${screenshotDataUrl ? `<img class="feedback-report-preview" alt="Náhľad pripojeného screenshotu" src="${screenshotDataUrl}">` : "<p>Screenshot editora nie je v tomto okamihu dostupný. Report sa neodošle bez neho.</p>"}
          <label class="feedback-report-consent"><input type="checkbox" name="consent" required> Rozumiem, že môj projekt a technické údaje budú pripojené k Odoo úlohe.</label>
        </form>
        <footer><span data-feedback-status aria-live="polite"></span><button type="button" data-feedback-close>Zrušiť</button><button type="submit" form="feedback-report-form">Odoslať do podpory</button></footer>
      </section>`;
    const dialog = overlay.querySelector<HTMLElement>(".feedback-report-dialog")!;
    const form = dialog.querySelector<HTMLFormElement>("#feedback-report-form")!;
    const close = () => overlay.remove();
    overlay.querySelectorAll<HTMLElement>("[data-feedback-close]").forEach((button) => button.addEventListener("click", close));
    const title = form.elements.namedItem("title") as HTMLInputElement;
    const status = dialog.querySelector<HTMLElement>("[data-feedback-status]")!;
    const requestId = submissionId();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (!screenshotDataUrl) {
        status.textContent = "Screenshot editora nie je dostupný. Skúste report odoslať po načítaní projektu.";
        return;
      }
      const data = new FormData(form);
      const submitButton = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submitButton.disabled = true;
      status.textContent = "Odosielam…";
      try {
        const body = {
          submissionId: requestId,
          kind: data.get("kind"),
          title: data.get("title"),
          description: data.get("description"),
          comment: data.get("comment"),
          consent: data.get("consent") === "on",
          screenshotDataUrl,
          projectSnapshot: ctx.buildProjectSnapshot(),
          diagnostics: { ...ctx.getDiagnostics(), recentActions: [...recentActions], recentRuntimeErrors: [...recentRuntimeErrors] }
        };
        const response = await fetch("/api/feedback-reports", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
          body: JSON.stringify(body)
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Odoslanie zlyhalo.");
        status.textContent = "Ďakujeme. Požiadavka bola odoslaná do podpory.";
        window.setTimeout(close, 1200);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Odoslanie zlyhalo.";
        submitButton.disabled = false;
      }
    });
    document.body.appendChild(overlay);
    title.focus();
  };

  const mount = () => {
    ctx.trigger.textContent = "Nahlásiť problém";
    ctx.trigger.title = "Nahlásiť problém";
    ctx.trigger.setAttribute("aria-label", "Nahlásiť problém");
    ctx.trigger.addEventListener("click", open);
    document.addEventListener("click", (event) => record(safeActionFromEvent(event.target)), true);
    document.addEventListener("keydown", (event) => record(safeShortcut(event)), true);
    window.addEventListener("error", (event) => recordRuntimeError(event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => recordRuntimeError(event.reason));
  };
  return { mount };
}
