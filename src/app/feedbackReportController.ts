import html2canvas from "html2canvas";

export type FeedbackKind = "bug" | "feature_request" | "improvement" | "question" | "other";

type FeedbackReportControllerContext = {
  trigger: HTMLButtonElement;
  /** Captures only the visible Arcigy browser viewport, never the OS screen. */
  captureViewport?: () => Promise<string | null>;
  buildProjectSnapshot: () => unknown;
  getDiagnostics: () => Record<string, unknown>;
  getDraftScope?: () => string;
  storage?: Storage;
  now?: () => number;
};

type FeedbackDraftV1 = {
  version: 1;
  open: true;
  kind: FeedbackKind;
  title: string;
  description: string;
  comment: string;
  updatedAt: number;
};

const FEEDBACK_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type RecentAction = { at: string; action: string };
type RecentDiagnosticEvent = RecentAction & { recordedAt: number };

const DIAGNOSTIC_TIMELINE_WINDOW_MS = 2 * 60 * 1000;
const MAX_DIAGNOSTIC_TIMELINE_EVENTS = 50;

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

export async function captureArcigyViewport(): Promise<string | null> {
  try {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;
    const image = await html2canvas(document.body, {
      allowTaint: false,
      backgroundColor: "#ffffff",
      height: viewportHeight,
      logging: false,
      scale: 1,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      useCORS: true,
      width: viewportWidth,
      windowHeight: viewportHeight,
      windowWidth: viewportWidth,
      onclone: (clonedDocument) => clonedDocument.querySelectorAll(".feedback-report-overlay").forEach((overlay) => overlay.remove())
    });
    return image.width > 0 && image.height > 0 ? image.toDataURL("image/png") : null;
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
  let storage: Storage | null = ctx.storage ?? null;
  if (!storage && typeof window !== "undefined") {
    try { storage = window.sessionStorage; } catch { storage = null; }
  }
  const now = ctx.now ?? (() => Date.now());
  const draftKey = () => `arcigy.feedback.draft.v1.${encodeURIComponent(ctx.getDraftScope?.() ?? "default")}`;
  const clearDraft = () => storage?.removeItem(draftKey());
  const readDraft = (): FeedbackDraftV1 | null => {
    if (!storage) return null;
    try {
      const parsed = JSON.parse(storage.getItem(draftKey()) ?? "null") as Partial<FeedbackDraftV1> | null;
      const updatedAt = Number(parsed?.updatedAt);
      if (!parsed || parsed.version !== 1 || parsed.open !== true || !Number.isFinite(updatedAt) || now() - updatedAt > FEEDBACK_DRAFT_TTL_MS) {
        if (parsed) clearDraft();
        return null;
      }
      if (!["bug", "feature_request", "improvement", "question", "other"].includes(String(parsed.kind))) {
        clearDraft();
        return null;
      }
      return {
        version: 1,
        open: true,
        kind: parsed.kind as FeedbackKind,
        title: typeof parsed.title === "string" ? parsed.title : "",
        description: typeof parsed.description === "string" ? parsed.description : "",
        comment: typeof parsed.comment === "string" ? parsed.comment : "",
        updatedAt
      };
    } catch {
      clearDraft();
      return null;
    }
  };
  const persistDraft = (form: HTMLFormElement) => {
    if (!storage) return;
    const data = new FormData(form);
    const draft: FeedbackDraftV1 = {
      version: 1,
      open: true,
      kind: (data.get("kind") as FeedbackKind) || "bug",
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      comment: String(data.get("comment") ?? ""),
      updatedAt: now()
    };
    try { storage.setItem(draftKey(), JSON.stringify(draft)); } catch { /* Storage quota/private mode: keep the form usable. */ }
  };
  const recentActions: RecentDiagnosticEvent[] = [];
  const recentRuntimeErrors: RecentDiagnosticEvent[] = [];
  const recordTime = () => Date.now();
  const prune = (events: RecentDiagnosticEvent[], now: number) => {
    const earliestAllowed = now - DIAGNOSTIC_TIMELINE_WINDOW_MS;
    while (events.length > 0 && (events[0]!.recordedAt < earliestAllowed || events.length > MAX_DIAGNOSTIC_TIMELINE_EVENTS)) {
      events.shift();
    }
  };
  const publicEvents = (events: RecentDiagnosticEvent[], now: number): RecentAction[] => {
    prune(events, now);
    return events.map(({ at, action }) => ({ at, action }));
  };
  const record = (action: string | null) => {
    if (!action) return;
    const now = recordTime();
    recentActions.push({ at: new Date(now).toISOString(), action, recordedAt: now });
    prune(recentActions, now);
  };
  const recordRuntimeError = (value: unknown) => {
    const message = String(value instanceof Error ? value.message : value)
      .replace(/https?:\/\/[^\s?]+(?:\?[^\s]*)?/gu, "[url]")
      .slice(0, 500);
    if (!message) return;
    const now = recordTime();
    recentRuntimeErrors.push({ at: new Date(now).toISOString(), action: message, recordedAt: now });
    prune(recentRuntimeErrors, now);
  };

  const open = async (draft = readDraft()) => {
    ctx.trigger.disabled = true;
    let screenshotDataUrl: string | null = null;
    try {
      screenshotDataUrl = await (ctx.captureViewport ?? captureArcigyViewport)();
    } catch {
      screenshotDataUrl = null;
    } finally {
      ctx.trigger.disabled = false;
    }
    const overlay = document.createElement("div");
    overlay.className = "feedback-report-overlay";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <section class="feedback-report-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-report-title">
        <header><h2 id="feedback-report-title">Nahlásiť problém</h2><button type="button" data-feedback-close aria-label="Zavrieť">×</button></header>
        <p>Spolu s popisom sa pripojí screenshot celej viditeľnej Arcigy aplikácie, aktuálny snapshot projektu a technická diagnostika vrátane posledných dvoch minút bezpečných akcií a chýb. Nezaznamenávajú sa texty z polí formulára ani obrazovka mimo Arcigy.</p>
        <form id="feedback-report-form" novalidate>
          <label>Typ<select name="kind">${FEEDBACK_KINDS.map((kind) => `<option value="${kind.value}">${kind.label}</option>`).join("")}</select></label>
          <label>Stručný názov problému<input name="title" maxlength="180" required></label>
          <label>Presný opis<textarea name="description" maxlength="8000" required></textarea></label>
          <label>Doplňujúci komentár<textarea name="comment" maxlength="4000"></textarea></label>
          ${screenshotDataUrl ? `<img class="feedback-report-preview" alt="Náhľad pripojeného screenshotu celej aplikácie" src="${screenshotDataUrl}">` : "<p>Screenshot celej viditeľnej Arcigy aplikácie nie je v tomto okamihu dostupný. Report sa neodošle bez neho.</p>"}
          <label class="feedback-report-consent"><input type="checkbox" name="consent" required> Rozumiem, že môj projekt, technické údaje a bezpečná dvojminútová diagnostická stopa budú pripojené k Odoo úlohe.</label>
        </form>
        <footer><span data-feedback-status aria-live="polite"></span><button type="button" data-feedback-close>Zrušiť</button><button type="submit" form="feedback-report-form">Odoslať do podpory</button></footer>
      </section>`;
    const dialog = overlay.querySelector<HTMLElement>(".feedback-report-dialog")!;
    const form = dialog.querySelector<HTMLFormElement>("#feedback-report-form")!;
    const close = () => { clearDraft(); overlay.remove(); };
    overlay.querySelectorAll<HTMLElement>("[data-feedback-close]").forEach((button) => button.addEventListener("click", close));
    const title = form.elements.namedItem("title") as HTMLInputElement;
    if (draft) {
      (form.elements.namedItem("kind") as HTMLSelectElement).value = draft.kind;
      title.value = draft.title;
      (form.elements.namedItem("description") as HTMLTextAreaElement).value = draft.description;
      (form.elements.namedItem("comment") as HTMLTextAreaElement).value = draft.comment;
    }
    form.addEventListener("input", () => persistDraft(form));
    form.addEventListener("change", () => persistDraft(form));
    persistDraft(form);
    const status = dialog.querySelector<HTMLElement>("[data-feedback-status]")!;
    const requestId = submissionId();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (!screenshotDataUrl) {
        status.textContent = "Screenshot celej viditeľnej Arcigy aplikácie nie je dostupný. Skúste report odoslať po načítaní projektu.";
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
          diagnostics: {
            ...ctx.getDiagnostics(),
            diagnosticTimeline: { windowSeconds: DIAGNOSTIC_TIMELINE_WINDOW_MS / 1000, storage: "in-memory" },
            recentActions: publicEvents(recentActions, recordTime()),
            recentRuntimeErrors: publicEvents(recentRuntimeErrors, recordTime())
          }
        };
        const response = await fetch("/api/feedback-reports", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
          body: JSON.stringify(body)
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Odoslanie zlyhalo.");
        clearDraft();
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
    ctx.trigger.addEventListener("click", () => { void open(); });
    document.addEventListener("click", (event) => record(safeActionFromEvent(event.target)), true);
    document.addEventListener("keydown", (event) => record(safeShortcut(event)), true);
    window.addEventListener("error", (event) => recordRuntimeError(event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => recordRuntimeError(event.reason));
  };
  const restorePendingDraft = async () => {
    const draft = readDraft();
    if (draft && !document.querySelector(".feedback-report-overlay")) await open(draft);
  };
  return { mount, restorePendingDraft };
}
