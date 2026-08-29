import * as THREE from "three";
import type { PointerTransformState } from "./transformStateTypes";

export function createInitialTransformState(): PointerTransformState {
  return {
    kind: null,
    step: null,
    stickyMove: false,
    moveSnapDisabled: false,
    base: null,
    pivot: null,
    typed: "",
    lastAngleSign: 1,
    lastPointerPx: { x: 0, y: 0 },
    selectedWallIds: [],
    selectedInstanceIds: [],
    selectedSectionIds: [],
    selectedWindowIds: [],
    selectedDoorIds: [],
    startWalls: new Map(),
    startInstances: new Map(),
    startInstanceAdjacency: new Map(),
    startSections: new Map(),
    startWindows: new Map(),
    startDoors: new Map(),
    startPointerAngle: 0,
    lastValidDelta: new THREE.Vector3(0, 0, 0),
    lastValidAngle: 0
  };
}
