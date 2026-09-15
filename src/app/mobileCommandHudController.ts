import type { ActiveContextCommand } from "./editorContextMenuController";

export type MobileCommandHudState = {
  visible: boolean;
  commandId: string | null;
  label: string;
  canFinish: boolean;
  canGoBack: boolean;
  alternateLabel: string | null;
  snapEnabled: boolean | null;
  orthoEnabled: boolean | null;
};

export function createMobileCommandHudController(args: {
  root: HTMLElement;
  getActiveCommand: () => ActiveContextCommand | null;
  applyNumericValue?: (raw: string) => boolean;
}) {
  const label = args.root.querySelector<HTMLElement>("[data-mobile-hud-label]");
  const finish = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-finish]");
  const back = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-back]");
  const snap = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-snap]");
  const ortho = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-ortho]");
  const cancel = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-cancel]");
  const alternate = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-alternate]");
  const value = args.root.querySelector<HTMLInputElement>("[data-mobile-hud-value]");
  const apply = args.root.querySelector<HTMLButtonElement>("[data-mobile-hud-apply]");
  if (!label || !finish || !back || !snap || !ortho || !cancel || !alternate || !value || !apply) return null;
  let current: ActiveContextCommand | null = null;
  let lastSignature = "";

  const sync = () => {
    current = args.getActiveCommand();
    const signature = current
      ? `${current.id}:${!!current.finish}:${!!current.back}:${current.snap?.enabled ?? ""}:${current.ortho?.enabled ?? ""}:${current.alternate?.label ?? ""}`
      : "none";
    if (signature === lastSignature) return;
    lastSignature = signature;
    args.root.toggleAttribute("data-mobile-command-active", !!current);
    label.textContent = current?.label ?? "";
    finish.hidden = !current?.finish;
    back.hidden = !current?.back;
    snap.hidden = !current?.snap;
    snap.setAttribute("aria-pressed", String(current?.snap?.enabled ?? false));
    ortho.hidden = !current?.ortho;
    ortho.setAttribute("aria-pressed", String(current?.ortho?.enabled ?? false));
    alternate.hidden = !current?.alternate;
    alternate.textContent = current?.alternate?.label ?? "";
  };

  finish.addEventListener("click", () => { current?.finish?.(); sync(); });
  back.addEventListener("click", () => { current?.back?.(); sync(); });
  snap.addEventListener("click", () => { current?.snap?.toggle(); sync(); });
  ortho.addEventListener("click", () => { current?.ortho?.toggle(); sync(); });
  alternate.addEventListener("click", () => { current?.alternate?.execute(); sync(); });
  cancel.addEventListener("click", () => { current?.cancel(); sync(); });
  const applyValue = () => {
    if (!args.applyNumericValue?.(value.value)) return;
    value.value = "";
    sync();
  };
  apply.addEventListener("click", applyValue);
  value.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    applyValue();
  });
  const timer = window.setInterval(sync, 120);
  sync();

  return {
    getState: (): MobileCommandHudState => ({
      visible: !!current,
      commandId: current?.id ?? null,
      label: current?.label ?? "",
      canFinish: !!current?.finish,
      canGoBack: !!current?.back,
      alternateLabel: current?.alternate?.label ?? null,
      snapEnabled: current?.snap?.enabled ?? null,
      orthoEnabled: current?.ortho?.enabled ?? null
    }),
    sync,
    dispose: () => window.clearInterval(timer)
  };
}
