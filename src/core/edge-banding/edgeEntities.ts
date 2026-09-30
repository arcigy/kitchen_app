/** Shared manufacturing/editor entity contract. IDs contain topology, never dimensions.
 * Missing binding means construction default; null explicitly removes banding. */
export type EdgePoint = { x: number; y: number; z: number };
export type EdgeBindingMap = Record<string, string | null>;
export type EdgeEntity = {
  id: string;
  partId: string;
  partLabel?: string;
  label: string;
  start: EdgePoint;
  end: EdgePoint;
  lengthMm: number;
  defaultGroupId: string | null;
};
export type EdgeEntityAdapter = { kind: "module" | "custom-board"; edges: readonly EdgeEntity[] };
export const FRONT_EDGE_GROUP = "material-assignment:edge_front";
export const BODY_EDGE_GROUP = "material-assignment:edge_other";

export function edgeGroup(edge: EdgeEntity, bindings: EdgeBindingMap): string | null {
  return Object.hasOwn(bindings, edge.id) ? bindings[edge.id]! : edge.defaultGroupId;
}
export function readEdgeBindings(value: unknown): EdgeBindingMap {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Neplatné priradenie olepenia.");
  const result: EdgeBindingMap = {};
  for (const [key, group] of Object.entries(value)) {
    if (!key || key.length > 1000 || (group !== null && (typeof group !== "string" || !group || group.length > 300))) {
      throw new Error("Neplatné priradenie olepenia.");
    }
    Object.defineProperty(result, key, { value: group, enumerable: true, writable: true, configurable: true });
  }
  return result;
}
export function bindEdges(adapter: EdgeEntityAdapter, bindings: EdgeBindingMap, ids: readonly string[], groupId: string | null): EdgeBindingMap {
  const known = new Set(adapter.edges.map(edge => edge.id));
  if (ids.some(id => !known.has(id))) throw new Error("Hrana už v tejto geometrii neexistuje.");
  const next = { ...bindings };
  for (const id of ids) next[id] = groupId;
  return next;
}
export function orphanEdgeBindings(adapter: EdgeEntityAdapter, bindings: EdgeBindingMap): string[] {
  const ids = new Set(adapter.edges.map(edge => edge.id));
  return Object.keys(bindings).filter(id => !ids.has(id));
}

/** Order the boundary by connectivity; collapse tessellation on straight edges.
 * Direction signatures protect against reusing an ordinal after topology changes. */
export function contourEdgeEntities(partId: string, segments: Array<{ a: EdgePoint; b: EdgePoint }>, mergeCollinear = true): EdgeEntity[] {
  const key = (p: EdgePoint) => [p.x, p.y, p.z].map(n => Math.round(n * 100)).join(":");
  const compare = (a: EdgePoint, b: EdgePoint) => a.x - b.x || a.y - b.y || a.z - b.z;
  const remaining = [...segments];
  const result: EdgeEntity[] = [];
  let loop = 0;
  while (remaining.length) {
    const start = remaining.flatMap(s => [s.a, s.b]).sort(compare)[0]!;
    const points = [start]; let cursor = start;
    do {
      const choices = remaining.map((s, i) => ({ i, next: key(s.a) === key(cursor) ? s.b : key(s.b) === key(cursor) ? s.a : null }))
        .filter((s): s is { i: number; next: EdgePoint } => s.next !== null).sort((a, b) => compare(a.next, b.next));
      if (!choices.length) throw new Error(`Neuzavretý obrys dielca ${partId}.`);
      const next = choices[0]!; remaining.splice(next.i, 1); cursor = next.next;
      if (key(cursor) !== key(start)) points.push(cursor);
    } while (key(cursor) !== key(start));
    let changed = mergeCollinear;
    while (changed && points.length > 3) {
      changed = false;
      for (let i = 0; i < points.length; i++) {
        const a = points[(i + points.length - 1) % points.length]!; const b = points[i]!; const c = points[(i + 1) % points.length]!;
        const u = [b.x-a.x,b.y-a.y,b.z-a.z]; const v = [c.x-b.x,c.y-b.y,c.z-b.z];
        const cross = Math.hypot(u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!);
        if (cross < .001 * Math.hypot(...u) * Math.hypot(...v) && u.reduce((s,n,j)=>s+n*v[j]!,0)>0) {
          points.splice(i, 1); changed = true; break;
        }
      }
    }
    const sign = (n: number) => Math.abs(n) < .01 ? "0" : n > 0 ? "+" : "-";
    const topology = points.map((a, i) => { const b = points[(i + 1) % points.length]!; return [b.x-a.x,b.y-a.y,b.z-a.z].map(sign).join(""); }).join("");
    points.forEach((a, i) => {
      const b = points[(i + 1) % points.length]!;
      result.push({ id: `${partId}:contour-${loop}-${topology}:${i}`, partId, label: `Hrana ${i + 1}`, start:a, end:b,
        lengthMm: Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z), defaultGroupId:null });
    });
    loop++;
  }
  return result;
}
