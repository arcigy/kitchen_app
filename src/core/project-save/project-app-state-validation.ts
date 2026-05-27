function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function idOf(value: Record<string, unknown>): string | null {
  return typeof value.id === "string" && value.id.trim() ? value.id : null;
}

function requireUniqueIds(items: Record<string, unknown>[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const id = idOf(item);
    if (!id) throw new Error(`Project save ${label} item is missing id.`);
    if (ids.has(id)) throw new Error(`Project save ${label} contains duplicate id ${id}.`);
    ids.add(id);
  }
  return ids;
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Project save ${path} must be a finite number.`);
  return value;
}

function pointMm(value: unknown, path: string): { x: number; z: number } {
  if (!isObject(value)) throw new Error(`Project save ${path} must be a point.`);
  return {
    x: numberAt(value.x, `${path}.x`),
    z: numberAt(value.z, `${path}.z`)
  };
}

function paramsOf(item: Record<string, unknown>, label: string): Record<string, unknown> {
  if (!isObject(item.params)) throw new Error(`Project save ${label} ${idOf(item) ?? "?"} is missing params.`);
  return item.params;
}

function validateWalls(walls: Record<string, unknown>[]): Map<string, { lengthMm: number }> {
  const out = new Map<string, { lengthMm: number }>();
  for (const wall of walls) {
    const id = idOf(wall);
    const params = paramsOf(wall, "wall");
    const a = pointMm(params.aMm, `wall ${id}.params.aMm`);
    const b = pointMm(params.bMm, `wall ${id}.params.bMm`);
    const lengthMm = Math.hypot(b.x - a.x, b.z - a.z);
    if (lengthMm < 1) throw new Error(`Project save wall ${id} has zero length.`);
    numberAt(params.thicknessMm, `wall ${id}.params.thicknessMm`);
    numberAt(params.heightMm, `wall ${id}.params.heightMm`);
    out.set(id!, { lengthMm });
  }
  return out;
}

function validateOpenings(
  openings: Record<string, unknown>[],
  label: "window" | "door",
  wallInfo: Map<string, { lengthMm: number }>
): void {
  for (const opening of openings) {
    const id = idOf(opening);
    const params = paramsOf(opening, label);
    const wallId = typeof params.wallId === "string" && params.wallId.trim() ? params.wallId : null;
    if (wallId) {
      const wall = wallInfo.get(wallId);
      if (!wall) throw new Error(`Project save ${label} ${id} references missing wall ${wallId}.`);
      const centerMm = numberAt(params.centerMm, `${label} ${id}.params.centerMm`);
      const widthMm = numberAt(params.widthMm, `${label} ${id}.params.widthMm`);
      if (widthMm <= 0) throw new Error(`Project save ${label} ${id} width must be positive.`);
      const half = widthMm / 2;
      if (centerMm - half < -1 || centerMm + half > wall.lengthMm + 1) {
        throw new Error(`Project save ${label} ${id} does not fit inside wall ${wallId}.`);
      }
    }
  }
}

export function validateProjectAppState(appState: unknown): void {
  if (!isObject(appState)) throw new Error("Project save appState must be an object.");
  const layout = appState.layout;
  if (!isObject(layout)) throw new Error("Project save appState.layout must be an object.");
  const snapshot = isObject(layout.snapshot) ? layout.snapshot : null;
  const kitchen = isObject(appState.kitchen) ? appState.kitchen : null;

  const windows = asArray(layout.windows);
  const doors = asArray(layout.doors);
  requireUniqueIds(windows, "windows");
  requireUniqueIds(doors, "doors");

  if (!snapshot) return;

  const walls = asArray(snapshot.walls);
  const floors = asArray(snapshot.floors);
  const columns = asArray(snapshot.columns);
  const sections = asArray(snapshot.sections);
  const worktops = asArray(snapshot.worktops);
  const instances = asArray(snapshot.instances);
  const modules = asArray(appState.modules);

  requireUniqueIds(walls, "walls");
  requireUniqueIds(floors, "floors");
  requireUniqueIds(columns, "columns");
  requireUniqueIds(sections, "sections");
  const worktopIds = requireUniqueIds(worktops, "worktops");
  const instanceIds = requireUniqueIds(instances, "instances");
  const wallInfo = validateWalls(walls);
  validateOpenings(windows, "window", wallInfo);
  validateOpenings(doors, "door", wallInfo);

  const moduleIds = new Set<string>();
  for (const module of modules) {
    const id = idOf(module);
    if (!id) continue;
    if (moduleIds.has(id)) throw new Error(`Project save modules contains duplicate id ${id}.`);
    moduleIds.add(id);
  }
  if (moduleIds.size && instances.length) {
    for (const id of instanceIds) {
      if (!moduleIds.has(id)) throw new Error(`Project save module list is missing layout instance ${id}.`);
    }
  }

  const groupIds = new Set<string>();
  for (const group of asArray(kitchen?.groups)) {
    const id = idOf(group);
    if (!id) throw new Error("Project save kitchen group is missing id.");
    if (groupIds.has(id)) throw new Error(`Project save kitchen groups contains duplicate id ${id}.`);
    groupIds.add(id);
    const ids = Array.isArray(group.instanceIds) ? group.instanceIds : [];
    for (const instanceId of ids) {
      if (typeof instanceId === "string" && !instanceIds.has(instanceId)) {
        throw new Error(`Project save kitchen group ${id} references missing instance ${instanceId}.`);
      }
    }
  }

  for (const worktop of worktops) {
    const kitchenGroupId = typeof worktop.kitchenGroupId === "string" ? worktop.kitchenGroupId : null;
    if (kitchenGroupId && groupIds.size && !groupIds.has(kitchenGroupId)) {
      throw new Error(`Project save worktop ${idOf(worktop)} references missing kitchen group ${kitchenGroupId}.`);
    }
  }

  for (const instance of instances) {
    const id = idOf(instance);
    const kitchenGroupId = typeof instance.kitchenGroupId === "string" ? instance.kitchenGroupId : null;
    if (kitchenGroupId && groupIds.size && !groupIds.has(kitchenGroupId)) {
      throw new Error(`Project save instance ${id} references missing kitchen group ${kitchenGroupId}.`);
    }
    const placement = isObject(instance.kitchenPlacement) ? instance.kitchenPlacement : null;
    const worktopId = typeof placement?.worktopId === "string" ? placement.worktopId : null;
    if (worktopId && worktopIds.size && !worktopIds.has(worktopId)) {
      throw new Error(`Project save instance ${id} references missing worktop ${worktopId}.`);
    }
  }
}
