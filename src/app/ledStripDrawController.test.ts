import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { makeAppState } from "../layout/appState";
import { createLedStripDrawController } from "./ledStripDrawController";

describe("LED strip draw controller", () => {
  it("creates a single connected custom group only after the second point and commits each added segment", () => {
    const state = makeAppState({ type: "base" } as never);
    const commitHistory = vi.fn();
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory, mountProps: vi.fn(), setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    expect(state.ledStripGroups).toEqual([]);
    controller.point(new THREE.Vector3(1, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 1));
    expect(state.ledStripGroups[0]!.runs[0]!.points).toEqual([{ x: 0, y: 900, z: 0 }, { x: 1000, y: 900, z: 0 }, { x: 1000, y: 900, z: 1000 }]);
    expect(commitHistory).toHaveBeenCalledTimes(2);
    controller.escape();
    expect(controller.state.active).toBe(false);
  });

  it("continues a custom run vertically from its latest point and keeps the group selected after Escape", () => {
    const state = makeAppState({ type: "base" } as never);
    const mountProps = vi.fn();
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory: vi.fn(), mountProps, setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    expect(mountProps).toHaveBeenCalled();
    controller.point(new THREE.Vector3(1, 0.9, 0));
    expect(controller.addVertical("up", 300)).toBe(true);
    expect(state.ledStripGroups[0]!.runs[0]!.points.at(-1)).toEqual({ x: 1000, y: 1200, z: 0 });
    controller.escape();
    expect(controller.state.selectedGroupId).toBe(state.ledStripGroups[0]!.id);
  });

  it("does not delete a group when only a vertex handle is selected", () => {
    const state = makeAppState({ type: "base" } as never);
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory: vi.fn(), mountProps: vi.fn(), setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 0));
    const group = state.ledStripGroups[0]!;
    controller.selectPick({ groupId: group.id, runId: group.runs[0]!.id, pointIndex: 0, segmentIndex: null });
    expect(controller.deleteSelection()).toBe(false);
    expect(state.ledStripGroups).toHaveLength(1);
  });

  it("moves a picked vertex or segment through the persisted LED editing domain", () => {
    const state = makeAppState({ type: "base" } as never);
    const commitHistory = vi.fn();
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory, mountProps: vi.fn(), setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 1));
    const group = state.ledStripGroups[0]!;

    const vertex = { groupId: group.id, runId: group.runs[0]!.id, pointIndex: 1, segmentIndex: null };
    expect(controller.beginPointerEdit(1, vertex, new THREE.Vector3(1, 0.9, 0))).toBe(true);
    expect(controller.updatePointerEdit(1, new THREE.Vector3(1.1, 0.9, 0))).toBe(true);
    expect(controller.finishPointerEdit(1)).toBe(true);
    expect(state.ledStripGroups[0]!.runs[0]!.points[1]).toEqual({ x: 1100, y: 900, z: 0 });

    const segment = { groupId: group.id, runId: group.runs[0]!.id, pointIndex: null, segmentIndex: 0 };
    expect(controller.beginPointerEdit(2, segment, new THREE.Vector3(0, 0.9, 0))).toBe(true);
    controller.updatePointerEdit(2, new THREE.Vector3(0, 1, 0));
    controller.finishPointerEdit(2);
    expect(state.ledStripGroups[0]!.runs[0]!.points.slice(0, 2)).toEqual([{ x: 0, y: 1000, z: 0 }, { x: 1100, y: 1000, z: 0 }]);
  });

  it("aligns a selected point or segment to an exact persisted coordinate", () => {
    const state = makeAppState({ type: "base" } as never);
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory: vi.fn(), mountProps: vi.fn(), setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 1));
    const group = state.ledStripGroups[0]!;
    controller.selectPick({ groupId: group.id, runId: group.runs[0]!.id, pointIndex: null, segmentIndex: 1 });
    expect(controller.moveSelectedTo({ x: 1200, y: 1200, z: 0 })).toBe(true);
    expect(state.ledStripGroups[0]!.runs[0]!.points.slice(1)).toEqual([{ x: 1200, y: 1200, z: 0 }, { x: 1200, y: 1200, z: 1000 }]);
  });

  it("rejects a point move that would create a zero-length saved segment", () => {
    const state = makeAppState({ type: "base" } as never);
    const controller = createLedStripDrawController({ S: state, layoutRoot: new THREE.Group(), commitHistory: vi.fn(), mountProps: vi.fn(), setStatus: vi.fn() });
    controller.startCustom();
    controller.point(new THREE.Vector3(0, 0.9, 0));
    controller.point(new THREE.Vector3(1, 0.9, 0));
    const group = state.ledStripGroups[0]!;
    controller.selectPick({ groupId: group.id, runId: group.runs[0]!.id, pointIndex: 1, segmentIndex: null });
    expect(controller.moveSelectedTo({ x: 0, y: 900, z: 0 })).toBe(false);
    expect(state.ledStripGroups[0]!.runs[0]!.points[1]).toEqual({ x: 1000, y: 900, z: 0 });
  });
});
