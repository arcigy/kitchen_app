export type ScreenPoint = { x: number; y: number };

export function dist2(a: ScreenPoint, b: ScreenPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distPointToSegment2(point: ScreenPoint, a: ScreenPoint, b: ScreenPoint) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom > 1e-9 ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom)) : 0;
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const dx = point.x - cx;
  const dy = point.y - cy;
  return { d2: dx * dx + dy * dy, t };
}

export function distPxPointToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const { d2 } = distPointToSegment2({ x: px, y: py }, { x: ax, y: ay }, { x: bx, y: by });
  return Math.sqrt(d2);
}
