import type { ReleaseNewsResponse, ReleaseNotice } from "../core/release-news/releaseNewsTypes";
import { getCurrentLanguage } from "../i18n";

type UiScaleSettings = { createControl(): HTMLElement };
type Copy = { archive: string; close: string; understood: string; tryIt: string; changes: string; unread: string; read: string; settings: string; failed: string };
const COPY: Record<"en" | "cs" | "sk", Copy> = {
  en: { archive: "What's new?", close: "Close", understood: "Got it", tryIt: "Try it", changes: "What's changed", unread: "Unread", read: "Read", settings: "Display settings", failed: "Your acknowledgement could not be saved. This notice will be shown again." },
  cs: { archive: "Co je nového?", close: "Zavřít", understood: "Rozumím", tryIt: "Vyzkoušejte", changes: "Co se změnilo", unread: "Nepřečteno", read: "Přečteno", settings: "Nastavení zobrazení", failed: "Potvrzení se nepodařilo uložit. Toto oznámení se zobrazí znovu." },
  sk: { archive: "Čo je nové?", close: "Zavrieť", understood: "Rozumiem", tryIt: "Vyskúšajte", changes: "Čo sa zmenilo", unread: "Neprečítané", read: "Prečítané", settings: "Nastavenia zobrazenia", failed: "Potvrdenie sa nepodarilo uložiť. Toto oznámenie sa zobrazí znova." }
};

const NEWS_EVENT = "arcigy:open-release-news";
const SETTINGS_EVENT = "arcigy:open-account-settings";

export function openReleaseNewsFromAccount(): void {
  document.dispatchEvent(new Event(NEWS_EVENT));
}

