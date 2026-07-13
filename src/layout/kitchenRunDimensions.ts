export type KitchenRunDimensionModule = {
  id: string;
  centerMm: number;
  widthMm: number;
  minWidthMm?: number;
  maxWidthMm?: number;
};

export type KitchenRunDimensionSegment = {
  kind: "module" | "gap" | "reserved";
  startMm: number;
  endMm: number;
  valueMm: number;
  moduleId?: string;
  editable: "width" | "gap-before" | "gap-after" | "corner-arm" | null;
  cornerAxis?: "x" | "z";
};

export type KitchenRunCornerArm = {
  moduleId: string;
  axis: "x" | "z";
  lengthMm: number;
};

export type KitchenRunDimensionChain = {
  lengthMm: number;
  usableStartMm: number;
  usableEndMm: number;
  segments: KitchenRunDimensionSegment[];
};

export type KitchenRunDimensionSource = {
  id: string;
  groupId: string;
  worktopId: string;
  segmentIndex: number;
  lengthMm: number;
  worktopDepthMm: number;
  start: { x: number; z: number };
  end: { x: number; z: number };
  frontNormal: { x: number; z: number };
  worktopEdgeStart?: { x: number; z: number };
  worktopEdgeEnd?: { x: number; z: number };
  worktopEdgeLengthMm?: number;
  reservedStartMm: number;
  reservedEndMm: number;
  reservedStartArm?: KitchenRunCornerArm;
  reservedEndArm?: KitchenRunCornerArm;
  modules: KitchenRunDimensionModule[];
};

export type KitchenRunReflowResult =
  | {
      ok: true;
      selectedWidthMm: number;
      selectedCenterMm: number;
      clamped: boolean;
      centersMm: Map<string, number>;
    }
  | { ok: false; reason: "missing-module" | "run-too-small" | "invalid-value" };

const EPSILON_MM = 0.01;

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizedModules = (modules: readonly KitchenRunDimensionModule[]) =>
  modules
    .map((module) => ({
      ...module,
      centerMm: finite(module.centerMm),
      widthMm: Math.max(1, finite(module.widthMm, 1))
    }))
    .sort((a, b) => a.centerMm - b.centerMm || a.id.localeCompare(b.id));

