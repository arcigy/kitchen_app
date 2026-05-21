import * as THREE from "three";
import type {
  ColumnInstance,
  DoorInstance,
  FloorInstance,
  LayoutInstance,
  WallInstance,
  WindowInstance
} from "./localTypes";
import type { PlanSnapBinding } from "./planSnap";
import type { KitchenContext } from "../layout/kitchenContext";
import type { MeasureState } from "./measureTools";

type PointerInputHandlersContext = Record<string, any> & {
  renderer: THREE.WebGLRenderer;
  walls: WallInstance[];
  windows: WindowInstance[];
  doors: DoorInstance[];
  columns: ColumnInstance[];
  instances: LayoutInstance[];
  floors: FloorInstance[];
  getSelectableMeshes: (root: THREE.Object3D) => THREE.Mesh[];
  S: {
    activeKitchenGroupId: string | null;
    kitchenCtx: KitchenContext;
    kitchenGroups: Array<{ id: string; ctx: KitchenContext }>;
    kitchenEditMode: boolean;
  };
};

type WindowDimensionParam = "widthMm" | "heightMm" | "sillHeightMm";
type DoorDimensionParam = "widthMm" | "heightMm";
type DoorSwingControlAction = "toggleHandedness" | "toggleSwingSide";
type WindowSwingControlAction = "toggleHandedness" | "toggleSwingSide";