export function openAccountSettingsFromAccount(): void {
  document.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function createReleaseNewsController(args: {
  root?: HTMLElement;
  uiScale: UiScaleSettings;
  fetcher?: typeof fetch;
}) {
  const root = args.root ?? document.body;
  const fetcher = args.fetcher ?? fetch;
  let response: ReleaseNewsResponse | null = null;
  let overlay: HTMLElement | null = null;
  const copy = () => COPY[getCurrentLanguage()];

  const load = async (): Promise<ReleaseNewsResponse> => {
    if (response) return response;
    const result = await fetcher("/api/release-news", { credentials: "same-origin" });
    if (!result.ok) throw new Error(`Release news could not be loaded (${result.status}).`);
    response = await result.json() as ReleaseNewsResponse;
    return response;
  };

  const close = (acknowledge: boolean, notice?: ReleaseNotice) => {
    if (!overlay) return;
    const target = notice;
    if (acknowledge && target) {
      const closeAfterSave = async () => {
        try {
          const result = await fetcher(`/api/release-news/${encodeURIComponent(target.id)}/acknowledgement`, {
            method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}"
          });
          if (!result.ok) throw new Error("Acknowledgement failed.");
          if (response && !response.acknowledgedNoticeIds.includes(target.id)) response.acknowledgedNoticeIds.push(target.id);
        } catch {
          const message = overlay?.querySelector<HTMLElement>("[data-news-error]");
          if (message) { message.textContent = copy().failed; message.hidden = false; }
          return;
        }
        overlay?.remove();
        overlay = null;
      };
      void closeAfterSave();
      return;
    }
    overlay.remove();
    overlay = null;
  };

  const render = (selected: ReleaseNotice, archive: ReleaseNotice[]) => {
    overlay?.remove();
    const text = copy();
    const current = response;
    const scrim = document.createElement("div");
    scrim.className = "release-news-scrim";
    const dialog = document.createElement("section");
    dialog.className = "release-news-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "release-news-title");

    const aside = document.createElement("nav");
    aside.className = "release-news-archive";
    aside.setAttribute("aria-label", text.archive);
    for (const notice of archive) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "release-news-date";
      item.setAttribute("aria-current", String(notice.id === selected.id));
      const date = document.createElement("time");
      date.dateTime = notice.date;
      date.textContent = notice.date;
      const title = document.createElement("span");
      title.textContent = notice.title[getCurrentLanguage()];
      const status = document.createElement("small");
      status.textContent = current?.acknowledgedNoticeIds.includes(notice.id) ? text.read : text.unread;
      item.append(date, title, status);
      item.addEventListener("click", () => render(notice, archive));
      aside.append(item);
    }

    const article = document.createElement("article");
    article.className = "release-news-content";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "release-news-close";
    closeButton.setAttribute("aria-label", text.close);
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => close(true, selected));
    const time = document.createElement("time");
    time.dateTime = selected.date;
    time.textContent = selected.date;
    const title = document.createElement("h2");
    title.id = "release-news-title";
    title.textContent = selected.title[getCurrentLanguage()];
    const summary = document.createElement("p");
    summary.className = "release-news-summary";
    summary.textContent = selected.summary[getCurrentLanguage()];
    const changesTitle = document.createElement("h3");
    changesTitle.textContent = text.changes;
    const changes = document.createElement("ul");
    for (const change of selected.changes) {
      const item = document.createElement("li");
      item.textContent = change[getCurrentLanguage()];
      changes.append(item);
    }
    const tryTitle = document.createElement("h3");
    tryTitle.textContent = text.tryIt;
    const steps = document.createElement("ol");
    for (const step of selected.tryIt) {
      const item = document.createElement("li");
      item.textContent = step[getCurrentLanguage()];
      steps.append(item);
    }
    const error = document.createElement("p");
    error.dataset.newsError = "";
    error.className = "release-news-error";
    error.setAttribute("role", "status");
    error.hidden = true;
    const acknowledge = document.createElement("button");
    acknowledge.type = "button";
    acknowledge.className = "release-news-acknowledge";
    acknowledge.textContent = text.understood;
    acknowledge.addEventListener("click", () => close(true, selected));
    article.append(closeButton, time, title, summary, changesTitle, changes, tryTitle, steps, error, acknowledge);
    dialog.append(aside, article);
    scrim.append(dialog);
    scrim.addEventListener("click", (event) => { if (event.target === scrim) close(false); });
    scrim.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [...scrim.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    root.append(scrim);
    overlay = scrim;
    closeButton.focus();
  };

  const openArchive = async (unreadOnly = false) => {
    try {
      const data = await load();
      const ordered = [...data.notices].sort((a, b) => b.date.localeCompare(a.date));
      const notice = unreadOnly
        ? ordered.find((item) => !data.acknowledgedNoticeIds.includes(item.id))
        : ordered[0];
      if (notice) render(notice, ordered);
    } catch {
      // News delivery is non-blocking; a transient API error must not block workspace use.
    }
  };

  const openSettings = () => {
    const scrim = document.createElement("div");
    scrim.className = "release-news-scrim";
    const dialog = document.createElement("section");
    dialog.className = "release-news-settings";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", copy().settings);
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "release-news-close";
    closeButton.setAttribute("aria-label", copy().close);
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => { scrim.remove(); overlay = null; });
    const heading = document.createElement("h2");
    heading.textContent = copy().settings;
    dialog.append(closeButton, heading, args.uiScale.createControl());
    scrim.append(dialog);
    scrim.addEventListener("click", (event) => { if (event.target === scrim) { scrim.remove(); overlay = null; } });
    document.addEventListener("keydown", function escape(event) {
      if (event.key === "Escape" && overlay === scrim) { scrim.remove(); overlay = null; document.removeEventListener("keydown", escape); }
    });
    root.append(scrim);
    overlay = scrim;
    closeButton.focus();
  };

  const openNewsListener = () => { void openArchive(false); };
  const openSettingsListener = () => openSettings();
  document.addEventListener(NEWS_EVENT, openNewsListener);
  document.addEventListener(SETTINGS_EVENT, openSettingsListener);
  void openArchive(true);

  return {
    openArchive: () => openArchive(false),
    openUnread: () => openArchive(true),
    dispose() {
      document.removeEventListener(NEWS_EVENT, openNewsListener);
      document.removeEventListener(SETTINGS_EVENT, openSettingsListener);
      overlay?.remove();
      overlay = null;
    }
  };
}