export function resolveKitchenRunDimensionChain(args: {
  lengthMm: number;
  reservedStartMm?: number;
  reservedEndMm?: number;
  modules: readonly KitchenRunDimensionModule[];
  selectedModuleIds?: readonly string[];
  reservedStartArm?: KitchenRunCornerArm;
  reservedEndArm?: KitchenRunCornerArm;
}): KitchenRunDimensionChain {
  const lengthMm = Math.max(0, finite(args.lengthMm));
  const reservedStartMm = clamp(Math.max(0, finite(args.reservedStartMm ?? 0)), 0, lengthMm);
  const reservedEndMm = clamp(Math.max(0, finite(args.reservedEndMm ?? 0)), 0, Math.max(0, lengthMm - reservedStartMm));
  const usableStartMm = reservedStartMm;
  const usableEndMm = Math.max(usableStartMm, lengthMm - reservedEndMm);
  const modules = normalizedModules(args.modules).filter((module) => {
    const start = module.centerMm - module.widthMm / 2;
    const end = module.centerMm + module.widthMm / 2;
    return end > usableStartMm + EPSILON_MM && start < usableEndMm - EPSILON_MM;
  });
  const selectedIds = [...new Set(args.selectedModuleIds ?? [])];
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0]! : null;
  const widthEditable = (moduleId: string) =>
    selectedIds.length === 0 || (singleSelectedId != null && singleSelectedId === moduleId);

  const segments: KitchenRunDimensionSegment[] = [];
  const push = (
    kind: KitchenRunDimensionSegment["kind"],
    startMm: number,
    endMm: number,
    moduleId?: string,
    editable: KitchenRunDimensionSegment["editable"] = null,
    cornerAxis?: "x" | "z"
  ) => {
    const start = clamp(startMm, 0, lengthMm);
    const end = clamp(endMm, start, lengthMm);
    if (end - start <= EPSILON_MM) return;
    segments.push({ kind, startMm: start, endMm: end, valueMm: end - start, moduleId, editable, cornerAxis });
  };

  const armEditable = (arm?: KitchenRunCornerArm) => !!arm && (
    selectedIds.length === 0 || (singleSelectedId != null && singleSelectedId === arm.moduleId)
  );
  push(
    "reserved",
    0,
    usableStartMm,
    args.reservedStartArm?.moduleId,
    armEditable(args.reservedStartArm) ? "corner-arm" : null,
    args.reservedStartArm?.axis
  );
  let cursor = usableStartMm;
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index]!;
    const moduleStart = clamp(module.centerMm - module.widthMm / 2, usableStartMm, usableEndMm);
    const moduleEnd = clamp(module.centerMm + module.widthMm / 2, moduleStart, usableEndMm);
    if (moduleStart > cursor + EPSILON_MM) {
      const previous = modules[index - 1] ?? null;
      const editable = singleSelectedId === module.id
        ? "gap-before"
        : previous?.id === singleSelectedId
          ? "gap-after"
          : null;
      const editableModuleId = editable === "gap-before" ? module.id : editable === "gap-after" ? previous?.id : undefined;
      push("gap", cursor, moduleStart, editableModuleId, editable);
    }
    push("module", moduleStart, moduleEnd, module.id, widthEditable(module.id) ? "width" : null);
    cursor = Math.max(cursor, moduleEnd);
  }
  if (cursor < usableEndMm - EPSILON_MM) {
    const previous = modules[modules.length - 1] ?? null;
    push("gap", cursor, usableEndMm, previous?.id === singleSelectedId ? previous.id : undefined, previous?.id === singleSelectedId ? "gap-after" : null);
  }
  push(
    "reserved",
    usableEndMm,
    lengthMm,
    args.reservedEndArm?.moduleId,
    armEditable(args.reservedEndArm) ? "corner-arm" : null,
    args.reservedEndArm?.axis
  );

  return { lengthMm, usableStartMm, usableEndMm, segments };
}

