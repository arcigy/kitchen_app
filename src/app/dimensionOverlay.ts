import * as THREE from "three";

export type DimensionPoint = { x: number; y: number };
export type DimensionOffsetDirection = "bottom" | "top" | "left" | "right";

type DimensionDescriptor = {
  start: DimensionPoint;
  end: DimensionPoint;
  offsetDirection: DimensionOffsetDirection;
};

type DimensionLineData = {
  start: DimensionPoint;
  end: DimensionPoint;
  selected?: boolean;
  pointRadius?: number;
};

export class DimensionOverlay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  canvasWidth = 1;
  canvasHeight = 1;
  cameraZoom = 1;
  cameraOffset = { x: 0, y: 0 };
  dimensions: DimensionDescriptor[] = [];
  unitScale = 1;

  constructor(renderer: THREE.WebGLRenderer, _camera?: THREE.Camera) {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("DimensionOverlay requires a 2D canvas context.");
    this.ctx = ctx;

    const parent = renderer.domElement.parentElement;
    if (!parent) throw new Error("Renderer canvas must have a parent before creating DimensionOverlay.");
    if (!parent.style.position) parent.style.position = "relative";

    const rect = renderer.domElement.getBoundingClientRect();
    this.canvasWidth = Math.max(1, Math.round(rect.width || parent.clientWidth || 1));
    this.canvasHeight = Math.max(1, Math.round(rect.height || parent.clientHeight || 1));
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.zIndex = "10";
    parent.appendChild(this.canvas);
  }

  setSize(width: number, height: number) {
    this.canvasWidth = Math.max(1, Math.round(width));
    this.canvasHeight = Math.max(1, Math.round(height));
    if (this.canvas.width !== this.canvasWidth) this.canvas.width = this.canvasWidth;
    if (this.canvas.height !== this.canvasHeight) this.canvas.height = this.canvasHeight;
  }

  setVisible(visible: boolean) {
    this.canvas.style.display = visible ? "" : "none";
  }

  syncCamera(zoom: number, offsetX: number, offsetY: number) {
    this.cameraZoom = Math.max(1e-6, Math.abs(zoom));
    this.cameraOffset.x = offsetX;
    this.cameraOffset.y = offsetY;
  }

  addDimension(startWorld: DimensionPoint, endWorld: DimensionPoint, offsetDirection: DimensionOffsetDirection) {
    this.dimensions.push({
      start: { x: startWorld.x, y: startWorld.y },
      end: { x: endWorld.x, y: endWorld.y },
      offsetDirection
    });
  }

  clearDimensions() {
    this.dimensions = [];
  }

  worldToScreen(world: DimensionPoint) {
    return {
      x: world.x * this.cameraZoom + this.cameraOffset.x * this.cameraZoom + this.canvasWidth / 2,
      y: this.canvasHeight - (world.y * this.cameraZoom - this.cameraOffset.y * this.cameraZoom + this.canvasHeight / 2)
    };
  }

  updateLines() {
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(0, this.canvas.height);
    ctx.scale(1, -1);
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(this.cameraZoom, this.cameraZoom);
    ctx.translate(this.cameraOffset.x, -this.cameraOffset.y);

    const clearW = this.canvasWidth / this.cameraZoom;
    const clearH = this.canvasHeight / this.cameraZoom;
    ctx.clearRect(
      -clearW / 2 - this.cameraOffset.x,
      -clearH / 2 + this.cameraOffset.y,
      clearW,
      clearH
    );

    for (const dimension of this.dimensions) {
      this.drawSize(dimension.start, dimension.end, dimension.offsetDirection);
    }

    ctx.restore();
  }

  drawSize(startPoint: DimensionPoint, endPoint: DimensionPoint, offsetDir: DimensionOffsetDirection) {
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return;

    const dir = { x: dx / length, y: dy / length };
    const offset = this.offsetVector(offsetDir);
    const s = 50 / this.cameraZoom;
    const offsetStart = { x: startPoint.x + offset.x * s, y: startPoint.y + offset.y * s };
    const offsetEnd = { x: endPoint.x + offset.x * s, y: endPoint.y + offset.y * s };

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#333333";
    ctx.fillStyle = "#333333";
    ctx.lineWidth = 0.6 / this.cameraZoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.strokeSegment(startPoint, offsetStart);
    this.strokeSegment(endPoint, offsetEnd);
    this.strokeSegment(offsetStart, offsetEnd);
    this.drawArrowTip(offsetStart, dir);
    this.drawArrowTip(offsetEnd, { x: -dir.x, y: -dir.y });

    const midpoint = {
      x: (offsetStart.x + offsetEnd.x) / 2,
      y: (offsetStart.y + offsetEnd.y) / 2
    };
    const startScreen = this.worldToScreen(offsetStart);
    const endScreen = this.worldToScreen(offsetEnd);
    const screenLength = Math.hypot(endScreen.x - startScreen.x, endScreen.y - startScreen.y);
    const text = String(Math.round(length * this.unitScale));
    if (screenLength >= Math.max(42, text.length * 8 + 10)) {
      this.drawReadableText(text, midpoint, Math.atan2(dy, dx));
    }
    ctx.restore();
  }

  drawCircleSize(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return;

    const midpoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    const angle = Math.acos(Math.max(-1, Math.min(1, dx / length))) * (dy < 0 ? -1 : 1);
    this.ctx.save();
    this.ctx.fillStyle = "#333333";
    this.drawReadableText(String(Math.round(length * this.unitScale)), midpoint, angle);
    this.ctx.restore();
  }

  drawLine(lineData: DimensionLineData, _index = 0) {
    const ctx = this.ctx;
    const color = lineData.selected ? "#000fff" : "#333333";
    const pointRadius = lineData.pointRadius ?? 3;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 0.6 / this.cameraZoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.strokeSegment(lineData.start, lineData.end);
    this.drawPoint(lineData.start, pointRadius);
    this.drawPoint(lineData.end, pointRadius);
    ctx.restore();
  }

  private offsetVector(offsetDir: DimensionOffsetDirection) {
    if (offsetDir === "top") return { x: 0, y: 1 };
    if (offsetDir === "bottom") return { x: 0, y: -1 };
    if (offsetDir === "left") return { x: -1, y: 0 };
    return { x: 1, y: 0 };
  }

  private strokeSegment(a: DimensionPoint, b: DimensionPoint) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  private drawArrowTip(tip: DimensionPoint, inwardDir: DimensionPoint) {
    const size = 5 / this.cameraZoom;
    const angle = 0.55;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const wingA = {
      x: inwardDir.x * cos - inwardDir.y * sin,
      y: inwardDir.x * sin + inwardDir.y * cos
    };
    const wingB = {
      x: inwardDir.x * cos + inwardDir.y * sin,
      y: -inwardDir.x * sin + inwardDir.y * cos
    };

    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(tip.x + wingA.x * size, tip.y + wingA.y * size);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(tip.x + wingB.x * size, tip.y + wingB.y * size);
    ctx.stroke();
  }

  private drawPoint(point: DimensionPoint, pointRadius: number) {
    const radius = pointRadius / this.cameraZoom;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawReadableText(text: string, point: DimensionPoint, rawAngle: number) {
    let angle = rawAngle;
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
    const screen = this.worldToScreen(point);

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(screen.x, screen.y);
    ctx.rotate(-angle);
    ctx.font = "14px serif";
    ctx.fillStyle = "#333333";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(text, 0, -3);
    ctx.restore();
  }
}
