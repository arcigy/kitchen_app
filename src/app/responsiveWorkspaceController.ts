export type WorkspaceProfile = "desktop" | "tablet" | "phone";
export type InputProfile = "mouse" | "touch" | "pen" | "hybrid";

export type ResponsiveWorkspaceState = {
  input: InputProfile;
  orientation: "portrait" | "landscape";
  profile: WorkspaceProfile;
  standalone: boolean;
  viewportHeight: number;
  viewportWidth: number;
};

export function resolveWorkspaceProfile(args: {
  width: number;
  coarsePointer: boolean;
  hover: boolean;
}): WorkspaceProfile {
  if (args.width <= 600) return "phone";
  if (args.width <= 1024 || (args.coarsePointer && !args.hover)) return "tablet";
  return "desktop";
}

export function resolveInputProfile(args: {
  coarsePointer: boolean;
  finePointer: boolean;
  hover: boolean;
  lastPointerType?: string | null;
}): InputProfile {
  if (args.lastPointerType === "pen") return "pen";
  if (args.lastPointerType === "mouse") return args.coarsePointer ? "hybrid" : "mouse";
  if (args.lastPointerType === "touch") return args.finePointer ? "hybrid" : "touch";
  if (args.coarsePointer && args.finePointer) return "hybrid";
  if (args.coarsePointer) return "touch";
  if (args.finePointer || args.hover) return "mouse";
  return "touch";
}

export function resolveStandalonePresentation(args: { displayModeStandalone: boolean; iosStandalone?: boolean }): boolean {
  return args.displayModeStandalone || args.iosStandalone === true;
}

export function createResponsiveWorkspaceController(root: HTMLElement) {
  const listeners = new Set<(state: ResponsiveWorkspaceState) => void>();
  const coarse = window.matchMedia("(pointer: coarse)");
  const fine = window.matchMedia("(pointer: fine)");
  const hover = window.matchMedia("(hover: hover)");
  const standalone = window.matchMedia("(display-mode: standalone)");
  let lastPointerType: string | null = null;
  let lastState: ResponsiveWorkspaceState | null = null;

  const read = (): ResponsiveWorkspaceState => {
    const viewportWidth = Math.max(1, Math.round(window.visualViewport?.width ?? window.innerWidth));
    const viewportHeight = Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
    return {
      profile: resolveWorkspaceProfile({ width: viewportWidth, coarsePointer: coarse.matches, hover: hover.matches }),
      input: resolveInputProfile({
        coarsePointer: coarse.matches,
        finePointer: fine.matches,
        hover: hover.matches,
        lastPointerType
      }),
      orientation: viewportWidth >= viewportHeight ? "landscape" : "portrait",
      standalone: resolveStandalonePresentation({
        displayModeStandalone: standalone.matches,
        iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone
      }),
      viewportWidth,
      viewportHeight
    };
  };

  const sync = () => {
    const state = read();
    root.dataset.workspaceProfile = state.profile;
    root.dataset.inputProfile = state.input;
    root.dataset.orientation = state.orientation;
    root.dataset.standalone = String(state.standalone);
    root.style.setProperty("--arcigy-visual-viewport-height", `${state.viewportHeight}px`);
    const changed = !lastState || JSON.stringify(lastState) !== JSON.stringify(state);
    lastState = state;
    if (changed) listeners.forEach((listener) => listener(state));
  };

  const media = [coarse, fine, hover, standalone];
  media.forEach((query) => query.addEventListener("change", sync));
  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen" && event.pointerType !== "touch") return;
    if (lastPointerType === event.pointerType) return;
    lastPointerType = event.pointerType;
    sync();
  };
  root.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  sync();

  return {
    getState: () => lastState ?? read(),
    subscribe(listener: (state: ResponsiveWorkspaceState) => void) {
      listeners.add(listener);
      listener(lastState ?? read());
      return () => listeners.delete(listener);
    },
    dispose() {
      media.forEach((query) => query.removeEventListener("change", sync));
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      listeners.clear();
    }
  };
}
