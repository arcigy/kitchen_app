export type DimensionDrawingPoint = { x: number; y: number };

// Edit > Dimension is the visual authority. All sizes are metres in the model;
// zoom and display DPI change their projected size without a pixel-size clamp.
export const DIMENSION_STYLE = {
  fontM: 0.09,
  lineWidthM: 0.0015,
  arrowM: 0.035,
  textNudgeM: 0.015,
  color: "#333333"
} as const;

export function drawDimensionTextWorld(
  ctx: CanvasRenderingContext2D, text: string, point: DimensionDrawingPoint,
  rawAngle: number, color: string = DIMENSION_STYLE.color
) {
  let angle = rawAngle;
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle);
  ctx.scale(1, -1);
  ctx.font = `${DIMENSION_STYLE.fontM}px serif`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(text, 0, -DIMENSION_STYLE.textNudgeM);
  const width = ctx.measureText(text).width;
  ctx.restore();
  const corners = [-width/2, width/2].flatMap(x => [DIMENSION_STYLE.textNudgeM, DIMENSION_STYLE.textNudgeM + DIMENSION_STYLE.fontM].map(y => ({
    x: point.x + x*Math.cos(angle) - y*Math.sin(angle),
    y: point.y + x*Math.sin(angle) + y*Math.cos(angle)
  })));
  return { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
    minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)) };
}

export function drawDimensionWorld(ctx: CanvasRenderingContext2D, args: {
  start: DimensionDrawingPoint; end: DimensionDrawingPoint;
  extensionStart?: DimensionDrawingPoint; extensionEnd?: DimensionDrawingPoint;
  text: string; color?: string;
}) {
  const { start, end } = args;
  const dx = end.x-start.x, dy = end.y-start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return null;
  const stroke = (a: DimensionDrawingPoint, b: DimensionDrawingPoint) => {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  const arrow = (tip: DimensionDrawingPoint, x: number, y: number) => {
    const c = Math.cos(0.55), s = Math.sin(0.55), size = DIMENSION_STYLE.arrowM;
    ctx.beginPath();
    ctx.moveTo(tip.x + (x*c-y*s)*size, tip.y + (x*s+y*c)*size);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(tip.x + (x*c+y*s)*size, tip.y + (-x*s+y*c)*size);
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = args.color ?? DIMENSION_STYLE.color;
  ctx.lineWidth = DIMENSION_STYLE.lineWidthM;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (args.extensionStart) stroke(args.extensionStart, start);
  if (args.extensionEnd) stroke(args.extensionEnd, end);
  stroke(start, end);
  arrow(start, dx/length, dy/length); arrow(end, -dx/length, -dy/length);
  const label = drawDimensionTextWorld(ctx, args.text, { x: (start.x+end.x)/2, y: (start.y+end.y)/2 }, Math.atan2(dy, dx), args.color);
  ctx.restore();
  return label;
}

/** Adapter for projected adaptive dimensions; output is the actual label hit box in CSS pixels. */
export function drawProjectedDimension(ctx: CanvasRenderingContext2D, args: {
  start: DimensionDrawingPoint; end: DimensionDrawingPoint;
  extensionStart?: DimensionDrawingPoint; extensionEnd?: DimensionDrawingPoint;
  pixelsPerMeter: number; text: string; color?: string;
}) {
  const scale = args.pixelsPerMeter;
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const toWorld = (p: DimensionDrawingPoint) => ({ x: p.x/scale, y: -p.y/scale });
  ctx.save(); ctx.scale(scale, -scale);
  const label = drawDimensionWorld(ctx, { ...args, start: toWorld(args.start), end: toWorld(args.end),
    extensionStart: args.extensionStart ? toWorld(args.extensionStart) : undefined,
    extensionEnd: args.extensionEnd ? toWorld(args.extensionEnd) : undefined });
  ctx.restore();
  if (!label) return null;
  // Padding is invisible and does not affect the model-sized drawing.
  return { x: label.minX*scale-4, y: -label.maxY*scale-4,
    width: (label.maxX-label.minX)*scale+8, height: (label.maxY-label.minY)*scale+8 };
}
