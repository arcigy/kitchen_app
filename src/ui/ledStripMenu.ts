import type { LedStripMode } from "../layout/ledStripTypes";

export type LedStripMenuOptions = {
  trigger: HTMLButtonElement;
  onChoose: (mode: LedStripMode) => void;
};

export const LED_STRIP_MENU_ITEMS: ReadonlyArray<{ mode: LedStripMode; label: string; description: string }> = [
  { mode: "underUpper", label: "Pod hornými", description: "Vložiť pásik pod vybrané horné moduly." },
  { mode: "plinthJoint", label: "Pri sokli", description: "Vložiť pásik do spoja sokla a spodnej dosky." },
  { mode: "shelfJoint", label: "V policiach", description: "Vložiť jeden pásik pod každú policu vybraného modulu." },
  { mode: "custom", label: "Vlastný", description: "Kresliť vlastnú súvislú stredovú čiaru." }
];

/** Accessible anchored menu used by the Kitchen LED command. */
export function installLedStripMenu(options: LedStripMenuOptions): () => void {
  const root = document.createElement("div");
  root.className = "led-strip-menu";
  root.setAttribute("role", "menu");
  root.hidden = true;
  for (const item of LED_STRIP_MENU_ITEMS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "led-strip-menu-item";
    button.setAttribute("role", "menuitem");
    button.dataset.ledStripMode = item.mode;
    const title = document.createElement("strong");
    title.textContent = item.label;
    const detail = document.createElement("small");
    detail.textContent = item.description;
    button.append(title, detail);
    button.addEventListener("click", () => {
      close();
      options.onChoose(item.mode);
    });
    root.appendChild(button);
  }
  document.body.appendChild(root);

  const position = () => {
    const rect = options.trigger.getBoundingClientRect();
    root.style.left = `${Math.max(8, rect.left)}px`;
    root.style.top = `${rect.bottom + 6}px`;
  };
  const close = () => {
    root.hidden = true;
    options.trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    position();
    root.hidden = false;
    options.trigger.setAttribute("aria-expanded", "true");
    root.querySelector<HTMLButtonElement>("button")?.focus();
  };
  const onTriggerClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (root.hidden) open(); else close();
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && (root.contains(event.target) || options.trigger.contains(event.target))) return;
    close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      close();
      options.trigger.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
    const current = document.activeElement instanceof HTMLButtonElement ? buttons.indexOf(document.activeElement) : -1;
    const next = event.key === "ArrowDown" ? (current + 1 + buttons.length) % buttons.length : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
    event.preventDefault();
  };
  options.trigger.setAttribute("aria-haspopup", "menu");
  options.trigger.setAttribute("aria-expanded", "false");
  options.trigger.addEventListener("click", onTriggerClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", position);
  return () => {
    options.trigger.removeEventListener("click", onTriggerClick);
    document.removeEventListener("pointerdown", onDocumentPointerDown);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", position);
    root.remove();
  };
}
