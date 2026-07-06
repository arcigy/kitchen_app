import * as THREE from "three";
import { resolveAlignLockPointWorld } from "./alignLocks";
import { worldToScreen } from "./sharedUtils";
import type { AlignLock, AlignLockEndpoint, LayoutInstance } from "./localTypes";

export type AlignLockOverlayTarget = {
  targetKind: AlignLockEndpoint["targetKind"];
  targetId: string;
};

type AlignLockOverlayContext = {
  viewerEl: HTMLElement;
  camera: () => THREE.Camera;
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  getLocks: () => AlignLock[];
  getSelectedTargets: () => AlignLockOverlayTarget[];
  findInstance: (id: string) => LayoutInstance | null;
  instanceWorldBox: (inst: LayoutInstance) => THREE.Box3;
  onToggle: (lock: AlignLock) => void;
};

export function toggleAlignLockOverlayState(args: {
  getLocks: () => AlignLock[];
  lockId: string;
  onToggle: (lock: AlignLock) => void;
}) {
  const lock = args.getLocks().find((item) => item.id === args.lockId) ?? null;
  if (!lock) return false;
  lock.locked = !lock.locked;
  args.onToggle(lock);
  return true;
}

export function alignLockIsVisibleForTargets(lock: AlignLock, targets: AlignLockOverlayTarget[]) {
  return targets.some(
    (target) =>
      (lock.a.targetKind === target.targetKind && lock.a.targetId === target.targetId) ||
      (lock.b.targetKind === target.targetKind && lock.b.targetId === target.targetId)
  );
}

const icon = (locked: boolean) => `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="${locked ? "M7 10V7a5 5 0 0 1 10 0v3" : "M8 10V7a5 5 0 0 1 8.5-3.5"}"></path>
    <rect x="5.5" y="10" width="13" height="10" rx="2"></rect>
    <path d="M12 14v2.5"></path>
  </svg>
`;

export function createAlignLockOverlay(ctx: AlignLockOverlayContext) {
  const root = document.createElement("div");
  root.className = "align-lock-overlay";
  ctx.viewerEl.appendChild(root);
  const buttons = new Map<string, HTMLButtonElement>();
  const stopLockPointerEvent = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const sync = () => {
    const visibleIds = new Set<string>();
    const visibleInPlan = ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() === "floorplan";
    if (!visibleInPlan) {
      root.style.display = "none";
      return;
    }
    root.style.display = "";
    const rect = ctx.viewerEl.getBoundingClientRect();
    const selectedTargets = ctx.getSelectedTargets();
    for (const lock of ctx.getLocks()) {
      if (!alignLockIsVisibleForTargets(lock, selectedTargets)) continue;
      visibleIds.add(lock.id);
      let button = buttons.get(lock.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "align-lock-button";
        const lockId = lock.id;
        button.addEventListener("pointerdown", (ev) => {
          stopLockPointerEvent(ev);
          if (!toggleAlignLockOverlayState({ getLocks: ctx.getLocks, lockId, onToggle: ctx.onToggle })) return;
          sync();
        });
        button.addEventListener("pointerup", stopLockPointerEvent);
        button.addEventListener("mousedown", stopLockPointerEvent);
        button.addEventListener("mouseup", stopLockPointerEvent);
        button.addEventListener("dblclick", stopLockPointerEvent);
        button.addEventListener("click", stopLockPointerEvent);
        buttons.set(lock.id, button);
        root.appendChild(button);
      }
      button.classList.toggle("is-locked", lock.locked);
      button.classList.toggle("is-unlocked", !lock.locked);
      button.title = lock.locked ? "Unlock aligned joint" : "Lock aligned joint";
      button.innerHTML = icon(lock.locked);
      const world = resolveAlignLockPointWorld(lock, {
        findInstance: ctx.findInstance,
        instanceWorldBox: ctx.instanceWorldBox
      });
      const screen = worldToScreen(world, ctx.camera(), rect);
      button.style.transform = `translate(${Math.round(screen.x - 9)}px, ${Math.round(screen.y - 9)}px)`;
    }

    for (const [id, button] of buttons) {
      if (visibleIds.has(id)) continue;
      button.remove();
      buttons.delete(id);
    }
  };

  const dispose = () => {
    root.remove();
    buttons.clear();
  };

  return { sync, dispose };
}
