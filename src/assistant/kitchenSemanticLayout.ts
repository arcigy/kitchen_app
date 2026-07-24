export type SemanticKitchenShape = "straight" | "L" | "U";
export type SemanticKitchenTurn = "left" | "right";

export type SemanticKitchenLayout = {
  shape: SemanticKitchenShape;
  originMm?: { x: number; z: number };
  orientationDeg?: 0 | 90 | 180 | 270;
  runsMm: number[];
  turns?: SemanticKitchenTurn[];
};

export type KitchenRunOccupant = {
  id: string;
  centerMm: number;
  widthMm: number;
};

export type KitchenPlacementAnchor = "auto" | "start" | "center" | "end";

export type KitchenRunPlacementRequest = {
  widthMm: number;
  anchor?: KitchenPlacementAnchor;
  offsetAlongMm?: number;
  gapMm?: number;
};

export type KitchenRunPlacementResult =
  | { ok: true; centerMm: number }
  | { ok: false; reason: "invalid-width" | "invalid-run" | "no-space" | "overlap" };

const EPSILON_MM = 0.01;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeRightAngle = (value: number | undefined) => {
  const normalized = ((value ?? 0) % 360 + 360) % 360;
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new Error("orientationDeg must be one of 0, 90, 180 or 270.");
  }
  return normalized;
};

const rotateQuarter = (direction: { x: number; z: number }, turn: SemanticKitchenTurn) =>
  turn === "left"
    ? { x: -direction.z, z: direction.x }
    : { x: direction.z, z: -direction.x };

export function requiredTurnCount(shape: SemanticKitchenShape) {
  if (shape === "straight") return 0;
  if (shape === "L") return 1;
  return 2;
}