export function reflowKitchenRunModules(args: {
  lengthMm: number;
  reservedStartMm?: number;
  reservedEndMm?: number;
  modules: readonly KitchenRunDimensionModule[];
  selectedModuleId: string;
  requestedWidthMm?: number;
  requestedCenterMm?: number;
}): KitchenRunReflowResult {
  const lengthMm = Math.max(0, finite(args.lengthMm));
  const usableStartMm = clamp(Math.max(0, finite(args.reservedStartMm ?? 0)), 0, lengthMm);
  const usableEndMm = clamp(lengthMm - Math.max(0, finite(args.reservedEndMm ?? 0)), usableStartMm, lengthMm);
  const modules = normalizedModules(args.modules);
  const selectedIndex = modules.findIndex((module) => module.id === args.selectedModuleId);
  if (selectedIndex < 0) return { ok: false, reason: "missing-module" };
  const selected = modules[selectedIndex]!;
  const requestedWidthMm = args.requestedWidthMm ?? selected.widthMm;
  const requestedCenterMm = args.requestedCenterMm ?? selected.centerMm;
  if (!Number.isFinite(requestedWidthMm) || !Number.isFinite(requestedCenterMm) || requestedWidthMm <= 0) {
    return { ok: false, reason: "invalid-value" };
  }

  const availableMm = usableEndMm - usableStartMm;
  const otherWidthMm = modules.reduce((sum, module, index) => index === selectedIndex ? sum : sum + module.widthMm, 0);
  const maximumByRunMm = availableMm - otherWidthMm;
  const minimumMm = Math.max(1, finite(selected.minWidthMm ?? 1, 1));
  const maximumMm = Math.max(minimumMm, Math.min(finite(selected.maxWidthMm ?? maximumByRunMm, maximumByRunMm), maximumByRunMm));
  if (maximumByRunMm + EPSILON_MM < minimumMm) return { ok: false, reason: "run-too-small" };
  const selectedWidthMm = clamp(requestedWidthMm, minimumMm, maximumMm);
  modules[selectedIndex] = { ...selected, widthMm: selectedWidthMm };

  const leftWidthMm = modules.slice(0, selectedIndex).reduce((sum, module) => sum + module.widthMm, 0);
  const rightWidthMm = modules.slice(selectedIndex + 1).reduce((sum, module) => sum + module.widthMm, 0);
  const minimumSelectedCenterMm = usableStartMm + leftWidthMm + selectedWidthMm / 2;
  const maximumSelectedCenterMm = usableEndMm - rightWidthMm - selectedWidthMm / 2;
  if (minimumSelectedCenterMm > maximumSelectedCenterMm + EPSILON_MM) return { ok: false, reason: "run-too-small" };
  const selectedCenterMm = clamp(requestedCenterMm, minimumSelectedCenterMm, maximumSelectedCenterMm);
  const centersMm = new Map<string, number>([[selected.id, selectedCenterMm]]);

  let previousRightMm = usableStartMm;
  for (let index = 0; index < selectedIndex; index += 1) {
    const module = modules[index]!;
    const remainingWidthMm = modules.slice(index + 1, selectedIndex).reduce((sum, item) => sum + item.widthMm, 0);
    const minCenterMm = previousRightMm + module.widthMm / 2;
    const maxCenterMm = selectedCenterMm - selectedWidthMm / 2 - remainingWidthMm - module.widthMm / 2;
    const centerMm = clamp(module.centerMm, minCenterMm, maxCenterMm);
    centersMm.set(module.id, centerMm);
    previousRightMm = centerMm + module.widthMm / 2;
  }

  let nextLeftMm = usableEndMm;
  for (let index = modules.length - 1; index > selectedIndex; index -= 1) {
    const module = modules[index]!;
    const remainingWidthMm = modules.slice(selectedIndex + 1, index).reduce((sum, item) => sum + item.widthMm, 0);
    const minCenterMm = selectedCenterMm + selectedWidthMm / 2 + remainingWidthMm + module.widthMm / 2;
    const maxCenterMm = nextLeftMm - module.widthMm / 2;
    const centerMm = clamp(module.centerMm, minCenterMm, maxCenterMm);
    centersMm.set(module.id, centerMm);
    nextLeftMm = centerMm - module.widthMm / 2;
  }

  const clamped = Math.abs(selectedWidthMm - requestedWidthMm) > EPSILON_MM || Math.abs(selectedCenterMm - requestedCenterMm) > EPSILON_MM;
  return { ok: true, selectedWidthMm, selectedCenterMm, clamped, centersMm };
}

export function requestedKitchenRunCenterForGap(args: {
  side: "before" | "after";
  gapMm: number;
  selectedModuleId: string;
  lengthMm: number;
  reservedStartMm?: number;
  reservedEndMm?: number;
  modules: readonly KitchenRunDimensionModule[];
}) {
  if (!Number.isFinite(args.gapMm) || args.gapMm < 0) return null;
  const modules = normalizedModules(args.modules);
  const index = modules.findIndex((module) => module.id === args.selectedModuleId);
  if (index < 0) return null;
  const selected = modules[index]!;
  const usableStartMm = Math.max(0, finite(args.reservedStartMm ?? 0));
  const usableEndMm = Math.max(usableStartMm, finite(args.lengthMm) - Math.max(0, finite(args.reservedEndMm ?? 0)));
  if (args.side === "before") {
    const previous = modules[index - 1] ?? null;
    const referenceMm = previous ? previous.centerMm + previous.widthMm / 2 : usableStartMm;
    return referenceMm + args.gapMm + selected.widthMm / 2;
  }
  const next = modules[index + 1] ?? null;
  const referenceMm = next ? next.centerMm - next.widthMm / 2 : usableEndMm;
  return referenceMm - args.gapMm - selected.widthMm / 2;
}
