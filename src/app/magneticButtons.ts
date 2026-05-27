import { clamp } from "./sharedUtils";

const MAGNETIC_BUTTON_SELECTOR = [
  ".archux-app button:not(:disabled):not(.archux-view-cube-face):not(.archux-view-cube-roll):not(.archux-view-cube-jump):not(.archux-view-cube-hit)",
  ".revit-chrome button:not(:disabled)",
  ".viewer-downbar button:not(:disabled)",
  ".archux-side-nav button:not(:disabled)",
  "#properties button:not(:disabled)"
].join(",");

type MagneticButtonTarget = {
  button: HTMLButtonElement;
  rect: DOMRect;
  distance: number;
};

type CachedButton = {
  button: HTMLButtonElement;
  rect: DOMRect;
};

export function setupMagneticButtons() {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const radius = 30;
  const maxPull = 8;
  let pointerX = 0;
  let pointerY = 0;
  let activeButton: HTMLButtonElement | null = null;
  let raf = 0;
  let cachedButtons: CachedButton[] = [];
  let cachedButtonsAt = 0;

  const resetButton = (button: HTMLButtonElement | null) => {
    if (!button) return;
    button.classList.remove("button-magnet-active");
    button.style.removeProperty("--button-magnet-x");
    button.style.removeProperty("--button-magnet-y");
    button.style.removeProperty("--button-magnet-scale");
  };

  const releaseActiveButton = () => {
    resetButton(activeButton);
    activeButton = null;
    document.body.classList.remove("button-magnet-capturing");
  };

  const isInsideNonMagneticSurface = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest(".archux-activity-history-popover, .bom-modal, .project-dialog-overlay");

  const getCachedButtons = () => {
    const now = performance.now();
    if (now - cachedButtonsAt < 180) return cachedButtons;
    cachedButtonsAt = now;
    cachedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(MAGNETIC_BUTTON_SELECTOR))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const style = window.getComputedStyle(button);
        if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return null;
        return { button, rect };
      })
      .filter((item): item is CachedButton => item !== null);
    return cachedButtons;
  };

  const findMagnetButton = (): MagneticButtonTarget | null => {
    let best: MagneticButtonTarget | null = null;
    for (const { button, rect } of getCachedButtons()) {
      const dx = pointerX < rect.left ? rect.left - pointerX : pointerX > rect.right ? pointerX - rect.right : 0;
      const dy = pointerY < rect.top ? rect.top - pointerY : pointerY > rect.bottom ? pointerY - rect.bottom : 0;
      const edgeDistance = Math.hypot(dx, dy);
      if (edgeDistance > radius) continue;

      const centerDistance = Math.hypot(pointerX - (rect.left + rect.width / 2), pointerY - (rect.top + rect.height / 2));
      const distance = edgeDistance + centerDistance * 0.01;
      if (!best || distance < best.distance) best = { button, rect, distance };
    }
    return best;
  };

  const applyMagnet = () => {
    raf = 0;
    const target = findMagnetButton();
    if (!target) {
      releaseActiveButton();
      return;
    }

    if (target.button !== activeButton) {
      resetButton(activeButton);
      activeButton = target.button;
    }

    const centerX = target.rect.left + target.rect.width / 2;
    const centerY = target.rect.top + target.rect.height / 2;
    const influence = Math.max(0, 1 - target.distance / radius);
    const pullX = clamp((pointerX - centerX) * 0.22 * influence, -maxPull, maxPull);
    const pullY = clamp((pointerY - centerY) * 0.22 * influence, -maxPull, maxPull);

    target.button.classList.add("button-magnet-active");
    target.button.style.setProperty("--button-magnet-x", `${pullX.toFixed(2)}px`);
    target.button.style.setProperty("--button-magnet-y", `${pullY.toFixed(2)}px`);
    target.button.style.setProperty("--button-magnet-scale", `${(1 + influence * 0.04).toFixed(3)}`);
    document.body.classList.add("button-magnet-capturing");
  };

  const scheduleMagnet = () => {
    if (!raf) raf = window.requestAnimationFrame(applyMagnet);
  };

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    if (isInsideNonMagneticSurface(event.target)) {
      releaseActiveButton();
      return;
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    scheduleMagnet();
  }, { passive: true });

  document.addEventListener("pointerleave", releaseActiveButton);

  document.addEventListener("pointerdown", (event) => {
    if (isInsideNonMagneticSurface(event.target)) {
      releaseActiveButton();
      return;
    }
    const eventButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    if (eventButton && eventButton !== activeButton) {
      releaseActiveButton();
      return;
    }
    if (event.pointerType !== "mouse" || event.button !== 0 || !activeButton) return;
    if (activeButton.contains(event.target as Node)) return;
    event.preventDefault();
    event.stopPropagation();
    activeButton.focus();
    activeButton.click();
  }, true);
}