export function validateSemanticKitchenLayout(layout: SemanticKitchenLayout): string[] {
  const errors: string[] = [];
  const runCount = requiredTurnCount(layout.shape) + 1;
  if (layout.runsMm.length !== runCount) {
    errors.push(`${layout.shape} layout requires exactly ${runCount} run length${runCount === 1 ? "" : "s"}.`);
  }
  layout.runsMm.forEach((run, index) => {
    if (!isFiniteNumber(run) || run < 300 || run > 30_000) {
      errors.push(`runsMm[${index}] must be between 300 and 30000 mm.`);
    }
  });
  const turns = layout.turns ?? [];
  if (turns.length !== requiredTurnCount(layout.shape)) {
    errors.push(`${layout.shape} layout requires exactly ${requiredTurnCount(layout.shape)} turn value${requiredTurnCount(layout.shape) === 1 ? "" : "s"}.`);
  }
  if (layout.originMm && (!isFiniteNumber(layout.originMm.x) || !isFiniteNumber(layout.originMm.z))) {
    errors.push("originMm must contain finite x and z values.");
  }
  try {
    normalizeRightAngle(layout.orientationDeg);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

export function buildSemanticKitchenPath(layout: SemanticKitchenLayout) {
  const errors = validateSemanticKitchenLayout(layout);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const origin = layout.originMm ?? { x: 0, z: 0 };
  const angleRad = normalizeRightAngle(layout.orientationDeg) * Math.PI / 180;
  let direction = { x: Math.cos(angleRad), z: Math.sin(angleRad) };
  let point = { x: Math.round(origin.x), z: Math.round(origin.z) };
  const path = [{ ...point }];
  const turns = layout.turns ?? [];

  for (let index = 0; index < layout.runsMm.length; index += 1) {
    point = {
      x: Math.round(point.x + direction.x * layout.runsMm[index]!),
      z: Math.round(point.z + direction.z * layout.runsMm[index]!)
    };
    path.push(point);
    const turn = turns[index];
    if (turn) direction = rotateQuarter(direction, turn);
  }
  return path;
}

const normalizedOccupants = (occupants: readonly KitchenRunOccupant[]) =>
  occupants
    .filter((item) => isFiniteNumber(item.centerMm) && isFiniteNumber(item.widthMm) && item.widthMm > 0)
    .map((item) => ({
      ...item,
      startMm: item.centerMm - item.widthMm / 2,
      endMm: item.centerMm + item.widthMm / 2
    }))
    .sort((a, b) => a.startMm - b.startMm || a.id.localeCompare(b.id));

export function placeOnKitchenRun(args: {
  runLengthMm: number;
  reservedStartMm?: number;
  reservedEndMm?: number;
  occupants: readonly KitchenRunOccupant[];
  request: KitchenRunPlacementRequest;
}): KitchenRunPlacementResult {
  const widthMm = args.request.widthMm;
  const runLengthMm = args.runLengthMm;
  const reservedStartMm = Math.max(0, args.reservedStartMm ?? 0);
  const reservedEndMm = Math.max(0, args.reservedEndMm ?? 0);
  if (!isFiniteNumber(widthMm) || widthMm <= 0) return { ok: false, reason: "invalid-width" };
  if (!isFiniteNumber(runLengthMm) || runLengthMm <= 0) return { ok: false, reason: "invalid-run" };

  const usableStartMm = reservedStartMm;
  const usableEndMm = runLengthMm - reservedEndMm;
  if (usableEndMm - usableStartMm + EPSILON_MM < widthMm) return { ok: false, reason: "no-space" };
  const gapMm = Math.max(0, args.request.gapMm ?? 0);
  const occupants = normalizedOccupants(args.occupants);
  const fitsAt = (centerMm: number) => {
    const startMm = centerMm - widthMm / 2;
    const endMm = centerMm + widthMm / 2;
    if (startMm < usableStartMm - EPSILON_MM || endMm > usableEndMm + EPSILON_MM) return false;
    return occupants.every((item) => endMm <= item.startMm - gapMm + EPSILON_MM || startMm >= item.endMm + gapMm - EPSILON_MM);
  };

  if (isFiniteNumber(args.request.offsetAlongMm)) {
    return fitsAt(args.request.offsetAlongMm)
      ? { ok: true, centerMm: args.request.offsetAlongMm }
      : { ok: false, reason: "overlap" };
  }

  const anchor = args.request.anchor ?? "auto";
  if (anchor === "center") {
    const centerMm = (usableStartMm + usableEndMm) / 2;
    return fitsAt(centerMm) ? { ok: true, centerMm } : { ok: false, reason: "overlap" };
  }

  if (anchor === "end") {
    let cursorMm = usableEndMm;
    for (let index = occupants.length - 1; index >= 0; index -= 1) {
      const item = occupants[index]!;
      const centerMm = cursorMm - widthMm / 2;
      if (centerMm + widthMm / 2 <= item.startMm - gapMm + EPSILON_MM && fitsAt(centerMm)) {
        return { ok: true, centerMm };
      }
      cursorMm = Math.min(cursorMm, item.startMm - gapMm);
    }
    const centerMm = cursorMm - widthMm / 2;
    return fitsAt(centerMm) ? { ok: true, centerMm } : { ok: false, reason: "no-space" };
  }

  let cursorMm = usableStartMm;
  for (const item of occupants) {
    const centerMm = cursorMm + widthMm / 2;
    if (centerMm + widthMm / 2 <= item.startMm - gapMm + EPSILON_MM && fitsAt(centerMm)) {
      return { ok: true, centerMm };
    }
    cursorMm = Math.max(cursorMm, item.endMm + gapMm);
  }
  const centerMm = cursorMm + widthMm / 2;
  return fitsAt(centerMm) ? { ok: true, centerMm } : { ok: false, reason: "no-space" };
}

export function inspectKitchenRunOverlaps(occupants: readonly KitchenRunOccupant[]) {
  const normalized = normalizedOccupants(occupants);
  const overlaps: Array<{ firstId: string; secondId: string; overlapMm: number }> = [];
  for (let index = 1; index < normalized.length; index += 1) {
    const first = normalized[index - 1]!;
    const second = normalized[index]!;
    const overlapMm = first.endMm - second.startMm;
    if (overlapMm > EPSILON_MM) overlaps.push({ firstId: first.id, secondId: second.id, overlapMm });
  }
  return overlaps;
}
