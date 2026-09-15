// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DimensionOverlay } from "../app/dimensionOverlay";
import { createKitchenRunDimensionOverlay } from "./kitchenRunDimensionOverlay";
import type { KitchenRunDimensionSource } from "./kitchenRunDimensions";

type Matrix = [number, number, number, number, number, number];
type Glyph = { value: string; font: string; fontPx: number; x: number; y: number; baseline: string };
function recordingCanvas() {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Array<{ matrix: Matrix; font: string }> = [];
  const glyphs: Glyph[] = [];
  const multiply = (b: Matrix) => {
    const a = matrix;
    matrix = [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  };
  const ctx = {
    font: "10px sans-serif", textBaseline: "alphabetic", lineWidth: 1,
    save() { stack.push({ matrix: [...matrix], font: ctx.font }); },
    restore() { const previous = stack.pop()!; matrix = previous.matrix; ctx.font = previous.font; },
    translate(x: number, y: number) { multiply([1,0,0,1,x,y]); },
    scale(x: number, y: number) { multiply([x,0,0,y,0,0]); },
    rotate(a: number) { multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]); },
    setTransform(...m: Matrix) { matrix = m; },
    clearRect() { glyphs.length = 0; },
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(), fillRect: vi.fn(), arc: vi.fn(),
    measureText(value: string) { return { width: value.length * Number(/([\d.]+)px/.exec(ctx.font)![1]) * 0.55 }; },
    fillText(value: string, x: number, y: number) {
      glyphs.push({ value, font: ctx.font, fontPx: Number(/([\d.]+)px/.exec(ctx.font)![1]) * Math.hypot(matrix[2], matrix[3]), x: matrix[0]*x+matrix[2]*y+matrix[4], y: matrix[1]*x+matrix[3]*y+matrix[5], baseline: ctx.textBaseline });
    }
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, glyphs };
}
let canvases: Map<HTMLCanvasElement, ReturnType<typeof recordingCanvas>>;
beforeEach(() => {
  canvases = new Map();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function(this: HTMLCanvasElement) {
    if (!canvases.has(this)) canvases.set(this, recordingCanvas());
    return canvases.get(this)!.ctx;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

function fixture(zoom = 1, angle = 0) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const rect = { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800 } as DOMRect;
  host.getBoundingClientRect = () => rect;
  const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
  camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0,0,0);
  camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const source: KitchenRunDimensionSource = {
    id: "wt1:0", groupId: "kg1", worktopId: "wt1", segmentIndex: 0,
    start: { x: 0, z: 0 }, end: { x: 2.4*Math.cos(angle), z: 2.4*Math.sin(angle) },
    frontNormal: { x: -Math.sin(angle), z: Math.cos(angle) },
    lengthMm: 2400, worktopDepthMm: 620, reservedStartMm: 0, reservedEndMm: 0,
    modules: [{ id: "m1", centerMm: 300, widthMm: 600 }]
  };
  const editModuleWidth = vi.fn((_id: string, mm: number) => {
    source.modules[0]!.widthMm = mm; source.modules[0]!.centerMm = mm/2;
    return { ok: true as const, appliedValueMm: mm, clamped: false };
  });
  const otherEdit = vi.fn(() => ({ ok: true as const, appliedValueMm: 600, clamped: false }));
  let blocked = false;
  let selectedIds: string[] = [];
  const overlay = createKitchenRunDimensionOverlay({ host, getCamera: () => camera,
    worldToScreen: (p, cam, bounds) => { const v = p.clone().project(cam); return new THREE.Vector2((v.x+1)*bounds.width/2, (1-v.y)*bounds.height/2); },
    getSources: () => [source], getSelectedModuleIds: () => selectedIds, getSelectedWorktopSegment: () => null,
    getBlockingModules: () => blocked ? [{ id: "other", minX: 0.8, maxX: 1.4, minZ: -0.48, maxZ: -0.34 }] : [],
    selectModule: (id: string) => { selectedIds = [id]; }, selectWorktopSegment: vi.fn(), editModuleWidth,
    editCornerArm: otherEdit, editModuleGap: otherEdit, editWorktopLength: otherEdit, editWorktopAdjacentOffset: otherEdit, setStatus: vi.fn()
  });
  const rendered = () => canvases.get(host.querySelector("canvas")!)!;
  return { host, camera, source, overlay, editModuleWidth, rendered, block() { blocked = true; } };
}

describe("adaptive dimensions use the classic dimension visual", () => {
  it('keeps dimension hit targets mounted through floating point camera noise', () => {
    const f = fixture(); f.overlay.sync(true);
    const hit = f.host.querySelector('svg rect');
    f.source.start.x += 1e-15;
    f.overlay.sync(true);
    expect(f.host.querySelector('svg rect')).toBe(hit);
    f.source.start.x += .001;
    f.overlay.sync(true);
    expect(f.host.querySelector('svg rect')).not.toBe(hit);
  });
  it.each([0.25, 1, 4])("matches classic world-size serif text at zoom %s without a white label box", (zoom) => {
    const f = fixture(zoom); f.overlay.sync(true);
    const canvas = document.createElement("canvas"); f.host.appendChild(canvas);
    canvas.getBoundingClientRect = f.host.getBoundingClientRect;
    const classic = new DimensionOverlay({ domElement: canvas } as THREE.WebGLRenderer);
    classic.unitScale = 1000; classic.syncCamera(100*zoom, 0, 0);
    classic.addPlacedDimension({ x: 0, y: 0.24 }, { x: 0.6, y: 0.24 }); classic.updateLines();
    const expected = canvases.get(classic.canvas)!.glyphs.find(g => g.value === "600")!;
    const actual = f.rendered().glyphs.find(g => g.value === "600")!;
    expect(actual.fontPx).toBeCloseTo(expected.fontPx, 8);
    expect(actual.font).toMatch(/px serif$/);
    expect(actual.baseline).toBe(expected.baseline);
    expect(f.rendered().ctx.fillRect).not.toHaveBeenCalled();
  });

  it.each([0, Math.PI/4, Math.PI/2, Math.PI])("keeps the visible rotated label clickable and applies edits at angle %s", (angle) => {
    const f = fixture(4, angle); f.overlay.sync(true);
    const glyph = f.rendered().glyphs.find(g => g.value === "600")!;
    // Hit the middle of the text, not the old dimension-line midpoint.
    const rawAngle = angle > Math.PI/2 ? angle+Math.PI : angle;
    const x = glyph.x + Math.sin(rawAngle)*glyph.fontPx/2;
    const y = glyph.y - Math.cos(rawAngle)*glyph.fontPx/2;
    const hit = [...f.host.querySelectorAll("svg rect")].find(r => x >= Number(r.getAttribute("x")) && x <= Number(r.getAttribute("x"))+Number(r.getAttribute("width")) && y >= Number(r.getAttribute("y")) && y <= Number(r.getAttribute("y"))+Number(r.getAttribute("height")));
    expect(hit, "the text must be inside its hit area").toBeDefined();
    hit!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    const input = f.host.querySelector("input")!;
    expect(input.value).toBe("600");
    // The next editor frame reacts to selection before the user can type.
    f.overlay.sync(true);
    expect(document.activeElement).toBe(input);
    input.value = "800"; input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(f.editModuleWidth).toHaveBeenCalledExactlyOnceWith("m1", 800);
    f.overlay.sync(true);
    expect(f.rendered().glyphs.some(g => g.value === "800")).toBe(true);
    f.overlay.hide(); f.overlay.sync(true);
    expect(f.host.querySelector("input")!.style.display).toBe("none");
  });

  it("reroutes dimensions immediately when the worktop depth changes while the rear is blocked", () => {
    const f = fixture(); f.block(); f.overlay.sync(true);
    const before = f.rendered().glyphs.find(g => g.value === "600")!.y;
    f.source.worktopDepthMm += 200; f.overlay.sync(true);
    const after = f.rendered().glyphs.find(g => g.value === "600")!.y;
    expect(after-before).toBeCloseTo(20, 8);
  });
});
