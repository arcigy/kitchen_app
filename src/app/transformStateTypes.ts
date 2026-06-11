import type * as THREE from "three";
import type { DoorParams, SectionInstance, WallParams, WindowParams } from "./localTypes";

export type TransformKind = "move" | "rotate";

export type TransformStep = "selectElements" | "pickBase" | "pickTarget" | "pickPivot" | "rotating";

export type TransformClearOptions = {
  restore?: boolean;
  status?: string | null;
  continueMove?: boolean;
};

export type StartTransformOptions = {
  sticky?: boolean;
  toggle?: boolean;
};

export type TransformState = {
  kind: null | TransformKind;
  step: null | TransformStep;
  stickyMove: boolean;
  moveSnapDisabled: boolean;
  base: THREE.Vector3 | null;
  pivot: THREE.Vector3 | null;
  typed: string;
  lastAngleSign: number;
  selectedWallIds: string[];
  selectedInstanceIds: string[];
  selectedSectionIds: string[];
  selectedWindowIds: string[];
  selectedDoorIds: string[];
  startWalls: Map<string, WallParams>;
  startInstances: Map<string, { pos: THREE.Vector3; rotY: number }>;
  startInstanceAdjacency: Map<string, string | null>;
  startSections: Map<string, SectionInstance["params"]>;
  startWindows: Map<string, WindowParams>;
  startDoors: Map<string, DoorParams>;
  startPointerAngle: number;
  lastValidDelta: THREE.Vector3;
  lastValidAngle: number;
};