export function installPointerInputHandlers(ctx: PointerInputHandlersContext) {
  const isPickableObject = (object: THREE.Object3D | null | undefined) =>
    !ctx.isObjectPickable || ctx.isObjectPickable(object);
  const isPickableKey = (key: string | null | undefined) =>
    !ctx.isVisibilityTargetPickable || ctx.isVisibilityTargetPickable(key);
  const hasLoadedUnderlay = () => !ctx.hasUnderlaySource || ctx.hasUnderlaySource();
  const pickableObjects = <T extends THREE.Object3D>(objects: T[]) => objects.filter((object) => isPickableObject(object));
  const armMoveTargetFromBase = (basePoint?: THREE.Vector3) => {
    if (!basePoint || ctx.transformState.kind !== "move" || ctx.transformState.step !== "pickBase") return;
    ctx.transformState.base = basePoint.clone();
    ctx.transformState.step = "pickTarget";
    ctx.transformState.typed = "";
    ctx.transformState.lastValidDelta.set(0, 0, 0);
    ctx.setUnderlayStatus("Move: click target point, or move mouse and type distance. Shift = constrain.");
  };
  const continueMoveAfterSelection = (basePoint?: THREE.Vector3) => {
    if (ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements") {
      if (!ctx.startTransformFromSelection("move", { sticky: true })) return true;
      armMoveTargetFromBase(basePoint);
      return true;
    }
    return false;
  };
  const hasMoveSelection = () =>
    (ctx.selectedWallIds?.size ?? 0) > 0 ||
    (ctx.selectedInstanceIds?.size ?? 0) > 0 ||
    (ctx.selectedKind === "wall" && !!ctx.selectedWallId) ||
    (ctx.selectedKind === "module" && !!ctx.selectedInstanceId) ||
    (ctx.selectedKind === "section" && !!ctx.selectedSectionId) ||
    (ctx.selectedKind === "window" && !!ctx.windowInst) ||
    (ctx.selectedKind === "door" && !!ctx.doorInst);
  const continueMoveWithCurrentSelection = (basePoint?: THREE.Vector3) => {
    if (ctx.transformState.kind !== "move" || ctx.transformState.step !== "selectElements" || !ctx.transformState.stickyMove) return false;
    if (!hasMoveSelection()) return false;
    if (!ctx.startTransformFromSelection("move", { sticky: true })) return false;
    armMoveTargetFromBase(basePoint);
    return true;
  };
  const constrainMoveDelta = (delta: THREE.Vector3) => {
    if (delta.lengthSq() < 1e-10) return delta.clone();
    const firstWallId = ctx.transformState.selectedWallIds[0] as string | undefined;
    const firstWall = firstWallId ? ctx.transformState.startWalls.get(firstWallId) : null;
    if (firstWall) {
      const wallDir = new THREE.Vector3(firstWall.bMm.x - firstWall.aMm.x, 0, firstWall.bMm.z - firstWall.aMm.z);
      if (wallDir.lengthSq() > 1e-10) {
        wallDir.normalize();
        const wallPerp = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
        const along = delta.dot(wallDir);
        const across = delta.dot(wallPerp);
        return Math.abs(along) >= Math.abs(across) ? wallDir.multiplyScalar(along) : wallPerp.multiplyScalar(across);
      }
    }
    return Math.abs(delta.x) >= Math.abs(delta.z) ? new THREE.Vector3(delta.x, 0, 0) : new THREE.Vector3(0, 0, delta.z);
  };
  const windowPlacementWallSnapPx = 34;
  const windowSelectionSnapPx = 20;
  const pickFloorplanWallId = (pMm: { x: number; z: number }, mouse: { x: number; y: number }, rect: DOMRect) => {
    let bestPoly: { id: string; px: number } | null = null;
    const pW = { x: pMm.x / 1000, z: pMm.z / 1000 };
    for (const [id, poly] of ctx.wallSolvedOutlines) {
      if (!isPickableKey(`wall:${id}`)) continue;
      if (poly.length < 3) continue;
      if (!ctx.pointInPolygonXZ(pW, poly)) continue;
      const w = ctx.walls.find((x) => x.id === id) ?? null;
      const mid = w
        ? new THREE.Vector3((w.params.aMm.x + w.params.bMm.x) / 2000, 0, (w.params.aMm.z + w.params.bMm.z) / 2000)
        : new THREE.Vector3(pW.x, 0, pW.z);
      const s = ctx.worldToScreen(mid, ctx.cam(), rect);
      const px = Math.hypot(s.x - mouse.x, s.y - mouse.y);
      if (!bestPoly || px < bestPoly.px) bestPoly = { id, px };
    }
    if (bestPoly) return bestPoly.id;

    let best: { id: string; px: number } | null = null;
    for (const w of ctx.walls) {
      if (!isPickableKey(`wall:${w.id}`)) continue;
      const closest = ctx.pointOnWallAxisMm(w, pMm);
      if (!Number.isFinite(closest.distMm)) continue;
      const cp = new THREE.Vector3(closest.closest.x / 1000, 0, closest.closest.z / 1000);
      const s = ctx.worldToScreen(cp, ctx.cam(), rect);
      const px = Math.hypot(s.x - mouse.x, s.y - mouse.y);
      if (!best || px < best.px) best = { id: w.id, px };
    }
    return best && best.px <= windowPlacementWallSnapPx ? best.id : null;
  };
  const pickFloorplanWindow = (pMm: { x: number; z: number }, mouse: { x: number; y: number }, rect: DOMRect) => {
    let best: { inst: WindowInstance; px: number } | null = null;
    for (const inst of ctx.windows) {
      const wallId = inst.params.wallId ?? null;
      if (!wallId || !isPickableKey(`window:${inst.id}`)) continue;
      const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
      if (!wall) continue;
      const closest = ctx.pointOnWallAxisMm(wall, pMm);
      if (!Number.isFinite(closest.distMm)) continue;
      const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
      const alongMm = closest.t * lengthMm;
      const alongPadMm = Math.max(130, inst.params.widthMm * 0.08);
      const lateralPadMm = Math.max(180, wall.params.thicknessMm * 1.4);
      const aMm = Math.max(0, inst.params.centerMm - inst.params.widthMm / 2);
      const bMm = Math.min(lengthMm, inst.params.centerMm + inst.params.widthMm / 2);
      const ax = wall.params.aMm.x;
      const az = wall.params.aMm.z;
      const bx = wall.params.bMm.x;
      const bz = wall.params.bMm.z;
      const dirX = (bx - ax) / Math.max(1, lengthMm);
      const dirZ = (bz - az) / Math.max(1, lengthMm);
      const screenA = ctx.worldToScreen(new THREE.Vector3((ax + dirX * aMm) / 1000, 0, (az + dirZ * aMm) / 1000), ctx.cam(), rect);
      const screenB = ctx.worldToScreen(new THREE.Vector3((ax + dirX * bMm) / 1000, 0, (az + dirZ * bMm) / 1000), ctx.cam(), rect);
      const px = ctx.distPxPointToSeg(mouse.x, mouse.y, screenA.x, screenA.y, screenB.x, screenB.y);
      const hit =
        px <= windowSelectionSnapPx ||
        (alongMm >= inst.params.centerMm - inst.params.widthMm / 2 - alongPadMm &&
          alongMm <= inst.params.centerMm + inst.params.widthMm / 2 + alongPadMm &&
          closest.distMm <= lateralPadMm);
      if (hit && (!best || px < best.px)) best = { inst, px };
    }
    return best?.inst ?? null;
  };

  const pickFloorplanDoor = (pMm: { x: number; z: number }, mouse: { x: number; y: number }, rect: DOMRect) => {
    let best: { inst: DoorInstance; px: number } | null = null;
    for (const inst of ctx.doors) {
      const wallId = inst.params.wallId ?? null;
      if (!wallId || !isPickableKey(`door:${inst.id}`)) continue;
      const wall = ctx.walls.find((item) => item.id === wallId) ?? null;
      if (!wall) continue;
      const closest = ctx.pointOnWallAxisMm(wall, pMm);
      if (!Number.isFinite(closest.distMm)) continue;
      const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
      const alongMm = closest.t * lengthMm;
      const alongPadMm = Math.max(130, inst.params.widthMm * 0.08);
      const lateralPadMm = Math.max(180, wall.params.thicknessMm * 1.4);
      const aMm = Math.max(0, inst.params.centerMm - inst.params.widthMm / 2);
      const bMm = Math.min(lengthMm, inst.params.centerMm + inst.params.widthMm / 2);
      const ax = wall.params.aMm.x;
      const az = wall.params.aMm.z;
      const bx = wall.params.bMm.x;
      const bz = wall.params.bMm.z;
      const dirX = (bx - ax) / Math.max(1, lengthMm);
      const dirZ = (bz - az) / Math.max(1, lengthMm);
      const screenA = ctx.worldToScreen(new THREE.Vector3((ax + dirX * aMm) / 1000, 0, (az + dirZ * aMm) / 1000), ctx.cam(), rect);
      const screenB = ctx.worldToScreen(new THREE.Vector3((ax + dirX * bMm) / 1000, 0, (az + dirZ * bMm) / 1000), ctx.cam(), rect);
      const px = ctx.distPxPointToSeg(mouse.x, mouse.y, screenA.x, screenA.y, screenB.x, screenB.y);
      const hit =
        px <= windowSelectionSnapPx ||
        (alongMm >= inst.params.centerMm - inst.params.widthMm / 2 - alongPadMm &&
          alongMm <= inst.params.centerMm + inst.params.widthMm / 2 + alongPadMm &&
          closest.distMm <= lateralPadMm);
      if (hit && (!best || px < best.px)) best = { inst, px };
    }
    return best?.inst ?? null;
  };

  const resolveColumnPlacementPoint = (raw: THREE.Vector3, rect: DOMRect) => {
    const snapped = ctx.snapPoint2D(raw, rect, ctx.cam(), 24, {
      sticky: ctx.selectPlanSnap
    });
    const activeSnap =
      snapped.kind !== "none" ? snapped : ctx.keepStickyPlanSnap(raw, ctx.selectPlanSnap, ctx.cam(), rect, 28);
    ctx.selectPlanSnap = activeSnap;
    if (activeSnap) {
      ctx.updateHoverCursor(ctx.worldToScreen(activeSnap.point, ctx.cam(), rect), activeSnap.kind);
      ctx.drawSnapOverlay.showWorld(activeSnap.point, ctx.cam(), rect, activeSnap.kind);
      return activeSnap.point;
    }
    ctx.hideHoverCursor();
    ctx.drawSnapOverlay.hide();
    return raw;
  };

  const getWindowIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.windowId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const findWindowFromObject = (obj: THREE.Object3D | null | undefined) => {
    const id = getWindowIdFromObject(obj);
    return id ? ctx.windows.find((item) => item.id === id) ?? null : null;
  };

  const getDoorIdFromObject = (obj: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = obj;
    while (current) {
      const id = current.userData?.doorId as string | undefined;
      if (id) return id;
      current = current.parent;
    }
    return null;
  };

  const findDoorFromObject = (obj: THREE.Object3D | null | undefined) => {
    const id = getDoorIdFromObject(obj);
    return id ? ctx.doors.find((item) => item.id === id) ?? null : null;
  };

  let windowDimensionInput: HTMLInputElement | null = null;
  let activeWindowDimensionParam: WindowDimensionParam | null = null;
  let doorDimensionInput: HTMLInputElement | null = null;
  let activeDoorDimensionParam: DoorDimensionParam | null = null;

  const ensureWindowDimensionInput = () => {
    if (windowDimensionInput) return windowDimensionInput;
    const input = document.createElement("input");
    input.id = "window-dimension-edit";
    input.name = "window-dimension-edit";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = "mm";
    input.setAttribute("aria-label", "Window dimension in millimeters");
    input.style.position = "absolute";
    input.style.display = "none";
    input.style.pointerEvents = "auto";
    input.style.zIndex = "18";
    input.style.width = "76px";
    input.style.height = "22px";
    input.style.borderRadius = "7px";
    input.style.border = "1px solid rgba(36, 40, 54, 0.95)";
    input.style.background = "#0f1117";
    input.style.color = "#ffffff";
    input.style.caretColor = "#ffffff";
    input.style.padding = "0 6px";
    input.style.fontSize = "12px";
    input.style.outline = "none";
    input.style.transform = "translate(-50%, -50%)";

    const hide = () => {
      input.style.display = "none";
      activeWindowDimensionParam = null;
    };
    const parseMm = (raw: string) => {
      const value = Number(String(raw).trim().replace(",", ".").replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(value) ? Math.round(value) : null;
    };
    const commit = () => {
      const inst = ctx.windowInst;
      const param = activeWindowDimensionParam;
      if (!inst || !param) return;
      const parsed = parseMm(input.value);
      if (parsed == null) return;
      inst.params[param] = param === "sillHeightMm" ? Math.max(0, parsed) : Math.max(1, parsed);
      ctx.updateWindowTransform(inst);
      ctx.setSelectedWindow();
      ctx.mountProps();
      ctx.commitHistory(ctx.S);
    };

    input.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        commit();
        input.blur();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        hide();
        input.blur();
        ev.preventDefault();
      }
    });
    input.addEventListener("blur", hide);

    const host = ctx.args?.viewerEl ?? ctx.renderer.domElement.parentElement ?? document.body;
    host.appendChild(input);
    windowDimensionInput = input;
    return input;
  };

  const ensureDoorDimensionInput = () => {
    if (doorDimensionInput) return doorDimensionInput;
    const input = document.createElement("input");
    input.id = "door-dimension-edit";
    input.name = "door-dimension-edit";
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = "mm";
    input.setAttribute("aria-label", "Door dimension in millimeters");
    input.style.position = "absolute";
    input.style.display = "none";
    input.style.pointerEvents = "auto";
    input.style.zIndex = "18";
    input.style.width = "76px";
    input.style.height = "22px";
    input.style.borderRadius = "7px";
    input.style.border = "1px solid rgba(36, 40, 54, 0.95)";
    input.style.background = "#0f1117";
    input.style.color = "#ffffff";
    input.style.caretColor = "#ffffff";
    input.style.padding = "0 6px";
    input.style.fontSize = "12px";
    input.style.outline = "none";
    input.style.transform = "translate(-50%, -50%)";

    const hide = () => {
      input.style.display = "none";
      activeDoorDimensionParam = null;
    };
    const parseMm = (raw: string) => {
      const value = Number(String(raw).trim().replace(",", ".").replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(value) ? Math.round(value) : null;
    };
    const commit = () => {
      const inst = ctx.doorInst;
      const param = activeDoorDimensionParam;
      if (!inst || !param) return;
      const parsed = parseMm(input.value);
      if (parsed == null) return;
      inst.params[param] = Math.max(1, parsed);
      ctx.updateDoorTransform(inst);
      ctx.setSelectedDoor();
      ctx.mountProps();
      ctx.commitHistory(ctx.S);
    };

    input.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        commit();
        input.blur();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        hide();
        input.blur();
        ev.preventDefault();
      }
    });
    input.addEventListener("blur", hide);

    const host = ctx.args?.viewerEl ?? ctx.renderer.domElement.parentElement ?? document.body;
    host.appendChild(input);
    doorDimensionInput = input;
    return input;
  };

  const cancelPendingMarquee = (pointerId: number) => {
    if (ctx.marquee.pending && ctx.marquee.pointerId === pointerId) {
      ctx.marquee.hitSomething = true;
      ctx.marquee.pending = false;
      ctx.marquee.active = false;
      ctx.marqueeEl.style.display = "none";
    }
  };

  const isVisibleThroughSelection = (object: THREE.Object3D) => {
    const selection = ctx.windowInst?.selection ?? null;
    let current: THREE.Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      if (current === selection) return true;
      current = current.parent;
    }
    return false;
  };

  const pickWindowDimensionParam = (): WindowDimensionParam | null => {
    const inst = ctx.windowInst;
    if (!inst || ctx.selectedKind !== "window" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    for (const hit of hits) {
      const param = hit.object.userData.windowDimensionParam as WindowDimensionParam | undefined;
      if (param && hit.object.userData.kind === "windowDimensionEdit" && isVisibleThroughSelection(hit.object)) return param;
    }
    return null;
  };

  const isVisibleThroughDoorSelection = (object: THREE.Object3D) => {
    const selection = ctx.doorInst?.selection ?? null;
    let current: THREE.Object3D | null = object;
    while (current) {
      if (!current.visible) return false;
      if (current === selection) return true;
      current = current.parent;
    }
    return false;
  };

  const pickDoorDimensionParam = (): DoorDimensionParam | null => {
    const inst = ctx.doorInst;
    if (!inst || ctx.selectedKind !== "door" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    for (const hit of hits) {
      const param = hit.object.userData.doorDimensionParam as DoorDimensionParam | undefined;
      if (param && hit.object.userData.kind === "doorDimensionEdit" && isVisibleThroughDoorSelection(hit.object)) return param;
    }
    return null;
  };

  const pickWindowSwingControlAction = (): WindowSwingControlAction | null => {
    const inst = ctx.windowInst;
    if (!inst || ctx.selectedKind !== "window" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    for (const hit of hits) {
      const action = hit.object.userData.windowSwingAction as WindowSwingControlAction | undefined;
      if (action && hit.object.userData.kind === "windowSwingControl" && isVisibleThroughSelection(hit.object)) return action;
    }
    return null;
  };

  const applyWindowSwingControlAction = (action: WindowSwingControlAction) => {
    const inst = ctx.windowInst;
    if (!inst) return false;
    if (action === "toggleHandedness") {
      inst.params.swingDirection = inst.params.swingDirection === "right" ? "left" : "right";
    } else {
      inst.params.swingSide = inst.params.swingSide === "outward" ? "inward" : "outward";
    }
    ctx.updateWindowTransform(inst);
    ctx.setSelectedWindow();
    ctx.mountProps();
    ctx.commitHistory(ctx.S);
    return true;
  };

  const pickDoorSwingControlAction = (): DoorSwingControlAction | null => {
    const inst = ctx.doorInst;
    if (!inst || ctx.selectedKind !== "door" || !inst.selection.visible) return null;
    const hits = ctx.raycaster.intersectObject(inst.selection, true);
    for (const hit of hits) {
      const action = hit.object.userData.doorSwingAction as DoorSwingControlAction | undefined;
      if (action && hit.object.userData.kind === "doorSwingControl" && isVisibleThroughDoorSelection(hit.object)) return action;
    }
    return null;
  };

  const applyDoorSwingControlAction = (action: DoorSwingControlAction) => {
    const inst = ctx.doorInst;
    if (!inst) return false;
    if (action === "toggleHandedness") {
      inst.params.swingDirection = inst.params.swingDirection === "right" ? "left" : "right";
    } else {
      inst.params.swingSide = inst.params.swingSide === "outward" ? "inward" : "outward";
    }
    ctx.updateDoorTransform(inst);
    ctx.setSelectedDoor();
    ctx.mountProps();
    ctx.commitHistory(ctx.S);
    return true;
  };

  const beginWindowDimensionEdit = (param: WindowDimensionParam, ev: PointerEvent) => {
    const inst = ctx.windowInst;
    if (!inst) return false;
    const input = ensureWindowDimensionInput();
    const hostRect = (ctx.args?.viewerEl ?? ctx.renderer.domElement).getBoundingClientRect();
    activeWindowDimensionParam = param;
    input.value = String(Math.round(inst.params[param]));
    input.style.left = `${ev.clientX - hostRect.left}px`;
    input.style.top = `${ev.clientY - hostRect.top}px`;
    input.style.display = "block";
    input.focus();
    input.select();
    return true;
  };

  const beginDoorDimensionEdit = (param: DoorDimensionParam, ev: PointerEvent) => {
    const inst = ctx.doorInst;
    if (!inst) return false;
    const input = ensureDoorDimensionInput();
    const hostRect = (ctx.args?.viewerEl ?? ctx.renderer.domElement).getBoundingClientRect();
    activeDoorDimensionParam = param;
    input.value = String(Math.round(inst.params[param]));
    input.style.left = `${ev.clientX - hostRect.left}px`;
    input.style.top = `${ev.clientY - hostRect.top}px`;
    input.style.display = "block";
    input.focus();
    input.select();
    return true;
  };

  ctx.renderer.domElement.addEventListener("pointerdown", (ev) => {
    if (ctx.viewNavigation.handlePointerDown(ev)) {
      return;
    }

    // Marquee selection in layout select tool: left in floorplan, right in any layout view.
    const startsMarquee =
      ctx.mode === "layout" &&
      ctx.layoutTool === "select" &&
      !ctx.isWindowPlacementActive?.() &&
      !ctx.isDoorPlacementActive?.() &&
      !ctx.isColumnPlacementActive?.() &&
      !ctx.floorEdit.active &&
      !ctx.transformState.kind &&
      !ctx.placement.active &&
      !ctx.measureState.enabled &&
      ((ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ev.button === 0) || ev.button === 2);
    if (
      startsMarquee
    ) {
      if (ev.button === 2) ev.preventDefault();
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      ctx.marquee.pending = true;
      ctx.marquee.active = false;
      ctx.marquee.pointerId = ev.pointerId;
      ctx.marquee.hitSomething = false;
      ctx.marquee.startX = ev.clientX - rect.left;
      ctx.marquee.startY = ev.clientY - rect.top;
      ctx.marquee.mode = "contain";
      ctx.marqueeEl.style.display = "none";
      try {
        ctx.renderer.domElement.setPointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      // do not return; we still want click selection / dragging to work
    }

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    ctx.pointerNdc.set(x, y);

    ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());

    if (ctx.mode === "layout") {
      if (ev.button === 0) {
        const windowSwingAction = pickWindowSwingControlAction();
        if (windowSwingAction && applyWindowSwingControlAction(windowSwingAction)) {
          cancelPendingMarquee(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        const doorSwingAction = pickDoorSwingControlAction();
        if (doorSwingAction && applyDoorSwingControlAction(doorSwingAction)) {
          cancelPendingMarquee(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        const windowDimensionParam = pickWindowDimensionParam();
        if (windowDimensionParam && beginWindowDimensionEdit(windowDimensionParam, ev)) {
          cancelPendingMarquee(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        const doorDimensionParam = pickDoorDimensionParam();
        if (doorDimensionParam && beginDoorDimensionEdit(doorDimensionParam, ev)) {
          cancelPendingMarquee(ev.pointerId);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
      }

      if (ctx.floorEdit.active) {
        if (ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const point = ctx.worldToFloorPoint(hitPoint);
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const pickedEdit = ctx.pickFloorEditElement(mouse, rect);

        if (pickedEdit) {
          ctx.floorEdit.first = null;
          ctx.floorEdit.hover = null;
          ctx.floorEdit.error = "";
          if (pickedEdit.kind === "vertex") {
            const startPoint = { ...ctx.floorEdit.segments[pickedEdit.ref.segmentIndex][pickedEdit.ref.endpoint] };
            ctx.floorEdit.selectedVertex = pickedEdit.ref;
            ctx.floorEdit.selectedSegmentIndex = null;
            ctx.floorEdit.drag = { pointerId: ev.pointerId, kind: "vertex", startPoint, startSegments: ctx.cloneFloorSegments(ctx.floorEdit.segments) };
          } else {
            ctx.floorEdit.selectedSegmentIndex = pickedEdit.segmentIndex;
            ctx.floorEdit.selectedVertex = null;
            ctx.floorEdit.drag = {
              pointerId: ev.pointerId,
              kind: "segment",
              segmentIndex: pickedEdit.segmentIndex,
              startWorld: point,
              startSegments: ctx.cloneFloorSegments(ctx.floorEdit.segments)
            };
          }
          ctx.renderFloorBoundaryEdit();
          ctx.renderer.domElement.setPointerCapture(ev.pointerId);
          ctx.mountProps();
          return;
        }

        ctx.floorEdit.selectedSegmentIndex = null;
        ctx.floorEdit.selectedVertex = null;

        if (ctx.floorEdit.tool === "pickLines") {
          const picked = ctx.pickWallLine2D(hitPoint, rect, ctx.cam(), 14);
          const alignPicked = ctx.pickAlignLineAt(hitPoint, mouse, rect);
          const a = picked?.a ?? alignPicked?.segA ?? null;
          const b = picked?.b ?? alignPicked?.segB ?? null;
          if (!a || !b) {
            ctx.setUnderlayStatus("Floor boundary: edge was not found.");
            return;
          }
          ctx.addFloorEditSegment(ctx.worldToFloorPoint(a), ctx.worldToFloorPoint(b));
          ctx.setUnderlayStatus("Floor boundary: edge added.");
          return;
        }

        if (!ctx.floorEdit.first) {
          ctx.floorEdit.first = point;
          ctx.floorEdit.hover = point;
          ctx.renderFloorBoundaryEdit();
          return;
        }

        if (ctx.floorEdit.tool === "rectangle") {
          const a = ctx.floorEdit.first;
          const b = ctx.floorEdit.ortho ? ctx.floorOrthoPoint(a, point) : point;
          const p1 = { x: a.x, z: a.z };
          const p2 = { x: b.x, z: a.z };
          const p3 = { x: b.x, z: b.z };
          const p4 = { x: a.x, z: b.z };
          ctx.floorEdit.segments.push({ a: p1, b: p2 }, { a: p2, b: p3 }, { a: p3, b: p4 }, { a: p4, b: p1 });
          ctx.floorEdit.first = null;
          ctx.floorEdit.hover = null;
          ctx.renderFloorBoundaryEdit();
          return;
        }

        if (ctx.floorEdit.tool === "circle") {
          const points = ctx.makeFloorCirclePoints(ctx.floorEdit.first, point);
          for (let i = 0; i < points.length; i++) ctx.floorEdit.segments.push({ a: points[i], b: points[(i + 1) % points.length] });
          ctx.floorEdit.first = null;
          ctx.floorEdit.hover = null;
          ctx.renderFloorBoundaryEdit();
          return;
        }

        const start = ctx.floorEdit.first;
        const rawEnd = ctx.floorEdit.ortho ? ctx.floorOrthoPoint(start, point) : point;
        const end = ctx.floorEdit.segments.length >= 2 && ctx.floorEdit.segments[0] && ctx.floorPointEq(rawEnd, ctx.floorEdit.segments[0].a, 12) ? ctx.floorEdit.segments[0].a : rawEnd;
        ctx.addFloorEditSegment(start, end);
        ctx.floorEdit.first = ctx.floorPointEq(end, ctx.floorEdit.segments[0]?.a ?? end, 3) ? null : end;
        ctx.floorEdit.hover = ctx.floorEdit.first;
        ctx.renderFloorBoundaryEdit();
        return;
      }

      if (ctx.underlayCal.active) {
        if (!ctx.underlayMesh.visible || !hasLoadedUnderlay() || ctx.underlayState.pinned) {
          ctx.underlayCal.active = false;
          ctx.underlayCal.first = null;
          ctx.setUnderlayStatus("Underlay not available.");
          return;
        }

        const hit = ctx.raycaster.intersectObject(ctx.underlayMesh, false)[0];
        if (!hit) {
          ctx.setUnderlayStatus("Click on underlay.");
          return;
        }
        const hitPoint = hit.point.clone();
        if (!ctx.underlayCal.first) {
          ctx.underlayCal.first = hitPoint.clone();
          ctx.setUnderlayStatus(ctx.underlayCal.mode === "reference" ? "Reference scale: click second point..." : "Calibration: click second point...");
          return;
        }

        const a = ctx.underlayCal.first;
        const b = hitPoint;
        const distM = Math.hypot(b.x - a.x, b.z - a.z);
        if (distM <= 1e-6) {
          ctx.setUnderlayStatus("Reference scale failed (zero distance).");
          ctx.underlayCal.active = false;
          ctx.underlayCal.first = null;
          return;
        }

        let desiredMm = Math.max(1, ctx.underlayCal.knownMm);
        if (ctx.underlayCal.mode === "reference") {
          const measuredMm = Math.round(distM * 1000);
          const s = window.prompt("Real distance (mm)", String(measuredMm));
          const n = s === null ? null : Number(s.trim().replace(",", "."));
          if (!n || !Number.isFinite(n) || n <= 0) {
            ctx.setUnderlayStatus("Reference scale canceled.");
            ctx.underlayCal.active = false;
            ctx.underlayCal.first = null;
            return;
          }
          desiredMm = n;
        }

        const desiredM = desiredMm / 1000;
        if (distM > 1e-6 && ctx.underlayMesh.visible) {
          const factor = desiredM / distM;
          ctx.underlayState.scale *= factor;
          ctx.updateUnderlayTransform();
          if (ctx.underlayScaleEl) ctx.underlayScaleEl.value = String(ctx.underlayState.scale);
          ctx.setUnderlayStatus(ctx.underlayCal.mode === "reference" ? `Reference scale OK: ${Math.round(desiredMm)} mm` : `Calibration OK: ${Math.round(desiredMm)} mm`);
        } else {
          ctx.setUnderlayStatus("Calibration failed (zero distance).");
        }

        ctx.underlayCal.active = false;
        ctx.underlayCal.first = null;
        return;
      }

      if (ctx.placement.active && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select") {
        if (ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        ctx.rebuildGhost(ctx.S, ctx.placementHelpers, hitPoint);
        ctx.commitPlacement(ctx.S, ctx.placementHelpers);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (ctx.layoutTool === "select" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.transformState.kind) {
        if (ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.cam(), 24);
        const p = snapped.kind !== "none" ? snapped.point : hitPoint;

        if (ctx.transformState.kind === "move") {
          if (ctx.transformState.step === "pickBase") {
            ctx.transformState.base = p.clone();
            ctx.transformState.step = "pickTarget";
            ctx.transformState.typed = "";
            ctx.transformState.lastValidDelta.set(0, 0, 0);
            ctx.setUnderlayStatus("Move: click target point, or move mouse and type distance. Shift = constrain.");
            return;
          }
          if (ctx.transformState.step === "pickTarget" && ctx.transformState.base) {
            const rawDelta = p.clone().sub(ctx.transformState.base);
            const delta = ev.shiftKey ? constrainMoveDelta(rawDelta) : rawDelta;
            const continueMove = !!ctx.transformState.stickyMove;
            ctx.applyMoveDelta(delta);
            ctx.commitHistory(ctx.S);
            ctx.clearTransform({
              continueMove,
              status: continueMove ? "Move: done. Select next element, or click Move again to exit." : "Move: done."
            });
            ctx.mountProps();
            return;
          }
        }

        if (ctx.transformState.kind === "rotate") {
          if (ctx.transformState.step === "pickPivot") {
            ctx.transformState.pivot = p.clone();
            ctx.transformState.step = "rotating";
            ctx.transformState.typed = "";
            ctx.transformState.lastValidAngle = 0;
            ctx.transformState.startPointerAngle = Math.atan2(hitPoint.z - p.z, hitPoint.x - p.x);
            ctx.setUnderlayStatus("Rotate: move mouse to rotate (type degrees + Enter). Click to finish.");
            return;
          }
          if (ctx.transformState.step === "rotating") {
            ctx.commitHistory(ctx.S);
            ctx.clearTransform({ status: "Rotate: done." });
            ctx.mountProps();
            return;
          }
        }
      }

      if (ctx.layoutTool === "dimension") {
        if (ctx.viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };
        const picked = ctx.pickAlignLineAt(hitPoint, mouse, rect2);

        if (picked) {
          if (ctx.dimensionState.picked.length > 0 && !ctx.areAlignLinesParallel(ctx.dimensionState.picked[0]!, picked)) {
            ctx.setUnderlayStatus("Dimension: next line must be parallel with the first one.");
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          if (ctx.technicalDimensions.isLinePicked(picked)) {
            ctx.setUnderlayStatus("Dimension: this line is already selected.");
            ev.preventDefault();
            ev.stopPropagation();
            return;
          }
          ctx.dimensionState.picked.push(picked);
          ctx.dimensionState.preview = [];
          ctx.setUnderlayStatus(
            ctx.dimensionState.picked.length === 1
              ? "Dimension: select another parallel line."
              : `Dimension: selected ${ctx.dimensionState.picked.length} lines. Add another one or click empty space.`
          );
          ctx.mountProps();
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        if (ctx.dimensionState.picked.length < 2) {
          ctx.setUnderlayStatus("Dimension: select at least two parallel lines first.");
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        const dims = ctx.technicalDimensions.buildFromPickedLines(ctx.dimensionState.picked, hitPoint, "dimension");
        ctx.technicalDimensions.commitDimensions(dims);
        ctx.technicalDimensions.resetDraft();
        ctx.setUnderlayStatus(dims.length > 0 ? `Dimension: inserted ${dims.length}. Select the next first line.` : "Dimension: insert failed.");
        ctx.mountProps();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }

      if (ctx.layoutTool === "align") {
        if (ctx.viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };
        const picked = ctx.pickAlignLineAt(hitPoint, mouse, rect2);

        if (!picked) {
          ctx.setUnderlayStatus("Align: click a wall/module/worktop line.");
          return;
        }

        if (!ctx.alignState.ref) {
          ctx.alignState.ref = picked;
          ctx.alignState.lastA = null;
          ctx.alignState.lastB = null;
          ctx.alignState.lastUntilMs = 0;
          ctx.setUnderlayStatus("Align: click second parallel line...");
          ctx.mountProps();
          return;
        }

        const ref = ctx.alignState.ref;
        const result = ctx.applyAlignBetweenPickedLines(ref, picked);
        if (!result.ok) {
          ctx.setUnderlayStatus(result.reason);
          ctx.alignState.ref = null;
          ctx.mountProps();
          return;
        }
        ctx.updateSelectionHighlights();
        ctx.commitHistory(ctx.S);

        ctx.alignState.lastA = ref;
        ctx.alignState.lastB = picked;
        ctx.alignState.lastUntilMs = performance.now() + 2500;
        ctx.alignState.ref = null;
        ctx.setUnderlayStatus(result.reason);
        ctx.mountProps();
        return;
      }

      if (ctx.layoutTool === "trim") {
        if (ctx.viewMode !== "2d") return;
        if (ev.button !== 0) return;

        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };
        const picked = ctx.pickAlignLineAt(hitPoint, mouse, rect2);
        if (!picked) {
          ctx.setUnderlayStatus(ctx.trimState.step === "pickTarget" ? "Trim: click target wall line." : "Trim: click cutter line.");
          return;
        }

        if (ctx.trimState.step === "pickTarget") {
          if (!picked.wallId) return;
          ctx.trimState.targetWallId = picked.wallId;
          ctx.trimState.targetPick = picked;
          ctx.trimState.targetClick = hitPoint.clone();
          ctx.trimState.step = "pickCutter";
          ctx.trimState.lastTarget = null;
          ctx.trimState.lastCutter = null;
          ctx.trimState.lastUntilMs = 0;
          ctx.setUnderlayStatus("Trim: click cutter line...");
          ctx.mountProps();
          return;
        }

        const cutterClick = hitPoint.clone();

        const wallId = ctx.trimState.targetWallId;
        const w = wallId ? (ctx.walls.find((x) => x.id === wallId) ?? null) : null;
        if (!w) {
          ctx.trimState.step = "pickTarget";
          ctx.trimState.targetWallId = null;
          ctx.trimState.targetPick = null;
          ctx.setUnderlayStatus("Trim: target missing. Click target wall...");
          ctx.mountProps();
          return;
        }
        if (ctx.pinnedWallIds.has(w.id)) {
          ctx.trimState.step = "pickTarget";
          ctx.trimState.targetWallId = null;
          ctx.trimState.targetPick = null;
          ctx.trimState.targetClick = null;
          ctx.setUnderlayStatus("Trim: target is pinned.");
          ctx.mountProps();
          return;
        }

        // Wall-to-wall Trim/Extend to Corner: if second click hits another wall line, extend/trim both walls to their intersection.
        if (picked.wallId !== w.id && ctx.trimState.targetPick && ctx.trimState.targetClick) {
          const w2 = ctx.walls.find((x) => x.id === picked.wallId) ?? null;
          if (w2 && !ctx.pinnedWallIds.has(w2.id)) {
            const I = ctx.lineLineIntersectionXZ(ctx.trimState.targetPick.p, ctx.trimState.targetPick.dir, picked.p, picked.dir);
            if (!I) {
              ctx.setUnderlayStatus("Trim: walls must not be parallel.");
              return;
            }

            const chooseEnd = (wall: WallInstance, click: THREE.Vector3) => {
              const a = new THREE.Vector3(wall.params.aMm.x / 1000, 0, wall.params.aMm.z / 1000);
              const b = new THREE.Vector3(wall.params.bMm.x / 1000, 0, wall.params.bMm.z / 1000);
              return click.distanceTo(a) <= click.distanceTo(b) ? ("a" as const) : ("b" as const);
            };

            const iMm = ctx.toMmPoint(I);
            const end1 = chooseEnd(w, ctx.trimState.targetClick);
            const end2 = chooseEnd(w2, cutterClick);

            const old1 = end1 === "a" ? w.params.aMm : w.params.bMm;
            const old2 = end2 === "a" ? w2.params.aMm : w2.params.bMm;

            const dx1 = iMm.x - old1.x;
            const dz1 = iMm.z - old1.z;
            const dx2 = iMm.x - old2.x;
            const dz2 = iMm.z - old2.z;

            if (dx1 === 0 && dz1 === 0 && dx2 === 0 && dz2 === 0) {
              ctx.setUnderlayStatus("Trim: no change.");
              ctx.trimState.step = "pickTarget";
              ctx.trimState.targetWallId = null;
              ctx.trimState.targetPick = null;
              ctx.trimState.targetClick = null;
              ctx.mountProps();
              return;
            }

            const moved = ctx.setWallEndpointsAndConnectedMm([
              { wall: w, which: end1, next: iMm },
              { wall: w2, which: end2, next: iMm }
            ]);
            if (!moved) {
              ctx.mountProps();
              return;
            }
            ctx.commitHistory(ctx.S);

            ctx.trimState.lastTarget = ctx.trimState.targetPick;
            ctx.trimState.lastCutter = picked;
            ctx.trimState.lastUntilMs = performance.now() + 2500;
            ctx.trimState.step = "pickTarget";
            ctx.trimState.targetWallId = null;
            ctx.trimState.targetPick = null;
            ctx.trimState.targetClick = null;
            ctx.setUnderlayStatus("Trim: corner done. Click target wall...");
            ctx.mountProps();
            return;
          }
        }

        const aW = new THREE.Vector3(w.params.aMm.x / 1000, 0, w.params.aMm.z / 1000);
        const bW = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
        const ab = bW.clone().sub(aW);
        const len2 = ab.lengthSq();
        if (len2 < 1e-10) {
          ctx.setUnderlayStatus("Trim: wall too small.");
          return;
        }
        const dW = ab.clone().normalize();
        const dC = picked.dir.clone().normalize();
        const I = ctx.lineLineIntersectionXZ(aW, dW, picked.p, dC);
        if (!I) {
          ctx.setUnderlayStatus("Trim: cutter must not be parallel.");
          return;
        }

        const nC = new THREE.Vector3(-dC.z, 0, dC.x);
        const sign = (v: number) => (v > 1e-7 ? 1 : v < -1e-7 ? -1 : 0);
        let sClick = sign(nC.dot(hitPoint.clone().sub(picked.p)));
        const sA = sign(nC.dot(aW.clone().sub(picked.p)));
        const sB = sign(nC.dot(bW.clone().sub(picked.p)));
        if (sClick === 0) sClick = sA !== 0 ? sA : sB;

        let moveWhich: "a" | "b" = "a";
        if (sClick !== 0) {
          if (sA === sClick && sB !== sClick) moveWhich = "a";
          else if (sB === sClick && sA !== sClick) moveWhich = "b";
          else {
            // ambiguous: choose closer endpoint to the click point
            moveWhich = cutterClick.distanceTo(aW) <= cutterClick.distanceTo(bW) ? "a" : "b";
          }
        } else {
          moveWhich = cutterClick.distanceTo(aW) <= cutterClick.distanceTo(bW) ? "a" : "b";
        }

        const iMm = ctx.toMmPoint(I);
        const old = moveWhich === "a" ? w.params.aMm : w.params.bMm;
        const dxMm = iMm.x - old.x;
        const dzMm = iMm.z - old.z;

        if (dxMm === 0 && dzMm === 0) {
          ctx.setUnderlayStatus("Trim: no change.");
          ctx.trimState.step = "pickTarget";
          ctx.trimState.targetWallId = null;
          ctx.trimState.targetPick = null;
          ctx.trimState.targetClick = null;
          ctx.mountProps();
          return;
        }

        const moved = ctx.setWallEndpointAndConnectedMm(w, moveWhich, iMm);
        if (!moved) {
          ctx.mountProps();
          return;
        }
        ctx.commitHistory(ctx.S);

        ctx.trimState.lastTarget = ctx.trimState.targetPick ?? picked;
        ctx.trimState.lastCutter = picked;
        ctx.trimState.lastUntilMs = performance.now() + 2500;
        ctx.trimState.step = "pickTarget";
        ctx.trimState.targetWallId = null;
        ctx.trimState.targetPick = null;
        ctx.trimState.targetClick = null;
        ctx.setUnderlayStatus("Trim: done. Click target wall...");
        ctx.mountProps();
        return;
      }

      if (ctx.layoutTool === "measure") {
        if (ev.button !== 0) return;
        let kind: string = "none";
        let point: THREE.Vector3 | null = null;
        let binding: PlanSnapBinding | null = null;
        const normalMode = ctx.viewMode === "2d" && ev.shiftKey;

        if (ctx.viewMode === "2d") {
          const hitPoint = new THREE.Vector3();
          if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
          const snapped = ctx.resolveMeasurePlanSnap(hitPoint, rect, normalMode);
          kind = snapped.kind;
          point = snapped.kind !== "none" ? snapped.point : hitPoint;
          binding = ctx.bindingFromPlanSnap(snapped, point);
          if (!ctx.measureState.axisLock && (snapped.kind === "none" || snapped.kind === "axis")) {
            const axisAssist = ctx.applyMeasureAxisAssist(ctx.measureState.firstPoint, point, ctx.cam(), rect, 12);
            if (axisAssist) {
              point = axisAssist.point;
              kind = "axis";
              binding = ctx.toFreePlanBinding(point);
            }
          }
        } else {
          const hit = ctx.pickSurfacePoint(ctx.raycaster, ctx.getLayoutMeasureMeshes3d());
          if (!hit) return;
          const snapTarget = ctx.getMeasure3DSnapTargetObject(hit.object);
          const snapped = ctx.snapPoint3D(hit.point, snapTarget ?? hit.object, ctx.cam(), rect, 32);
          kind = snapped.kind;
          point = snapped.point;
          binding = ctx.toFreePlanBinding(point);
          if (!ctx.measureState.axisLock && snapped.kind === "free") {
            const axisAssist = ctx.applyMeasureAxisAssist3D(ctx.measureState.firstPoint, point, ctx.cam(), rect, 12);
            if (axisAssist) {
              point = axisAssist.point;
              kind = "axis";
              binding = ctx.toFreePlanBinding(point);
            }
          }
        }
        if (!point) return;

        if (!ctx.measureState.firstPoint) {
          ctx.measureState.firstPoint = point.clone();
          ctx.measureState.firstBinding = binding ?? ctx.toFreePlanBinding(point);
          ctx.setFirstPointMarker(ctx.measureState.firstPoint);
          ctx.args.measureReadoutEl.textContent =
            normalMode
              ? `Normal (${kind}): ${ctx.formatMm(point)} -> click second guide point.`
              : `First point (${kind}): ${ctx.formatMm(point)} -> click second point.`;
          ctx.setUnderlayStatus(normalMode ? "Measure: click second guide point for normal." : "Measure: click second point.");
          ctx.mountProps();
          return;
        }

        let a = ctx.measureState.firstPoint.clone();
        let b = point.clone();
        if (ctx.measureState.axisLock) b = ctx.viewMode === "2d" ? ctx.axisLockXZ(a, b) : ctx.axisLockPoint3D(a, b);
        const aBinding = ctx.measureState.firstBinding ?? ctx.toFreePlanBinding(a);
        const bBinding = binding ?? ctx.toFreePlanBinding(b);
        if (normalMode) {
          const baseDir = b.clone().sub(a).setY(0);
          if (baseDir.lengthSq() > 1e-10) {
            baseDir.normalize();
            const normalDir = new THREE.Vector3(-baseDir.z, 0, baseDir.x).normalize();
            const spanM = Math.max(4, Math.min(30, a.distanceTo(b) * 6));
            ctx.addMeasurement(
              a.clone().addScaledVector(normalDir, -spanM / 2),
              a.clone().addScaledVector(normalDir, spanM / 2),
              aBinding,
              bBinding,
              { kind: "normalGuide" }
            );
          }
        } else {
          ctx.addMeasurement(a, b, aBinding, bBinding, {
            kind: "distance",
            distanceMm: ctx.viewMode === "2d" ? ctx.planarDistanceMm(a, b) : ctx.distance3dMm(a, b)
          });
        }
        ctx.measureState.firstPoint = null;
        ctx.measureState.firstBinding = null;
        ctx.setFirstPointMarker(null);
        ctx.clearPreview();
        ctx.clearToolHud();
        return;
      }

      if (ctx.layoutTool === "section") {
        if (ctx.viewMode !== "2d" || ctx.activeViewerTab !== "floorplan" || ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const resolved = ctx.resolveSectionDrawPoint(hitPoint, rect, !ev.shiftKey);
        ctx.sectionDraw.axisLocked = resolved.axisLocked;
        const point = { x: Math.round(resolved.point.x * 1000), z: Math.round(resolved.point.z * 1000) };

        if (!ctx.sectionDraw.a) {
          ctx.sectionDraw.a = point;
          ctx.sectionDraw.hoverPoint = point;
          ctx.updateSectionDrawPreview();
          ctx.setUnderlayStatus("Section: click second point. Ortho = straight, Shift = no axis snap, Space = mirror direction.");
          ctx.mountProps();
          return;
        }

        if (ctx.commitSectionDraw(point)) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        return;
      }

      if (ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active) {
        if (ctx.viewMode !== "2d" || ev.button !== 0) return;
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const activeSnap = ctx.resolveKitchenWorktopDrawSnap(hitPoint, rect2);
        const source = activeSnap ? activeSnap.point : hitPoint.clone();
        const rawPoint = { x: Math.round(source.x * 1000), z: Math.round(source.z * 1000) };
        const basePoint = ctx.kitchenWorktopDraw.points[ctx.kitchenWorktopDraw.points.length - 1] ?? null;
        const point = basePoint ? ctx.floorOrthoPoint(basePoint, rawPoint) : rawPoint;
        ctx.appendKitchenWorktopPoint(point);
        return;
      }

      if (ctx.layoutTool === "wall") {
        if (ev.button !== 0) return;
        // Place wall by 2 clicks on ground (XZ).
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const snapped = ctx.snapPoint2D(hitPoint, rect2, ctx.cam());
        const shouldAxisSnap = ctx.drawOrthoEnabled && !ev.shiftKey && snapped.kind === "none";

      if (!ctx.wallDraw.active) {
        ctx.wallDraw.active = true;
        ctx.wallDraw.segments = ctx.wallDraw.segments || 0;
        const start = snapped.kind !== "none" ? snapped.point : hitPoint.clone();
        const startMm = { x: Math.round(start.x * 1000), z: Math.round(start.z * 1000) };
        ctx.wallDraw.a = new THREE.Vector3(startMm.x / 1000, 0, startMm.z / 1000);
        if (!ctx.wallDraw.chainStart) ctx.wallDraw.chainStart = ctx.wallDraw.a.clone();
        ctx.wallDraw.hoverB = ctx.wallDraw.a.clone();
        ctx.wallDraw.typedMm = "";
        ctx.wallTypedHud.style.display = "none";
        if (!ctx.wallDraw.preview) {
          ctx.wallDraw.preview = ctx.makeWallPreviewMesh(ctx.wallDraw.a, ctx.wallDraw.a, ctx.wallDefault.thicknessMm);
          ctx.wallDraw.preview.name = "wallPreview";
          ctx.layoutRoot.add(ctx.wallDraw.preview);
        }
        ctx.updateWallMeshWithJustification(
          ctx.wallDraw.preview,
          ctx.wallDraw.a,
          ctx.wallDraw.a,
          ctx.wallDefault.thicknessMm,
          ctx.wallDefault.justification,
          ctx.wallDefault.exteriorSign
        );
        ctx.setUnderlayStatus("Wall: second point... (type mm + Enter, Shift = no axis snap, Esc = stop)");
        return;
      }

        const a = ctx.wallDraw.a;
        if (!a) return;
        const closeTolM = Math.max(0.03, Math.min(0.15, ctx.wallDefault.thicknessMm / 1000));
        const cs = ctx.wallDraw.chainStart;
        const rawB = snapped.kind !== "none" ? snapped.point : hitPoint.clone();
        const closesRaw =
          !!cs && ctx.wallDraw.segments >= 2 && Math.hypot(rawB.x - cs.x, rawB.z - cs.z) <= closeTolM;
        const b0 = closesRaw && cs ? cs.clone() : rawB;
        const b = shouldAxisSnap && !closesRaw ? ctx.snapAxisXZ(a, b0, true) : b0;
        const bMm = { x: Math.round(b.x * 1000), z: Math.round(b.z * 1000) };
        const bExact = new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000);

        // Snap to chain start when closing loop.
        const closes =
          closesRaw || (!!cs && ctx.wallDraw.segments >= 2 && Math.hypot(bExact.x - cs.x, bExact.z - cs.z) <= closeTolM);
        const end = closes && cs ? cs.clone() : bExact;

        // Finish wall
        const w = ctx.addWall(a, end, ctx.wallDefault.thicknessMm);
        if (!w) return;
        ctx.autoJoinAtMmPoint(w.params.aMm);
        ctx.autoJoinAtMmPoint(w.params.bMm);
        ctx.wallDraw.segments += 1;

        if (closes) {
          ctx.clearWallDrawState();
          ctx.setUnderlayStatus("Wall: chain closed.");
          return;
        }

        // Continue chain from end point.
        ctx.wallDraw.active = true;
        ctx.wallDraw.a = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
        ctx.wallDraw.hoverB = ctx.wallDraw.a.clone();
        ctx.wallDraw.typedMm = "";
        ctx.wallTypedHud.style.display = "none";
        ctx.updateWallMeshWithJustification(
          ctx.wallDraw.preview!,
          ctx.wallDraw.a,
          ctx.wallDraw.a,
          ctx.wallDefault.thicknessMm,
          ctx.wallDefault.justification,
          ctx.wallDefault.exteriorSign
        );
        ctx.setUnderlayStatus("Wall: next point... (type mm + Enter, Shift = no axis snap, Esc = stop)");
        // Keep wall tool active; just show properties for the placed wall.
        ctx.selectedKind = "wall";
        ctx.selectedWallId = w.id;
        ctx.mountProps();
        return;
      }

      if (ctx.measureState.enabled) return;

      // 2D wall selection without raycasting (walls are hidden in 2D; plan mesh is merged).
      if (ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select" && ev.button === 0) {
        const hitPoint = new THREE.Vector3();
        if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const pMm = ctx.toMmPoint(hitPoint);
        const rect2 = ctx.renderer.domElement.getBoundingClientRect();
        const mouse = { x: ev.clientX - rect2.left, y: ev.clientY - rect2.top };

        if (ctx.isColumnPlacementActive?.()) {
          const placementPoint = resolveColumnPlacementPoint(hitPoint, rect2);
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.insertColumnAtPoint?.(ctx.toMmPoint(placementPoint));
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        if (ctx.isWindowPlacementActive?.()) {
          const wallId = pickFloorplanWallId(pMm, mouse, rect2);
          if (!wallId) {
            ctx.setUnderlayStatus("Window: klikni priamo na stenu.");
            return;
          }
          ctx.insertWindowAtWallPoint?.(wallId, pMm);
          return;
        }

        if (ctx.isDoorPlacementActive?.()) {
          const wallId = pickFloorplanWallId(pMm, mouse, rect2);
          if (!wallId) {
            ctx.setUnderlayStatus("Door: klikni priamo na stenu.");
            return;
          }
          ctx.insertDoorAtWallPoint?.(wallId, pMm);
          return;
        }

        const pickedWindow = pickFloorplanWindow(pMm, mouse, rect2);
        if (pickedWindow) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.windowInst = pickedWindow;
          ctx.setSelectedWindow();
          if (continueMoveAfterSelection(hitPoint)) return;
          return;
        }

        const pickedDoor = pickFloorplanDoor(pMm, mouse, rect2);
        if (pickedDoor) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.doorInst = pickedDoor;
          ctx.setSelectedDoor();
          if (continueMoveAfterSelection(hitPoint)) return;
          return;
        }

        const sectionHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getSectionPickMeshes()), false)[0]?.object;
        const sectionId = ctx.getSectionIdFromObject(sectionHit);
        if (sectionId) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedSection(sectionId);
          return;
        }

        const columnHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getColumnPickMeshes()), false)[0]?.object;
        const columnId = ctx.getColumnIdFromObject(columnHit);
        if (columnId) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedColumn(columnId);
          return;
        }

        const moduleHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getAllInstanceGeometryMeshes()), false)[0]?.object;
        const moduleId = ctx.getInstanceIdFromObject(moduleHit);
        const selectableModuleId = moduleId && ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(moduleId) : moduleId;
        if (selectableModuleId && ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements") {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedModule(selectableModuleId);
          if (continueMoveAfterSelection(hitPoint)) return;
        }
        if (selectableModuleId && ctx.beginModuleSelection(selectableModuleId, ev)) return;

        const fallbackModuleId = ctx.findSelectableFloorplanModuleAtPoint(pMm, mouse, rect2);
        if (fallbackModuleId && isPickableKey(`module:${fallbackModuleId}`) && ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements") {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedModule(fallbackModuleId);
          if (continueMoveAfterSelection(hitPoint)) return;
        }
        if (fallbackModuleId && isPickableKey(`module:${fallbackModuleId}`) && ctx.beginModuleSelection(fallbackModuleId, ev)) return;

        const worktopHit = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object;
        const worktopId = ctx.getWorktopIdFromObject(worktopHit);
        if (worktopId && ctx.beginKitchenWorktopSelection(worktopId, ev)) return;

        let bestFloor: { id: string; px: number } | null = null;
        for (const floor of ctx.floors) {
          if (!isPickableKey(`floor:${floor.id}`)) continue;
          const boundary = floor.params.boundary;
          for (let i = 0; i < boundary.length; i++) {
            const a = boundary[i];
            const b = boundary[(i + 1) % boundary.length];
            const sa = ctx.worldToScreen(ctx.floorPointToWorld(a), ctx.cam(), rect2);
            const sb = ctx.worldToScreen(ctx.floorPointToWorld(b), ctx.cam(), rect2);
            const edgePx = ctx.distPxPointToSeg(mouse.x, mouse.y, sa.x, sa.y, sb.x, sb.y);
            const cornerPx = Math.min(Math.hypot(mouse.x - sa.x, mouse.y - sa.y), Math.hypot(mouse.x - sb.x, mouse.y - sb.y));
            const px = Math.min(edgePx, cornerPx);
            if (px <= 12 && (!bestFloor || px < bestFloor.px)) bestFloor = { id: floor.id, px };
          }
        }
        if (bestFloor) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedFloor(bestFloor.id);
          return;
        }

        // Prefer polygon hit-testing when available.
        let bestPoly: { id: string; px: number } | null = null;
        const pW = { x: pMm.x / 1000, z: pMm.z / 1000 };
        for (const [id, poly] of ctx.wallSolvedOutlines) {
          if (!isPickableKey(`wall:${id}`)) continue;
          if (poly.length < 3) continue;
          if (!ctx.pointInPolygonXZ(pW, poly)) continue;
          // score by distance to mouse from wall midpoint (stable pick)
          const w = ctx.walls.find((x) => x.id === id) ?? null;
          const mid = w ? new THREE.Vector3((w.params.aMm.x + w.params.bMm.x) / 2000, 0, (w.params.aMm.z + w.params.bMm.z) / 2000) : new THREE.Vector3(pW.x, 0, pW.z);
          const s = ctx.worldToScreen(mid, ctx.cam(), rect2);
          const px = Math.hypot(s.x - mouse.x, s.y - mouse.y);
          if (!bestPoly || px < bestPoly.px) bestPoly = { id, px };
        }
        if (bestPoly) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedWall(bestPoly.id);
          if (continueMoveAfterSelection(hitPoint)) return;
          return;
        }

        let best: { id: string; px: number } | null = null;
        for (const w of ctx.walls) {
          if (!isPickableKey(`wall:${w.id}`)) continue;
          const closest = ctx.pointOnWallAxisMm(w, pMm);
          if (!Number.isFinite(closest.distMm)) continue;
          const cp = new THREE.Vector3(closest.closest.x / 1000, 0, closest.closest.z / 1000);
          const s = ctx.worldToScreen(cp, ctx.cam(), rect2);
          const px = Math.hypot(s.x - mouse.x, s.y - mouse.y);
          if (!best || px < best.px) best = { id: w.id, px };
        }

        if (best && best.px <= 10) {
          if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
            ctx.marquee.hitSomething = true;
            ctx.marquee.pending = false;
            ctx.marquee.active = false;
            ctx.marqueeEl.style.display = "none";
          }
          ctx.setSelectedWall(best.id);
          if (continueMoveAfterSelection(hitPoint)) return;
          return;
        }
      }

      const picks: THREE.Object3D[] = ctx.getAllInstanceGeometryMeshes();
      const windowPicks = ctx.windows.map((inst) => inst.pick);
      const doorPicks = ctx.doors.map((inst) => inst.pick);
      picks.push(...windowPicks);
      picks.push(...doorPicks);
      picks.push(...ctx.getColumnPickMeshes());
      for (const w of ctx.walls) picks.push(w.mesh);
      for (const floor of ctx.floors) picks.push(floor.mesh, floor.outline as any);
      const hits = ctx.raycaster.intersectObjects(pickableObjects(picks), false);
      const windowHit = ctx.raycaster.intersectObjects(pickableObjects(windowPicks), false)[0] ?? null;
      const doorHit = ctx.raycaster.intersectObjects(pickableObjects(doorPicks), false)[0] ?? null;
      const openingHit =
        doorHit && windowHit
          ? (doorHit.distance <= windowHit.distance ? doorHit : windowHit)
          : doorHit ?? windowHit;
      const firstHit = openingHit && (!hits[0] || openingHit.distance <= hits[0].distance + 0.25) ? openingHit : hits[0];
      const first = firstHit?.object as THREE.Mesh | undefined;
      const worktopHit3d = ctx.raycaster.intersectObjects(pickableObjects(ctx.getKitchenWorktopGeometryMeshes()), false)[0]?.object as THREE.Mesh | undefined;
      const kind = (first?.userData?.kind as string | undefined) ?? "module";

      if (kind === "window") {
        const pickedWindow = findWindowFromObject(first);
        if (!pickedWindow) return;
        ctx.windowInst = pickedWindow;
        if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
          ctx.marquee.hitSomething = true;
          ctx.marquee.pending = false;
          ctx.marquee.active = false;
          ctx.marqueeEl.style.display = "none";
        }
        ctx.setSelectedWindow();
        if (continueMoveAfterSelection(firstHit?.point)) return;

        ctx.windowDragState.active = true;
        const customWallId = ctx.windowInst.params.wallId ?? null;
        ctx.windowDragState.wall = customWallId ?? ctx.windowInst.params.wall;
        if (customWallId) {
          const wall = ctx.walls.find((item) => item.id === customWallId) ?? null;
          const hitPoint = new THREE.Vector3();
          if (!wall || !ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
          const closest = ctx.pointOnWallAxisMm(wall, ctx.toMmPoint(hitPoint));
          const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
          ctx.windowDragState.offsetMm = ctx.windowInst.params.centerMm - closest.t * lengthMm;
        } else {
          const def = ctx.wallDefs[ctx.windowInst.params.wall];
          const hitPoint = new THREE.Vector3();
          const okWall = ctx.raycaster.ray.intersectPlane(def.plane, hitPoint);
          if (!okWall) {
            if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
          }
          const axis = def.axis === "x" ? hitPoint.x : hitPoint.z;
          ctx.windowDragState.offsetMm = ctx.windowInst.params.centerMm - axis * 1000;
        }
        ctx.renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }

      if (kind === "door") {
        const pickedDoor = findDoorFromObject(first);
        if (!pickedDoor) return;
        ctx.doorInst = pickedDoor;
        if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
          ctx.marquee.hitSomething = true;
          ctx.marquee.pending = false;
          ctx.marquee.active = false;
          ctx.marqueeEl.style.display = "none";
        }
        ctx.setSelectedDoor();
        if (continueMoveAfterSelection(firstHit?.point)) return;

        ctx.doorDragState.active = true;
        const customWallId = ctx.doorInst.params.wallId ?? null;
        ctx.doorDragState.wall = customWallId;
        if (customWallId) {
          const wall = ctx.walls.find((item) => item.id === customWallId) ?? null;
          const hitPoint = new THREE.Vector3();
          if (!wall || !ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
          const closest = ctx.pointOnWallAxisMm(wall, ctx.toMmPoint(hitPoint));
          const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
          ctx.doorDragState.offsetMm = ctx.doorInst.params.centerMm - closest.t * lengthMm;
        }
        ctx.renderer.domElement.setPointerCapture(ev.pointerId);
        return;
      }

      const id = ctx.getInstanceIdFromObject(first);
      const columnId = ctx.getColumnIdFromObject(first);
      const wallId = (first?.userData?.wallId as string | undefined) ?? null;
      const floorId = (first?.userData?.floorId as string | undefined) ?? null;
      const worktopId = ctx.getWorktopIdFromObject(first) ?? ctx.getWorktopIdFromObject(worktopHit3d);
      if (!id && worktopId && ctx.beginKitchenWorktopSelection(worktopId, ev)) return;
      if (kind === "column" || columnId) {
        if (!columnId) {
          ctx.setSelectedColumn(null);
          return;
        }
        if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
          ctx.marquee.hitSomething = true;
          ctx.marquee.pending = false;
          ctx.marquee.active = false;
          ctx.marqueeEl.style.display = "none";
        }
        ctx.setSelectedColumn(columnId);
        return;
      }
      if (kind === "floor") {
        if (ctx.viewMode === "2d" && ctx.activeViewerTab !== "floorplan") {
          ctx.selectedKind = null;
          ctx.selectedColumnId = null;
          ctx.selectedSectionId = null;
          ctx.selectedKitchenGroupId = null;
          ctx.selectedFloorId = null;
          ctx.selectedWallId = null;
          ctx.selectedWallIds.clear();
          ctx.selectedInstanceId = null;
          ctx.selectedInstanceIds.clear();
          ctx.setInstanceSelected(null);
          ctx.showWallSnapMarkersFor(null);
          ctx.syncSelectionState();
          ctx.updateSelectionHighlights();
          ctx.updateAllSectionVisuals();
          ctx.mountProps();
          return;
        }
        if (!floorId) {
          ctx.setSelectedFloor(null);
          return;
        }
        if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
          ctx.marquee.hitSomething = true;
          ctx.marquee.pending = false;
          ctx.marquee.active = false;
          ctx.marqueeEl.style.display = "none";
        }
        ctx.setSelectedFloor(floorId);
        return;
      }
      if (kind === "wall") {
        if (!wallId) {
          ctx.setSelectedWall(null);
          return;
        }
        if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
          ctx.marquee.hitSomething = true;
          ctx.marquee.pending = false;
          ctx.marquee.active = false;
          ctx.marqueeEl.style.display = "none";
        }
        ctx.setSelectedWall(wallId);
        if (continueMoveAfterSelection(firstHit?.point)) return;
        return;
      }

      if (!id) {
        if (ctx.viewMode === "2d" && ctx.layoutTool === "select" && ev.button === 0 && ctx.underlayMesh.visible && hasLoadedUnderlay() && isPickableKey("underlay:main") && !ctx.underlayState.pinned) {
          const underlayHit = ctx.raycaster.intersectObject(ctx.underlayMesh, false)[0];
          if (underlayHit) {
            if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
              ctx.marquee.hitSomething = true;
              ctx.marquee.pending = false;
              ctx.marquee.active = false;
              ctx.marqueeEl.style.display = "none";
            }
            ctx.setSelectedUnderlay();
            const hitPoint = new THREE.Vector3();
            if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
            ctx.underlayDragState.active = true;
            ctx.underlayDragState.pointerId = ev.pointerId;
            ctx.underlayDragState.startWorld.copy(hitPoint);
            ctx.underlayDragState.startOffsetMm = { x: ctx.underlayState.offsetMm.x, z: ctx.underlayState.offsetMm.z };
            ctx.renderer.domElement.setPointerCapture(ev.pointerId);
            ctx.setUnderlayStatus("Drag underlay... (Pin when ready)");
            return;
          }
        }
        if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId) {
          // don't clear selection yet; if it becomes a drag we want marquee selection
          return;
        }
        const currentMoveBasePoint = new THREE.Vector3();
        if (ctx.raycaster.ray.intersectPlane(ctx.groundPlane, currentMoveBasePoint) && continueMoveWithCurrentSelection(currentMoveBasePoint)) return;
        ctx.setSelectedFloor(null);
        ctx.setSelectedWall(null);
        ctx.setSelectedModule(null);
        ctx.doorInst = null;
        ctx.clearWindowLightIfMissing();
        return;
      }

      const selectableId = ctx.kitchenMode ? ctx.kitchenMode.filterSelectableInstanceId(id) : id;
      if (!selectableId) {
        if (worktopId && ctx.beginKitchenWorktopSelection(worktopId, ev)) return;
        ctx.setSelectedModule(null);
        ctx.doorInst = null;
        ctx.clearWindowLightIfMissing();
        return;
      }

      if (ctx.transformState.kind === "move" && ctx.transformState.step === "selectElements") {
        ctx.setSelectedModule(selectableId);
        if (continueMoveAfterSelection(firstHit?.point)) return;
      }

      ctx.beginModuleSelection(selectableId, ev);
      return;
    }

    if (!ctx.cabinetGroup) return;

    const meshes = ctx.getSelectableMeshes(ctx.cabinetGroup).filter((m) => m.visible);

    if (ctx.measureState.enabled) {
      const hit = ctx.pickSurfacePoint(ctx.raycaster, meshes);
      if (!hit) return;

      const snapped = ctx.snapPointXZ(hit.point, hit.object);
      if (!ctx.measureState.firstPoint) {
        ctx.measureState.firstPoint = snapped.point;
        ctx.measureState.firstBinding = ctx.toFreePlanBinding(snapped.point);
        ctx.args.measureReadoutEl.textContent = `First point (${snapped.kind}): ${ctx.formatMm(snapped.point)} -> pick second point...`;
        return;
      }

      let a = ctx.measureState.firstPoint;
      let b = snapped.point;
      if (ctx.measureState.axisLock) b = ctx.axisLockXZ(a, b);

      ctx.addMeasurement(a, b, ctx.measureState.firstBinding ?? ctx.toFreePlanBinding(a), ctx.toFreePlanBinding(b), {
        kind: "distance",
        distanceMm: ctx.planarDistanceMm(a, b)
      });
      ctx.measureState.firstPoint = null;
      ctx.measureState.firstBinding = null;
      ctx.clearPreview();
      return;
    }

    const hits = ctx.raycaster.intersectObjects(meshes, false);
    const first = hits[0]?.object as THREE.Mesh | undefined;
    ctx.selectMesh(first ?? null);
  });

  // Live hover + preview (SketchUp-like)
  ctx.renderer.domElement.addEventListener("pointermove", (ev) => {
    if (ctx.viewNavigation.handlePointerMove(ev)) {
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.floorEdit.active) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      const floorPoint = ctx.worldToFloorPoint(hitPoint);

      const activeFloorDrag = ctx.floorEdit.drag;
      if (activeFloorDrag && activeFloorDrag.pointerId === ev.pointerId) {
        if (activeFloorDrag.kind === "vertex") {
          ctx.moveFloorEditVertex(activeFloorDrag.startSegments, activeFloorDrag.startPoint, floorPoint);
        } else {
          ctx.moveFloorEditSegment(activeFloorDrag.startSegments, activeFloorDrag.segmentIndex, activeFloorDrag.startWorld, floorPoint);
        }
        ctx.floorEdit.error = "";
        ctx.renderFloorBoundaryEdit();
        return;
      }

      if (ctx.floorEdit.tool === "pickLines") {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = ctx.pickWallLine2D(hitPoint, rect, ctx.cam(), 14);
        const alignPicked = ctx.pickAlignLineAt(hitPoint, mouse, rect);
        const a = picked?.a ?? alignPicked?.segA ?? null;
        const b = picked?.b ?? alignPicked?.segB ?? null;
        if (a && b) ctx.updateHudLine(ctx.hudHoverLine, a, b, ctx.hudLineThicknessM(rect));
        else ctx.hudHoverLine.visible = false;
      } else {
        ctx.hudHoverLine.visible = false;
      }

      if (ctx.floorEdit.first) {
        ctx.floorEdit.hover = ctx.floorEdit.ortho ? ctx.floorOrthoPoint(ctx.floorEdit.first, floorPoint) : floorPoint;
        ctx.renderFloorBoundaryEdit();
      }
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.isWindowPlacementActive?.()) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.clearWindowPlacementPreview?.();
        return;
      }
      const pMm = ctx.toMmPoint(hitPoint);
      const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      const wallId = pickFloorplanWallId(pMm, mouse, rect);
      ctx.updateWindowPlacementPreview?.(wallId, pMm);
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.isDoorPlacementActive?.()) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.clearDoorPlacementPreview?.();
        return;
      }
      const pMm = ctx.toMmPoint(hitPoint);
      const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      const wallId = pickFloorplanWallId(pMm, mouse, rect);
      ctx.updateDoorPlacementPreview?.(wallId, pMm);
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select" && ctx.isColumnPlacementActive?.()) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.updateColumnPlacementPreview?.(null);
        ctx.selectPlanSnap = null;
        ctx.drawSnapOverlay.hide();
        ctx.hideHoverCursor();
        return;
      }
      const placementPoint = resolveColumnPlacementPoint(hitPoint, rect);
      ctx.updateColumnPlacementPreview?.(ctx.toMmPoint(placementPoint));
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.placement.active) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      ctx.rebuildGhost(ctx.S, ctx.placementHelpers, hitPoint);
      return;
    }

    // Wall edit drag (2D, select tool)
    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.wallEditHud.drag) {
      const d = ctx.wallEditHud.drag;
      const w = ctx.walls.find((x) => x.id === d.wallId) ?? null;
      if (!w) return;

      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

      if (d.kind === "move") {
        const dx = hitPoint.x - d.startWorld.x;
        const dz = hitPoint.z - d.startWorld.z;
        const nextA = { x: Math.round(d.startA.x + dx * 1000), z: Math.round(d.startA.z + dz * 1000) };
        const nextB = { x: Math.round(d.startB.x + dx * 1000), z: Math.round(d.startB.z + dz * 1000) };
        w.params.aMm = nextA;
        w.params.bMm = nextB;

        const touched = new Set<string>();
        touched.add(w.id);
        for (const c of d.connectedA) {
          const ow = ctx.walls.find((x) => x.id === c.wallId) ?? null;
          if (!ow) continue;
          if (c.which === "a") ow.params.aMm = nextA;
          else ow.params.bMm = nextA;
          touched.add(ow.id);
        }
        for (const c of d.connectedB) {
          const ow = ctx.walls.find((x) => x.id === c.wallId) ?? null;
          if (!ow) continue;
          if (c.which === "a") ow.params.aMm = nextB;
          else ow.params.bMm = nextB;
          touched.add(ow.id);
        }

        for (const id of touched) {
          const ww = ctx.walls.find((x) => x.id === id) ?? null;
          if (ww) ctx.rebuildWall(ww);
        }
        ctx.rebuildWallPlanMesh();

        // Block moving walls into modules.
        if (ctx.instances.some((i) => ctx.moduleOverlapsWalls(i))) {
          w.params.aMm = { x: d.startA.x, z: d.startA.z };
          w.params.bMm = { x: d.startB.x, z: d.startB.z };
          for (const c of d.connectedA) {
            const ow = ctx.walls.find((x) => x.id === c.wallId) ?? null;
            if (!ow) continue;
            if (c.which === "a") ow.params.aMm = { x: d.startA.x, z: d.startA.z };
            else ow.params.bMm = { x: d.startA.x, z: d.startA.z };
          }
          for (const c of d.connectedB) {
            const ow = ctx.walls.find((x) => x.id === c.wallId) ?? null;
            if (!ow) continue;
            if (c.which === "a") ow.params.aMm = { x: d.startB.x, z: d.startB.z };
            else ow.params.bMm = { x: d.startB.x, z: d.startB.z };
          }
          for (const ww of ctx.walls) ctx.rebuildWall(ww);
          ctx.rebuildWallPlanMesh();
        }
        return;
      }

      const which = d.kind;
      const other = which === "a" ? ctx.fromMmPoint(d.startB) : ctx.fromMmPoint(d.startA);
      const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.cam());
      const shouldAxisSnap = !ev.shiftKey && snapped.kind === "none";
      const p0 = snapped.kind !== "none" ? snapped.point : hitPoint;
      const p = shouldAxisSnap ? ctx.snapAxisXZ(other, p0, true) : p0;
      const pMm = ctx.toMmPoint(p);

      if (which === "a") w.params.aMm = pMm;
      else w.params.bMm = pMm;

      const touched = new Set<string>();
      touched.add(w.id);
      const connected = which === "a" ? d.connectedA : d.connectedB;
      for (const c of connected) {
        const ow = ctx.walls.find((x) => x.id === c.wallId) ?? null;
        if (!ow) continue;
        if (c.which === "a") ow.params.aMm = pMm;
        else ow.params.bMm = pMm;
        touched.add(ow.id);
      }
      for (const id of touched) {
        const ww = ctx.walls.find((x) => x.id === id) ?? null;
        if (ww) ctx.rebuildWall(ww);
      }
      ctx.rebuildWallPlanMesh();

      // Block moving walls into modules.
      if (ctx.instances.some((i) => ctx.moduleOverlapsWalls(i))) {
        // Restore endpoints from drag start snapshot.
        if (which === "a") w.params.aMm = { x: d.startA.x, z: d.startA.z };
        else w.params.bMm = { x: d.startB.x, z: d.startB.z };
        for (const c of connected) {
          const ow = ctx.walls.find((x) => x.id === c.wallId) ?? null;
          if (!ow) continue;
          const src = which === "a" ? d.startA : d.startB;
          if (c.which === "a") ow.params.aMm = { x: src.x, z: src.z };
          else ow.params.bMm = { x: src.x, z: src.z };
        }
        for (const ww of ctx.walls) ctx.rebuildWall(ww);
        ctx.rebuildWallPlanMesh();
      }
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.transformState.kind) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      ctx.transformState.lastPointerPx.x = ev.clientX - rect.left;
      ctx.transformState.lastPointerPx.y = ev.clientY - rect.top;

      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

      const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.cam(), 24, {
        sticky: ctx.selectPlanSnap
      });
      ctx.selectPlanSnap = snapped.kind !== "none" ? snapped : null;
      const p = snapped.kind !== "none" ? snapped.point : hitPoint;
      if (snapped.kind !== "none") {
        ctx.updateHoverCursor(ctx.worldToScreen(p, ctx.cam(), rect), snapped.kind);
      } else {
        ctx.hideHoverCursor();
      }

      if (ctx.transformState.kind === "move" && ctx.transformState.step === "pickTarget" && ctx.transformState.base) {
        const rawDelta = p.clone().sub(ctx.transformState.base);
        const delta = ev.shiftKey ? constrainMoveDelta(rawDelta) : rawDelta;
        ctx.applyMoveDelta(delta);
        ctx.setUnderlayStatus(`Move: ${Math.round(delta.x * 1000)} x ${Math.round(delta.z * 1000)} mm (click or type distance)`);
        return;
      }

      if (ctx.transformState.kind === "rotate" && ctx.transformState.step === "rotating" && ctx.transformState.pivot) {
        const pivot = ctx.transformState.pivot;
        const a0 = ctx.transformState.startPointerAngle;
        const a1 = Math.atan2(hitPoint.z - pivot.z, hitPoint.x - pivot.x);
        let d = a1 - a0;
        // normalize
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        ctx.transformState.lastAngleSign = d < 0 ? -1 : 1;
        ctx.applyRotateAngle(d);
        ctx.setUnderlayStatus(`Rotate: ${Math.round((d * 180) / Math.PI)} deg (click to finish)`);
        return;
      }
    }


    if (ctx.marquee.active) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      ctx.marquee.mode = x >= ctx.marquee.startX ? "contain" : "touch";
      if (ctx.marquee.mode === "contain") {
        ctx.marqueeEl.style.border = "1px solid rgba(92, 140, 255, 0.95)";
        ctx.marqueeEl.style.background = "rgba(92, 140, 255, 0.10)";
      } else {
        ctx.marqueeEl.style.border = "1px solid rgba(61, 220, 151, 0.95)";
        ctx.marqueeEl.style.background = "rgba(61, 220, 151, 0.10)";
      }
      const x0 = Math.min(ctx.marquee.startX, x);
      const y0 = Math.min(ctx.marquee.startY, y);
      const x1 = Math.max(ctx.marquee.startX, x);
      const y1 = Math.max(ctx.marquee.startY, y);
      ctx.marqueeEl.style.left = `${x0}px`;
      ctx.marqueeEl.style.top = `${y0}px`;
      ctx.marqueeEl.style.width = `${Math.max(0, x1 - x0)}px`;
      ctx.marqueeEl.style.height = `${Math.max(0, y1 - y0)}px`;
    }

    if (ctx.marquee.pending && !ctx.marquee.active && ctx.marquee.pointerId === ev.pointerId) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const w = Math.abs(x - ctx.marquee.startX);
      const h = Math.abs(y - ctx.marquee.startY);
      if (w >= 6 || h >= 6) {
        ctx.marquee.active = true;
        ctx.marqueeEl.style.border = "1px solid rgba(92, 140, 255, 0.95)";
        ctx.marqueeEl.style.background = "rgba(92, 140, 255, 0.10)";
        ctx.marqueeEl.style.left = `${ctx.marquee.startX}px`;
        ctx.marqueeEl.style.top = `${ctx.marquee.startY}px`;
        ctx.marqueeEl.style.width = "0px";
        ctx.marqueeEl.style.height = "0px";
        ctx.marqueeEl.style.display = "block";
      }
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "select" && ctx.underlayDragState.active && ctx.underlayDragState.pointerId === ev.pointerId) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      const dxMm = Math.round((hitPoint.x - ctx.underlayDragState.startWorld.x) * 1000);
      const dzMm = Math.round((hitPoint.z - ctx.underlayDragState.startWorld.z) * 1000);
      ctx.underlayState.offsetMm.x = ctx.underlayDragState.startOffsetMm.x + dxMm;
      ctx.underlayState.offsetMm.z = ctx.underlayDragState.startOffsetMm.z + dzMm;
      ctx.updateUnderlayTransform();
      if (ctx.underlayOffXEl) ctx.underlayOffXEl.value = String(ctx.underlayState.offsetMm.x);
      if (ctx.underlayOffZEl) ctx.underlayOffZEl.value = String(ctx.underlayState.offsetMm.z);
      if (ctx.selectedUnderlayBox) (ctx.selectedUnderlayBox as any).update?.();
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "dimension") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.dimensionState.hover = null;
        ctx.dimensionState.preview = [];
        ctx.clearToolHud();
      } else {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = ctx.pickAlignLineAt(hitPoint, mouse, rect);
        const canPick = !picked || ctx.dimensionState.picked.length === 0 || ctx.areAlignLinesParallel(ctx.dimensionState.picked[0]!, picked);
        const thick = ctx.hudLineThicknessM(rect);
        ctx.dimensionState.hover = canPick ? picked : null;
        if (ctx.dimensionState.hover) ctx.updateHudLine(ctx.hudHoverLine, ctx.dimensionState.hover.segA, ctx.dimensionState.hover.segB, thick);
        else ctx.hudHoverLine.visible = false;

        if (ctx.dimensionState.picked[0]) ctx.updateHudLine(ctx.hudPickLine1, ctx.dimensionState.picked[0].segA, ctx.dimensionState.picked[0].segB, thick);
        else ctx.hudPickLine1.visible = false;

        const lastPicked = ctx.dimensionState.picked.length > 1 ? ctx.dimensionState.picked[ctx.dimensionState.picked.length - 1] : null;
        if (lastPicked) ctx.updateHudLine(ctx.hudPickLine2, lastPicked.segA, lastPicked.segB, thick);
        else ctx.hudPickLine2.visible = false;

        ctx.dimensionState.preview =
          !picked && ctx.dimensionState.picked.length >= 2
            ? ctx.technicalDimensions.buildFromPickedLines(ctx.dimensionState.picked, hitPoint, "preview")
            : [];
      }
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && (ctx.layoutTool === "align" || ctx.layoutTool === "trim")) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.clearToolHud();
      } else {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = ctx.pickAlignLineAt(hitPoint, mouse, rect);
        const thick = ctx.hudLineThicknessM(rect);

        const now = performance.now();
        if (ctx.layoutTool === "align") {
          ctx.alignState.hover = picked;
          if (picked) ctx.updateHudLine(ctx.hudHoverLine, picked.segA, picked.segB, thick);
          else ctx.hudHoverLine.visible = false;

          if (ctx.alignState.ref) {
            ctx.updateHudLine(ctx.hudPickLine1, ctx.alignState.ref.segA, ctx.alignState.ref.segB, thick);
            ctx.hudPickLine2.visible = false;
          } else if (ctx.alignState.lastA && ctx.alignState.lastB && ctx.alignState.lastUntilMs > now) {
            ctx.updateHudLine(ctx.hudPickLine1, ctx.alignState.lastA.segA, ctx.alignState.lastA.segB, thick);
            ctx.updateHudLine(ctx.hudPickLine2, ctx.alignState.lastB.segA, ctx.alignState.lastB.segB, thick);
          } else {
            ctx.alignState.lastA = null;
            ctx.alignState.lastB = null;
            ctx.alignState.lastUntilMs = 0;
            ctx.hudPickLine1.visible = false;
            ctx.hudPickLine2.visible = false;
          }
        } else {
          ctx.trimState.hover = picked;
          if (picked) ctx.updateHudLine(ctx.hudHoverLine, picked.segA, picked.segB, thick);
          else ctx.hudHoverLine.visible = false;

          if (ctx.trimState.targetPick) ctx.updateHudLine(ctx.hudPickLine1, ctx.trimState.targetPick.segA, ctx.trimState.targetPick.segB, thick);
          else ctx.hudPickLine1.visible = false;

          if (ctx.trimState.lastTarget && ctx.trimState.lastCutter && ctx.trimState.lastUntilMs > now) {
            ctx.updateHudLine(ctx.hudPickLine1, ctx.trimState.lastTarget.segA, ctx.trimState.lastTarget.segB, thick);
            ctx.updateHudLine(ctx.hudPickLine2, ctx.trimState.lastCutter.segA, ctx.trimState.lastCutter.segB, thick);
          } else if (ctx.trimState.step === "pickCutter" && ctx.trimState.targetPick) {
            ctx.hudPickLine2.visible = false;
          } else {
            if (ctx.trimState.lastUntilMs <= now) {
              ctx.trimState.lastTarget = null;
              ctx.trimState.lastCutter = null;
              ctx.trimState.lastUntilMs = 0;
              if (!ctx.trimState.targetPick) {
                ctx.hudPickLine1.visible = false;
                ctx.hudPickLine2.visible = false;
              }
            }
          }
        }
      }
      // no return; other pointermove handling can still run (e.g. marquee box)
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.layoutTool === "measure") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.hideHoverCursor();
        ctx.clearToolHud();
        ctx.clearPreview();
        return;
      }

      const normalMode = ev.shiftKey;
      ctx.updateMeasureHoverFromPlanPoint(hitPoint, rect, normalMode);
      return;
    }

    if (ctx.mode === "layout" && ctx.viewMode === "3d" && ctx.layoutTool === "measure") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());

      const hit = ctx.pickSurfacePoint(ctx.raycaster, ctx.getLayoutMeasureMeshes3d());
      if (!hit) {
        ctx.measureState.hoverPoint = null;
        ctx.measureState.hoverSnap = "none";
        ctx.hideHoverCursor();
        ctx.clearToolHud();
        ctx.clearPreview();
        ctx.args.measureReadoutEl.textContent = ctx.measureState.firstPoint
          ? "Measure 3D: pick second point."
          : "Measure 3D: click first point.";
        return;
      }

      const snapTarget = ctx.getMeasure3DSnapTargetObject(hit.object);
      const snapped = ctx.snapPoint3D(hit.point, snapTarget ?? hit.object, ctx.cam(), rect, 32);
      let kind: MeasureState["hoverSnap"] = snapped.kind;
      let point = snapped.point.clone();
      if (!ctx.measureState.axisLock && snapped.kind === "free") {
        const axisAssist = ctx.applyMeasureAxisAssist3D(ctx.measureState.firstPoint, point, ctx.cam(), rect, 12);
        if (axisAssist) {
          point = axisAssist.point;
          kind = "axis";
        }
      }

      ctx.measureState.hoverPoint = point.clone();
      ctx.measureState.hoverSnap = kind;
      ctx.updateHoverCursor(ctx.worldToScreen(point, ctx.cam(), rect), kind);

      const thick = ctx.hudLineThicknessM(rect);
      if (kind === "axis" && ctx.measureState.firstPoint) {
        ctx.updateHudLine(ctx.hudHoverLine, ctx.measureState.firstPoint, point, thick * 1.75);
      } else {
        ctx.hudHoverLine.visible = false;
      }

      if (ctx.measureState.firstPoint) {
        const a = ctx.measureState.firstPoint.clone();
        let b = point.clone();
        if (ctx.measureState.axisLock) b = ctx.axisLockPoint3D(a, b);
        ctx.updatePreview(a, b, rect, ctx.distance3dMm(a, b));
        ctx.args.measureReadoutEl.textContent = `Measure 3D (${kind}): ${Math.round(ctx.distance3dMm(a, b))} mm`;
      } else {
        ctx.clearPreview();
        ctx.args.measureReadoutEl.textContent = `Measure 3D hover (${kind}): ${Math.round(point.x * 1000)}, ${Math.round(point.y * 1000)}, ${Math.round(point.z * 1000)}`;
      }
      ctx.setFirstPointMarker(ctx.measureState.firstPoint);
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "section" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) {
        ctx.hideHoverCursor();
        ctx.drawSnapOverlay.hide();
        return;
      }
      const resolved = ctx.resolveSectionDrawPoint(hitPoint, rect, !ev.shiftKey);
      ctx.sectionDraw.axisLocked = resolved.axisLocked;
      if (resolved.kind !== "none") {
        ctx.updateHoverCursor(ctx.worldToScreen(resolved.point, ctx.cam(), rect), resolved.kind);
        ctx.drawSnapOverlay.showWorld(resolved.point, ctx.cam(), rect, resolved.kind);
      } else {
        ctx.hideHoverCursor();
        ctx.drawSnapOverlay.hide();
      }
      ctx.sectionDraw.hoverPoint = { x: Math.round(resolved.point.x * 1000), z: Math.round(resolved.point.z * 1000) };
      ctx.updateSectionDrawPreview();
      return;
    }

    if (ctx.mode === "layout" && ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active && ctx.viewMode === "2d") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.kitchenWorktopDraw.lastPointerPx.x = ev.clientX - rect.left;
      ctx.kitchenWorktopDraw.lastPointerPx.y = ev.clientY - rect.top;
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      const activeSnap = ctx.resolveKitchenWorktopDrawSnap(hitPoint, rect);
      if (activeSnap) {
        ctx.updateHoverCursor(ctx.worldToScreen(activeSnap.point, ctx.cam(), rect), activeSnap.kind);
      } else {
        ctx.hideHoverCursor();
      }
      const source = activeSnap ? activeSnap.point : hitPoint;
      const rawPoint = { x: Math.round(source.x * 1000), z: Math.round(source.z * 1000) };
      const basePoint = ctx.kitchenWorktopDraw.points[ctx.kitchenWorktopDraw.points.length - 1] ?? null;
      ctx.kitchenWorktopDraw.hoverPoint = basePoint ? ctx.floorOrthoPoint(basePoint, rawPoint) : rawPoint;
      if (ctx.kitchenWorktopDraw.typedMm.trim().length > 0) {
        ctx.wallTypedHud.textContent = `${ctx.kitchenWorktopDraw.typedMm} mm`;
        ctx.wallTypedHud.style.left = `${ev.clientX - rect.left}px`;
        ctx.wallTypedHud.style.top = `${ev.clientY - rect.top}px`;
        ctx.wallTypedHud.style.display = "block";
      } else {
        ctx.wallTypedHud.style.display = "none";
      }
      if (ctx.kitchenWorktopDraw.points.length > 0) ctx.scheduleKitchenWorktopPreviewUpdate();
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "wall" && ctx.wallDraw.active && ctx.wallDraw.a && ctx.wallDraw.preview) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.wallDraw.lastPointerPx.x = ev.clientX - rect.left;
      ctx.wallDraw.lastPointerPx.y = ev.clientY - rect.top;
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.cam(), 14, {
        sticky: ctx.wallDrawSnap
      });
      const activeSnap = snapped.kind !== "none" ? snapped : ctx.keepStickyPlanSnap(hitPoint, ctx.wallDrawSnap, ctx.cam(), rect, 18);
      ctx.wallDrawSnap = activeSnap;
      if (activeSnap) {
        ctx.updateHoverCursor(ctx.worldToScreen(activeSnap.point, ctx.cam(), rect), activeSnap.kind);
      } else {
        ctx.hideHoverCursor();
      }

      const closeTolM = Math.max(0.03, Math.min(0.15, ctx.wallDefault.thicknessMm / 1000));
      const cs = ctx.wallDraw.chainStart;
      const rawB = activeSnap ? activeSnap.point : hitPoint;
      const closesRaw =
        !!cs && ctx.wallDraw.segments >= 2 && Math.hypot(rawB.x - cs.x, rawB.z - cs.z) <= closeTolM;
      const shouldAxisSnap = ctx.drawOrthoEnabled && !ev.shiftKey && !activeSnap && !closesRaw;
      const b0 = closesRaw && cs ? cs : rawB;
      const b = shouldAxisSnap ? ctx.snapAxisXZ(ctx.wallDraw.a, b0, true) : b0;
      ctx.wallDraw.hoverB = b.clone();
      ctx.updateWallMeshWithJustification(
        ctx.wallDraw.preview,
        ctx.wallDraw.a,
        b,
        ctx.wallDefault.thicknessMm,
        ctx.wallDefault.justification,
        ctx.wallDefault.exteriorSign
      );

      if (ctx.wallDraw.typedMm.trim().length > 0) {
        ctx.wallTypedHud.textContent = `${ctx.wallDraw.typedMm} mm`;
        ctx.wallTypedHud.style.left = `${ev.clientX - rect.left}px`;
        ctx.wallTypedHud.style.top = `${ev.clientY - rect.top}px`;
        ctx.wallTypedHud.style.display = "block";
      } else {
        ctx.wallTypedHud.style.display = "none";
      }
      return;
    }

    if (ctx.mode === "layout" && ctx.layoutTool === "wall" && ctx.viewMode === "2d") {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.wallDraw.lastPointerPx.x = ev.clientX - rect.left;
      ctx.wallDraw.lastPointerPx.y = ev.clientY - rect.top;
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());
      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      const snapped = ctx.snapPoint2D(hitPoint, rect, ctx.cam(), 14, {
        sticky: ctx.wallDrawSnap
      });
      const activeSnap = snapped.kind !== "none" ? snapped : ctx.keepStickyPlanSnap(hitPoint, ctx.wallDrawSnap, ctx.cam(), rect, 18);
      ctx.wallDrawSnap = activeSnap;
      if (activeSnap) {
        ctx.updateHoverCursor(ctx.worldToScreen(activeSnap.point, ctx.cam(), rect), activeSnap.kind);
      } else {
        ctx.hideHoverCursor();
      }
    }

    if (ctx.mode === "layout" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan" && ctx.layoutTool === "select" && !ctx.dragState.active && !ctx.windowDragState.active && !ctx.doorDragState.active && !ctx.wallEditHud.drag && !ctx.marquee.active) {
      ctx.selectPlanSnap = null;
      ctx.drawSnapOverlay.hide();
      ctx.hideHoverCursor();
    }

    if (ctx.mode === "layout" && ctx.windowDragState.active && ctx.windowInst && ctx.windowDragState.wall) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());

      const hitPoint = new THREE.Vector3();
      const customWallId = ctx.windowInst.params.wallId ?? null;
      if (customWallId) {
        const wall = ctx.walls.find((item) => item.id === customWallId) ?? null;
        if (!wall || !ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        const closest = ctx.pointOnWallAxisMm(wall, ctx.toMmPoint(hitPoint));
        const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
        ctx.windowInst.params.centerMm = closest.t * lengthMm + ctx.windowDragState.offsetMm;
      } else {
        const def = ctx.wallDefs[ctx.windowDragState.wall];
        const okWall = ctx.raycaster.ray.intersectPlane(def.plane, hitPoint);
        if (!okWall) {
          if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
        }
        const axis = def.axis === "x" ? hitPoint.x : hitPoint.z;
        ctx.windowInst.params.centerMm = axis * 1000 + ctx.windowDragState.offsetMm;
      }

      ctx.updateWindowTransform(ctx.windowInst);
      ctx.mountProps();
      return;
    }

    if (ctx.mode === "layout" && ctx.doorDragState.active && ctx.doorInst && ctx.doorDragState.wall) {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());

      const wall = ctx.walls.find((item) => item.id === ctx.doorDragState.wall) ?? null;
      const hitPoint = new THREE.Vector3();
      if (!wall || !ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;
      const closest = ctx.pointOnWallAxisMm(wall, ctx.toMmPoint(hitPoint));
      const lengthMm = Math.hypot(wall.params.bMm.x - wall.params.aMm.x, wall.params.bMm.z - wall.params.aMm.z);
      ctx.doorInst.params.centerMm = closest.t * lengthMm + ctx.doorDragState.offsetMm;

      ctx.updateDoorTransform(ctx.doorInst);
      ctx.mountProps();
      return;
    }

    if (ctx.mode === "layout" && ctx.dragState.active && ctx.dragState.id) {
      const inst = ctx.findInstance(ctx.dragState.id);
      if (!inst) return;

      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      ctx.pointerNdc.set(x, y);
      ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());

      const hitPoint = new THREE.Vector3();
      if (!ctx.raycaster.ray.intersectPlane(ctx.groundPlane, hitPoint)) return;

      const desired = new THREE.Vector3(hitPoint.x - ctx.dragState.offset.x, inst.root.position.y, hitPoint.z - ctx.dragState.offset.z);
      const desiredInRoom = ctx.applyWallConstraints(inst, desired);
      const snapped = ctx.snapPosition(inst, desiredInRoom);
      const finalPos = ctx.applyWallConstraints(inst, snapped);

      const prevPos = inst.root.position.clone();
      inst.root.position.copy(finalPos);
      ctx.autoOrientModuleToRoomWallIfSnapped(inst);
      const pushed = ctx.nudgePinnedModuleChain(inst, inst.root.position.clone().sub(prevPos));
      if (ctx.anyOverlap(inst, null) || ctx.moduleOverlapsWalls(inst) || ctx.moduleOverlapsKitchenWorktops(inst)) {
        inst.root.position.copy(ctx.dragState.lastValid);
        for (const item of pushed) {
          const neighbor = ctx.findInstance(item.id);
          if (!neighbor) continue;
          neighbor.root.position.copy(item.prev);
        }
      } else {
        if (inst.kitchenGroupId) {
          const group = ctx.S.kitchenGroups.find((item) => item.id === inst.kitchenGroupId) ?? null;
          const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
          inst.kitchenPlacement = ctx.inferKitchenPlacementBinding(inst, inst.kitchenGroupId, backOffsetMm);
        }
        for (const item of pushed) {
          const neighbor = ctx.findInstance(item.id);
          if (!neighbor?.kitchenGroupId) continue;
          const group = ctx.S.kitchenGroups.find((entry) => entry.id === neighbor.kitchenGroupId) ?? null;
          const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
          neighbor.kitchenPlacement = ctx.inferKitchenPlacementBinding(neighbor, neighbor.kitchenGroupId, backOffsetMm);
        }
        ctx.dragState.lastValid.copy(inst.root.position);
        ctx.updateLayoutPanel();
      }
      return;
    }

    if (!ctx.measureState.enabled || !ctx.cabinetGroup) return;

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    ctx.pointerNdc.set(x, y);
    ctx.raycaster.setFromCamera(ctx.pointerNdc, ctx.cam());

    const meshes = ctx.getSelectableMeshes(ctx.cabinetGroup).filter((m) => m.visible);
    const hit = ctx.pickSurfacePoint(ctx.raycaster, meshes);
    if (!hit) {
      ctx.measureState.hoverPoint = null;
      ctx.measureState.hoverSnap = "none";
      ctx.hideHoverCursor();
      ctx.args.measureReadoutEl.textContent = ctx.measureState.firstPoint
        ? "Pick second point... (no surface)"
        : "Click 2 points to measure (planar X/Z).";
      ctx.clearPreview();
      return;
    }

    const snapped = ctx.snapPointXZ(hit.point, hit.object);
    ctx.measureState.hoverPoint = snapped.point;
    ctx.measureState.hoverSnap = snapped.kind;

    ctx.updateHoverCursor(ctx.worldToScreen(snapped.point, ctx.cam(), rect), snapped.kind as any);

    // Preview line after first click
    if (ctx.measureState.firstPoint) {
      let a = ctx.measureState.firstPoint;
      let b = snapped.point;
      if (ctx.measureState.axisLock) b = ctx.axisLockXZ(a, b);
      ctx.updatePreview(a, b, rect);
      ctx.args.measureReadoutEl.textContent = `Measuring (${snapped.kind}) -> ${Math.round(ctx.planarDistanceMm(a, b))} mm`;
    } else {
      ctx.args.measureReadoutEl.textContent = `Hover (${snapped.kind}): ${ctx.formatMm(snapped.point)} -> click first point`;
      ctx.clearPreview();
    }
  });

  ctx.renderer.domElement.addEventListener("pointerup", (ev) => {
    if (ctx.viewNavigation.handlePointerUp(ev)) {
      return;
    }

    if (ctx.mode !== "layout") return;

    if (ctx.floorEdit.drag && ctx.floorEdit.drag.pointerId === ev.pointerId) {
      ctx.floorEdit.drag = null;
      ctx.renderFloorBoundaryEdit();
      ctx.mountProps();
      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (ctx.wallEditHud.drag && ctx.wallEditHud.drag.pointerId === ev.pointerId) {
      const d = ctx.wallEditHud.drag;
      ctx.wallEditHud.drag = null;
      const w = ctx.walls.find((x) => x.id === d.wallId) ?? null;
      if (w) {
        ctx.autoJoinAtMmPoint(w.params.aMm);
        ctx.autoJoinAtMmPoint(w.params.bMm);
      }
      ctx.rebuildWallPlanMesh();
      ctx.mountProps();
      ctx.commitHistory(ctx.S);
      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (ctx.underlayDragState.active && ctx.underlayDragState.pointerId === ev.pointerId) {
      ctx.underlayDragState.active = false;
      ctx.underlayDragState.pointerId = null;
      ctx.setUnderlayStatus("Underlay moved.");
      ctx.commitHistory(ctx.S);
      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (ctx.marquee.pending && ctx.marquee.pointerId === ev.pointerId && !ctx.marquee.active) {
      const wasRightClick = ev.button === 2;
      ctx.marquee.pending = false;
      ctx.marquee.pointerId = null;
      if (!ctx.marquee.hitSomething && ctx.viewMode === "2d" && ctx.layoutTool === "select") {
        ctx.setSelectedWall(null);
        ctx.setSelectedModule(null);
      }
      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      if (wasRightClick) ctx.openQuickActionMenu?.(ev.clientX, ev.clientY);
      return;
    }

    if (ctx.marquee.active) {
      ctx.marquee.active = false;
      ctx.marquee.pending = false;
      ctx.marquee.pointerId = null;
      ctx.marqueeEl.style.display = "none";

      const rect = ctx.renderer.domElement.getBoundingClientRect();
      const endX = ev.clientX - rect.left;
      const endY = ev.clientY - rect.top;
      const x0 = Math.min(ctx.marquee.startX, endX);
      const y0 = Math.min(ctx.marquee.startY, endY);
      const x1 = Math.max(ctx.marquee.startX, endX);
      const y1 = Math.max(ctx.marquee.startY, endY);
      const w = x1 - x0;
      const h = y1 - y0;

      // If it's a click-sized drag, let normal click selection handle it.
      if (w >= 6 && h >= 6 && ctx.layoutTool === "select") {
        const rectSel = { x0, y0, x1, y1 };
        const contains = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
          b.minX >= rectSel.x0 && b.maxX <= rectSel.x1 && b.minY >= rectSel.y0 && b.maxY <= rectSel.y1;
        const overlaps = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
          b.maxX >= rectSel.x0 && b.minX <= rectSel.x1 && b.maxY >= rectSel.y0 && b.minY <= rectSel.y1;

        const wallScreenPolygon = (w: WallInstance) => {
          const solved = ctx.wallSolvedOutlines.get(w.id) ?? null;
          if (solved && solved.length >= 3) {
            return solved.map((p: { x: number; z: number }) => ctx.worldToScreen(new THREE.Vector3(p.x, 0, p.z), ctx.cam(), rect));
          }
          const a = ctx.fromMmPoint(w.params.aMm);
          const b = ctx.fromMmPoint(w.params.bMm);
          const d = b.clone().sub(a);
          const len = d.length();
          if (len < 1e-8) return [ctx.worldToScreen(a, ctx.cam(), rect)];
          d.multiplyScalar(1 / len);
          const n = new THREE.Vector3(-d.z, 0, d.x);
          const halfThickness = Math.max(1, w.params.thicknessMm / 2) / 1000;
          return [
            a.clone().addScaledVector(n, halfThickness),
            a.clone().addScaledVector(n, -halfThickness),
            b.clone().addScaledVector(n, -halfThickness),
            b.clone().addScaledVector(n, halfThickness)
          ].map((p) => ctx.worldToScreen(p, ctx.cam(), rect));
        };
        const pointInRect = (p: { x: number; y: number }) => p.x >= rectSel.x0 && p.x <= rectSel.x1 && p.y >= rectSel.y0 && p.y <= rectSel.y1;
        const orientation = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
          (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const segmentIntersects = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
          const abC = orientation(a, b, c);
          const abD = orientation(a, b, d);
          const cdA = orientation(c, d, a);
          const cdB = orientation(c, d, b);
          return abC * abD <= 0 && cdA * cdB <= 0;
        };
        const polygonTouchesRect = (poly: Array<{ x: number; y: number }>) => {
          if (poly.some(pointInRect)) return true;
          const corners = [
            { x: rectSel.x0, y: rectSel.y0 },
            { x: rectSel.x1, y: rectSel.y0 },
            { x: rectSel.x1, y: rectSel.y1 },
            { x: rectSel.x0, y: rectSel.y1 }
          ];
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            for (let j = 0; j < corners.length; j++) {
              if (segmentIntersects(a, b, corners[j], corners[(j + 1) % corners.length])) return true;
            }
          }
          return false;
        };

        const instBounds = (id: string) => {
          const inst = ctx.findInstance(id);
          if (!inst) return null;
          const meshes = ctx.getInstanceGeometryMeshes(inst);
          if (meshes.length === 0) return null;
          const box = new THREE.Box3();
          for (const mesh of meshes) box.expandByObject(mesh);
          const pts = [
            new THREE.Vector3(box.min.x, 0, box.min.z),
            new THREE.Vector3(box.min.x, 0, box.max.z),
            new THREE.Vector3(box.max.x, 0, box.min.z),
            new THREE.Vector3(box.max.x, 0, box.max.z)
          ];
          const ss = pts.map((p) => ctx.worldToScreen(p, ctx.cam(), rect));
          const xs = ss.map((p) => p.x);
          const ys = ss.map((p) => p.y);
          return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
        };

        const hitWalls: string[] = [];
        for (const ww of ctx.walls) {
          if (ctx.pinnedWallIds.has(ww.id)) continue;
          if (!isPickableKey(`wall:${ww.id}`)) continue;
          const poly = wallScreenPolygon(ww);
          if (poly.length === 0) continue;
          const xs = poly.map((p: { x: number; y: number }) => p.x);
          const ys = poly.map((p: { x: number; y: number }) => p.y);
          const b = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
          const ok = overlaps(b) && polygonTouchesRect(poly);
          if (ok) hitWalls.push(ww.id);
        }

        const hitMods: string[] = [];
        for (const inst of ctx.instances) {
          if (ctx.pinnedInstanceIds.has(inst.id)) continue;
          if (ctx.kitchenMode && !ctx.kitchenMode.filterSelectableInstanceId(inst.id)) continue;
          const b = instBounds(inst.id);
          if (!b) continue;
          const ok = ctx.marquee.mode === "contain" ? contains(b) : overlaps(b);
          if (ok) hitMods.push(inst.id);
        }

        // Apply multi-selection (Shift = add).
        const nextWalls = new Set<string>(ev.shiftKey ? Array.from(ctx.selectedWallIds) : []);
        const nextMods = new Set<string>(ev.shiftKey ? Array.from(ctx.selectedInstanceIds) : []);
        for (const id of hitWalls) nextWalls.add(id);
        for (const id of hitMods) nextMods.add(id);

        // Pick primary (keep current if still selected when shift-adding).
        let primaryWall = ctx.selectedWallId && nextWalls.has(ctx.selectedWallId) ? ctx.selectedWallId : null;
        let primaryMod = ctx.selectedInstanceId && nextMods.has(ctx.selectedInstanceId) ? ctx.selectedInstanceId : null;
        if (!primaryWall && !primaryMod) {
          primaryWall = hitWalls[0] ?? null;
          primaryMod = primaryWall ? null : hitMods[0] ?? null;
        }

        // Set primary selection for handles/props, then populate sets.
        if (primaryWall) ctx.setSelectedWall(primaryWall);
        else if (primaryMod) ctx.setSelectedModule(primaryMod);
        else {
          ctx.setSelectedWall(null);
          ctx.setSelectedModule(null);
        }

        ctx.selectedWallIds.clear();
        for (const id of nextWalls) ctx.selectedWallIds.add(id);
        ctx.selectedInstanceIds.clear();
        for (const id of nextMods) ctx.selectedInstanceIds.add(id);
        ctx.updateSelectionHighlights();
        ctx.mountProps();
      }

      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    if (ctx.windowDragState.active) {
      ctx.windowDragState.active = false;
      ctx.windowDragState.wall = null;
      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }
    if (ctx.doorDragState.active) {
      ctx.doorDragState.active = false;
      ctx.doorDragState.wall = null;
      try {
        ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      return;
    }
    if (!ctx.dragState.active) return;
    ctx.dragState.active = false;
    ctx.dragState.id = null;
    try {
      ctx.renderer.domElement.releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  });
}
