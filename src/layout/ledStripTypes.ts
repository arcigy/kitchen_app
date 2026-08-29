export type LedStripMode = "custom" | "underUpper" | "plinthJoint" | "shelfJoint";

/** A persisted LED centreline point in the editor's millimetre coordinate system. */
export type LedStripPointMm = { x: number; y: number; z: number };

export type LedStripRun = {
  id: string;
  points: LedStripPointMm[];
};

export type LedStripGroupParams = {
  name: string;
  mode: LedStripMode;
  /** The nominal height used by the group properties panel. */
  heightMm: number;
  /** Used by the under-upper placement mode; retained for all modes for round-trip fidelity. */
  offsetMm: number;
  /** Project-material assignment discriminator, not a live catalog dependency. */
  lightingComponentId: string | null;
  /** Captured profile width so an old project remains priceable after a catalog change. */
  profileWidthMm: number | null;
};

export type LedStripGroup = {
  id: string;
  params: LedStripGroupParams;
  runs: LedStripRun[];
};

const EPSILON_MM = 0.01;

export const LED_STRIP_MODES: readonly LedStripMode[] = ["custom", "underUpper", "plinthJoint", "shelfJoint"];

export function cloneLedStripGroup(group: LedStripGroup): LedStripGroup {
  return structuredClone(group);
}

export function ledStripRunLengthMm(run: LedStripRun): number {
  let length = 0;
  for (let index = 1; index < run.points.length; index += 1) {
    const previous = run.points[index - 1]!;
    const current = run.points[index]!;
    length += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
  }
  return length;
}

export function ledStripGroupLengthMm(group: LedStripGroup): number {
  return group.runs.reduce((total, run) => total + ledStripRunLengthMm(run), 0);
}

/** The requested commercial unit is square metres: centreline length × profile width. */
export function ledStripGroupAreaM2(group: LedStripGroup): number | null {
  const widthMm = group.params.profileWidthMm;
  if (widthMm == null || !Number.isFinite(widthMm) || widthMm <= 0) return null;
  return ledStripGroupLengthMm(group) * widthMm / 1_000_000;
}

export function translateLedStripGroupHeight(group: LedStripGroup, nextHeightMm: number): LedStripGroup {
  if (!Number.isFinite(nextHeightMm)) throw new Error("LED strip height must be finite.");
  const delta = nextHeightMm - group.params.heightMm;
  return {
    ...cloneLedStripGroup(group),
    params: { ...group.params, heightMm: nextHeightMm },
    runs: group.runs.map((run) => ({
      ...run,
      points: run.points.map((point) => ({ ...point, y: point.y + delta }))
    }))
  };
}

export function validateLedStripGroup(group: LedStripGroup): void {
  if (!group.id.trim()) throw new Error("LED strip group is missing id.");
  if (!group.params.name.trim()) throw new Error(`LED strip group ${group.id} is missing name.`);
  if (!LED_STRIP_MODES.includes(group.params.mode)) throw new Error(`LED strip group ${group.id} has unsupported mode.`);
  if (!Number.isFinite(group.params.heightMm) || !Number.isFinite(group.params.offsetMm)) {
    throw new Error(`LED strip group ${group.id} has non-finite properties.`);
  }
  if (group.params.profileWidthMm != null && (!Number.isFinite(group.params.profileWidthMm) || group.params.profileWidthMm <= 0)) {
    throw new Error(`LED strip group ${group.id} has invalid profile width.`);
  }
  if (group.params.mode === "custom" && group.runs.length !== 1) {
    throw new Error(`Custom LED strip group ${group.id} must have exactly one connected run.`);
  }
  const runIds = new Set<string>();
  for (const run of group.runs) {
    if (!run.id.trim() || runIds.has(run.id)) throw new Error(`LED strip group ${group.id} has duplicate or missing run id.`);
    runIds.add(run.id);
    if (run.points.length < 2) throw new Error(`LED strip run ${run.id} must have at least two points.`);
    for (const point of run.points) {
      if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`LED strip run ${run.id} has a non-finite point.`);
    }
    for (let index = 1; index < run.points.length; index += 1) {
      const previous = run.points[index - 1]!;
      const current = run.points[index]!;
      if (Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z) <= EPSILON_MM) {
        throw new Error(`LED strip run ${run.id} contains a zero-length segment.`);
      }
    }
  }
}
