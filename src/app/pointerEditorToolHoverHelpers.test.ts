import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { AlignPickedLine } from "./localTypes";
import {
  hideHudLinePair,
  resetAlignTrimPointerMoveHover,
  resetAlignRecentFeedback,
  updatePickedHudLine,
  updatePickedHudLinePair,
  updateAlignToolHover,
  updateAlignTrimToolPointerMoveHover,
  updateDimensionToolHover,
  updateDimensionToolPointerMoveHover,
  resetDimensionPointerMoveHover,
  resetTrimRecentFeedback,
  updateTrimToolHover
} from "./pointerEditorToolHoverHelpers";

function line(label: string): AlignPickedLine {
  return {
    p: new THREE.Vector3(),
    dir: new THREE.Vector3(1, 0, 0),
    segA: new THREE.Vector3(0, 0, 0),
    segB: new THREE.Vector3(1, 0, 0),
    label,
    targetKind: "wall",
    lineRole: "center"
  };
}

function hudLine() {
  const mesh = new THREE.Mesh();
  mesh.visible = true;
  return mesh;
}

describe("pointer editor tool hover helpers", () => {
  it("updates picked HUD line or hides it when no line is picked", () => {
    const picked = line("picked");
    const hud = hudLine();
    const updateHudLine = vi.fn((mesh: THREE.Mesh) => {
      mesh.visible = true;
    });

    updatePickedHudLine({
      picked,
      hudLine: hud,
      hudLineThickness: 2,
      updateHudLine
    });

    expect(updateHudLine).toHaveBeenCalledWith(hud, picked.segA, picked.segB, 2);
    expect(hud.visible).toBe(true);

    updatePickedHudLine({
      picked: null,
      hudLine: hud,
      hudLineThickness: 2,
      updateHudLine
    });

    expect(updateHudLine).toHaveBeenCalledTimes(1);
    expect(hud.visible).toBe(false);
  });

  it("updates picked HUD line pair and hides missing pair entries", () => {
    const picked = line("picked");
    const pick1 = hudLine();
    const pick2 = hudLine();
    const updateHudLine = vi.fn((mesh: THREE.Mesh) => {
      mesh.visible = true;
    });

    updatePickedHudLinePair({
      first: picked,
      second: null,
      hudLine1: pick1,
      hudLine2: pick2,
      hudLineThickness: 2,
      updateHudLine
    });

    expect(updateHudLine).toHaveBeenCalledExactlyOnceWith(pick1, picked.segA, picked.segB, 2);
    expect(pick1.visible).toBe(true);
    expect(pick2.visible).toBe(false);
  });

  it("hides HUD line pair", () => {
    const pick1 = hudLine();
    const pick2 = hudLine();

    hideHudLinePair({ hudLine1: pick1, hudLine2: pick2 });

    expect(pick1.visible).toBe(false);
    expect(pick2.visible).toBe(false);
  });

  it("updates dimension hover and builds preview only when no line is picked", () => {
    const pickedA = line("a");
    const pickedB = line("b");
    const state = { hover: null, picked: [pickedA, pickedB], preview: [] as unknown[] };
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });

    updateDimensionToolHover({
      hitPoint: new THREE.Vector3(2, 0, 0),
      mouse: { x: 10, y: 20 },
      rect: {} as DOMRect,
      dimensionState: state,
      pickDimensionLineAt: () => null,
      pickAlignLineAt: () => null,
      areAlignLinesParallel: () => true,
      buildPreviewDimensions: (picked, hitPoint) => [{ picked: picked.length, x: hitPoint.x }],
      hudHoverLine: hudLine(),
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 3,
      updateHudLine
    });

    expect(state.hover).toBeNull();
    expect(state.preview).toEqual([{ picked: 2, x: 2 }]);
    expect(updateHudLine).toHaveBeenCalledTimes(2);
  });

  it("filters non-parallel dimension hover but keeps picked line HUDs", () => {
    const pickedA = line("a");
    const pickedB = line("b");
    const candidate = line("candidate");
    const state = { hover: null, picked: [pickedA, pickedB], preview: ["old"] as unknown[] };
    const hoverHud = hudLine();
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });

    updateDimensionToolHover({
      hitPoint: new THREE.Vector3(),
      mouse: { x: 0, y: 0 },
      rect: {} as DOMRect,
      dimensionState: state,
      pickDimensionLineAt: () => candidate,
      pickAlignLineAt: () => null,
      areAlignLinesParallel: () => false,
      buildPreviewDimensions: () => ["preview"],
      hudHoverLine: hoverHud,
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 3,
      updateHudLine
    });

    expect(state.hover).toBeNull();
    expect(state.preview).toEqual([]);
    expect(hoverHud.visible).toBe(false);
    expect(updateHudLine).toHaveBeenCalledTimes(2);
  });

  it("clears dimension pointermove hover state when there is no ground hit", () => {
    const pickedA = line("a");
    const state = { hover: pickedA as AlignPickedLine | null, picked: [pickedA], preview: ["preview"] as unknown[] };
    const clearToolHud = vi.fn();
    const pickAlignLineAt = vi.fn();

    updateDimensionToolPointerMoveHover({
      hitPoint: null,
      mouse: null,
      rect: {} as DOMRect,
      dimensionState: state,
      pickAlignLineAt,
      areAlignLinesParallel: vi.fn(),
      buildPreviewDimensions: vi.fn(),
      hudHoverLine: hudLine(),
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 2,
      updateHudLine: vi.fn(),
      clearToolHud
    });

    expect(state.hover).toBeNull();
    expect(state.preview).toEqual([]);
    expect(clearToolHud).toHaveBeenCalledTimes(1);
    expect(pickAlignLineAt).not.toHaveBeenCalled();
  });

  it("resets dimension pointermove hover state and clears tool HUD", () => {
    const pickedA = line("a");
    const state = { hover: pickedA as AlignPickedLine | null, preview: ["preview"] as unknown[] };
    const clearToolHud = vi.fn();

    resetDimensionPointerMoveHover({
      dimensionState: state,
      clearToolHud
    });

    expect(state.hover).toBeNull();
    expect(state.preview).toEqual([]);
    expect(clearToolHud).toHaveBeenCalledOnce();
  });

  it("routes dimension pointermove hover through dimension hover update on hit", () => {
    const pickedA = line("a");
    const candidate = line("candidate");
    const state = { hover: null as AlignPickedLine | null, picked: [pickedA], preview: [] as unknown[] };
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });
    const hitPoint = new THREE.Vector3(1, 0, 2);
    const rect = {} as DOMRect;
    const pickDimensionLineAt = vi.fn(() => candidate);

    updateDimensionToolPointerMoveHover({
      hitPoint,
      mouse: { x: 5, y: 6 },
      rect,
      dimensionState: state,
      pickDimensionLineAt,
      pickAlignLineAt: vi.fn(),
      areAlignLinesParallel: () => true,
      buildPreviewDimensions: vi.fn(),
      hudHoverLine: hudLine(),
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 2,
      updateHudLine,
      clearToolHud: vi.fn()
    });

    expect(pickDimensionLineAt).toHaveBeenCalledWith(hitPoint, { x: 5, y: 6 }, rect);
    expect(state.hover).toBe(candidate);
    expect(state.preview).toEqual([]);
    expect(updateHudLine).toHaveBeenCalledWith(expect.any(THREE.Mesh), candidate.segA, candidate.segB, 2);
    expect(updateHudLine).toHaveBeenCalledWith(expect.any(THREE.Mesh), pickedA.segA, pickedA.segB, 2);
  });

  it("shows align reference or clears expired recent align feedback", () => {
    const ref = line("ref");
    const recentA = line("recent-a");
    const recentB = line("recent-b");
    const state = { ref: null, hover: null, lastA: recentA, lastB: recentB, lastUntilMs: 5 };
    const pick1 = hudLine();
    const pick2 = hudLine();

    updateAlignToolHover({
      picked: ref,
      alignState: state,
      hudHoverLine: hudLine(),
      hudPickLine1: pick1,
      hudPickLine2: pick2,
      hudLineThickness: 2,
      now: 10,
      updateHudLine: vi.fn()
    });

    expect(state.hover).toBe(ref);
    expect(state.lastA).toBeNull();
    expect(state.lastB).toBeNull();
    expect(state.lastUntilMs).toBe(0);
    expect(pick1.visible).toBe(false);
    expect(pick2.visible).toBe(false);
  });

  it("resets align recent feedback state and hides pick HUD lines", () => {
    const recentA = line("recent-a");
    const recentB = line("recent-b");
    const state = { lastA: recentA as AlignPickedLine | null, lastB: recentB as AlignPickedLine | null, lastUntilMs: 5 };
    const pick1 = hudLine();
    const pick2 = hudLine();

    resetAlignRecentFeedback({
      alignState: state,
      hudPickLine1: pick1,
      hudPickLine2: pick2
    });

    expect(state.lastA).toBeNull();
    expect(state.lastB).toBeNull();
    expect(state.lastUntilMs).toBe(0);
    expect(pick1.visible).toBe(false);
    expect(pick2.visible).toBe(false);
  });

  it("keeps trim target HUD and hides cutter HUD while picking cutter", () => {
    const target = line("target");
    const state = {
      hover: null,
      lastCutter: null,
      lastTarget: null,
      lastUntilMs: 0,
      step: "pickCutter",
      targetPick: target
    };
    const pick1 = hudLine();
    const pick2 = hudLine();
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });

    updateTrimToolHover({
      picked: null,
      trimState: state,
      hudHoverLine: hudLine(),
      hudPickLine1: pick1,
      hudPickLine2: pick2,
      hudLineThickness: 2,
      now: 10,
      updateHudLine
    });

    expect(state.hover).toBeNull();
    expect(updateHudLine).toHaveBeenCalledWith(pick1, target.segA, target.segB, 2);
    expect(pick2.visible).toBe(false);
  });

  it("resets trim recent feedback and only hides pick HUD lines without a target pick", () => {
    const target = line("target");
    const cutter = line("cutter");
    const state = {
      lastTarget: target as AlignPickedLine | null,
      lastCutter: cutter as AlignPickedLine | null,
      lastUntilMs: 5,
      targetPick: null as AlignPickedLine | null
    };
    const pick1 = hudLine();
    const pick2 = hudLine();

    resetTrimRecentFeedback({
      trimState: state,
      hudPickLine1: pick1,
      hudPickLine2: pick2
    });

    expect(state.lastTarget).toBeNull();
    expect(state.lastCutter).toBeNull();
    expect(state.lastUntilMs).toBe(0);
    expect(pick1.visible).toBe(false);
    expect(pick2.visible).toBe(false);

    state.targetPick = target;
    pick1.visible = true;
    pick2.visible = true;

    resetTrimRecentFeedback({
      trimState: state,
      hudPickLine1: pick1,
      hudPickLine2: pick2
    });

    expect(pick1.visible).toBe(true);
    expect(pick2.visible).toBe(true);
  });

  it("clears align/trim pointermove HUD when there is no ground hit", () => {
    const clearToolHud = vi.fn();
    const pickAlignLineAt = vi.fn();

    updateAlignTrimToolPointerMoveHover({
      tool: "align",
      hitPoint: null,
      mouse: { x: 0, y: 0 },
      rect: {} as DOMRect,
      alignState: { ref: null, hover: null, lastA: null, lastB: null, lastUntilMs: 0 },
      trimState: { hover: null, lastCutter: null, lastTarget: null, lastUntilMs: 0, step: "pickTarget", targetPick: null },
      pickAlignLineAt,
      hudHoverLine: hudLine(),
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 2,
      now: 10,
      updateHudLine: vi.fn(),
      clearToolHud
    });

    expect(clearToolHud).toHaveBeenCalledTimes(1);
    expect(pickAlignLineAt).not.toHaveBeenCalled();
  });

  it("resets align/trim pointermove hover HUD", () => {
    const clearToolHud = vi.fn();

    resetAlignTrimPointerMoveHover({
      clearToolHud
    });

    expect(clearToolHud).toHaveBeenCalledOnce();
  });

  it("routes align pointermove hover through align hover update", () => {
    const picked = line("picked");
    const alignState = { ref: null, hover: null, lastA: null, lastB: null, lastUntilMs: 0 };
    const trimState = { hover: null, lastCutter: null, lastTarget: null, lastUntilMs: 0, step: "pickTarget", targetPick: null };
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });
    const hitPoint = new THREE.Vector3(1, 0, 2);
    const rect = {} as DOMRect;
    const pickAlignLineAt = vi.fn(() => picked);

    updateAlignTrimToolPointerMoveHover({
      tool: "align",
      hitPoint,
      mouse: { x: 3, y: 4 },
      rect,
      alignState,
      trimState,
      pickAlignLineAt,
      hudHoverLine: hudLine(),
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 2,
      now: 10,
      updateHudLine,
      clearToolHud: vi.fn()
    });

    expect(pickAlignLineAt).toHaveBeenCalledWith(hitPoint, { x: 3, y: 4 }, rect);
    expect(alignState.hover).toBe(picked);
    expect(trimState.hover).toBeNull();
    expect(updateHudLine).toHaveBeenCalledWith(expect.any(THREE.Mesh), picked.segA, picked.segB, 2);
  });

  it("routes trim pointermove hover through trim hover update", () => {
    const picked = line("picked");
    const target = line("target");
    const alignState = { ref: null, hover: null, lastA: null, lastB: null, lastUntilMs: 0 };
    const trimState = { hover: null, lastCutter: null, lastTarget: null, lastUntilMs: 0, step: "pickCutter", targetPick: target };
    const updateHudLine = vi.fn((hud: THREE.Mesh) => {
      hud.visible = true;
    });

    updateAlignTrimToolPointerMoveHover({
      tool: "trim",
      hitPoint: new THREE.Vector3(1, 0, 2),
      mouse: { x: 3, y: 4 },
      rect: {} as DOMRect,
      alignState,
      trimState,
      pickAlignLineAt: vi.fn(() => picked),
      hudHoverLine: hudLine(),
      hudPickLine1: hudLine(),
      hudPickLine2: hudLine(),
      hudLineThickness: 2,
      now: 10,
      updateHudLine,
      clearToolHud: vi.fn()
    });

    expect(alignState.hover).toBeNull();
    expect(trimState.hover).toBe(picked);
    expect(updateHudLine).toHaveBeenCalledWith(expect.any(THREE.Mesh), picked.segA, picked.segB, 2);
    expect(updateHudLine).toHaveBeenCalledWith(expect.any(THREE.Mesh), target.segA, target.segB, 2);
  });
});
