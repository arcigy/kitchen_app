export const COMING_SOON_MESSAGE = "Táto funkcia bude čoskoro dostupná.";

let activeOverlay: HTMLElement | null = null;

export function showComingSoonDialog(feature: string): () => void {
  activeOverlay?.remove();

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = document.createElement("div");
  overlay.className = "project-dialog-overlay coming-soon-overlay";

  const dialog = document.createElement("section");
  dialog.className = "project-dialog coming-soon-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "coming-soon-dialog-title");

  const eyebrow = document.createElement("span");
  eyebrow.className = "coming-soon-dialog__eyebrow";
  eyebrow.textContent = "PRIPRAVUJEME";

  const title = document.createElement("h2");
  title.id = "coming-soon-dialog-title";
  title.textContent = feature.trim() || "Nová funkcia";

  const message = document.createElement("p");
  message.textContent = COMING_SOON_MESSAGE;

  const actions = document.createElement("div");
  actions.className = "project-dialog-actions";
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "coming-soon-dialog__close";
  closeButton.textContent = "Rozumiem";
  actions.appendChild(closeButton);
  dialog.append(eyebrow, title, message, actions);
  overlay.appendChild(dialog);

  const close = () => {
    if (activeOverlay !== overlay) return;
    activeOverlay = null;
    overlay.remove();
    previousFocus?.focus();
  };

  closeButton.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  activeOverlay = overlay;
  document.body.appendChild(overlay);
  closeButton.focus();
  return close;
}
