type Point = { x: number; y: number };
type Bounds = { min: Point; max: Point };
export type ModuleDimensionLabelBox = Point & { width: number };

/** Prefer free space around the model before moving a caption over its geometry. */
export function placeModuleDimensionLabel(args: {
  preferred: Point; width: number; viewport: { width: number; height: number };
  model?: Bounds; occupied: ModuleDimensionLabelBox[];
}): ModuleDimensionLabelBox {
  const { viewport, model, occupied } = args;
  const width = Math.min(viewport.width - 12, args.width);
  const clamp = (point: Point) => ({
    x: Math.max(width / 2 + 6, Math.min(viewport.width - width / 2 - 6, point.x)),
    y: Math.max(18, Math.min(viewport.height - 18, point.y)), width
  });
  const preferred = clamp(args.preferred);
  const xs = [preferred.x, width / 2 + 6, viewport.width - width / 2 - 6];
  const ys = [preferred.y];
  if (model) {
    xs.push(model.min.x - width / 2 - 16, model.max.x + width / 2 + 16);
    ys.push(model.min.y - 24, model.max.y + 24);
  }
  for (let y = 18; y <= viewport.height - 18; y += 32) ys.push(y);
  let best = preferred; let bestScore = Infinity;
  for (const x of xs) for (const y of ys) {
    const candidate = clamp({ x, y });
    const collisions = occupied.filter((other) => Math.abs(other.y - candidate.y) < 30 &&
      Math.abs(other.x - candidate.x) < (other.width + width) / 2 + 8).length;
    const coversModel = model && candidate.x + width / 2 + 6 > model.min.x && candidate.x - width / 2 - 6 < model.max.x &&
      candidate.y + 18 > model.min.y && candidate.y - 18 < model.max.y;
    const score = collisions * 1_000_000 + (coversModel ? 10_000 : 0) + Math.hypot(candidate.x - preferred.x, candidate.y - preferred.y);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}
