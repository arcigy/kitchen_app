import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createSectionDrawController } from "./sectionDrawController";
import type { SectionInstance, SectionParams } from "./localTypes";
import type { SnapOverlayController } from "./snapOverlay";

type SectionDrawContext = Parameters<typeof createSectionDrawController>[0];

function createSection(id: string, params: SectionParams): SectionInstance {
  return { id, params, root: new THREE.Group() } as SectionInstance;
}

function createSnapOverlayMock(): SnapOverlayController {
  return {
    root: {} as HTMLDivElement,
    marker: {} as HTMLDivElement,
    showAt: vi.fn(),
    showWorld: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false)
  };
}

function createContext(overrides: Partial<SectionDrawContext> = {}): SectionDrawContext {
  return {
    layoutRoot: new THREE.Group(),
    sectionDraw: {
      active: true,
      mirrored: true,
      axisLocked: true,
      a: { x: 100, z: 200 },
      hoverPoint: { x: 300, z: 400 },
      previewRoot: null,
      previewLine: null,
      previewArrows: null
    },
    drawSnapOverlay: createSnapOverlayMock(),
    setSectionDrawSnap: vi.fn(),
    hideHoverCursor: vi.fn(),
    setUnderlayStatus: vi.fn(),
    mountProps: vi.fn(),
    createSectionInstance: vi.fn((params) => createSection("section-1", params)),
    getNextSectionName: vi.fn(() => "A"),
    setSelectedSection: vi.fn(),
    activateViewerTab: vi.fn(),
    ...overrides
  };
}

describe("sectionDrawController", () => {
  it("cancels section drawing with current status and props refresh behavior", () => {
    const ctx = createContext();
    const controller = createSectionDrawController(ctx);

    controller.cancelSectionDraw();

    expect(ctx.sectionDraw.active).toBe(false);
    expect(ctx.sectionDraw.mirrored).toBe(false);
    expect(ctx.sectionDraw.axisLocked).toBe(false);
    expect(ctx.sectionDraw.a).toBeNull();
    expect(ctx.sectionDraw.hoverPoint).toBeNull();
    expect(ctx.setSectionDrawSnap).toHaveBeenCalledExactlyOnceWith(null);
    expect(ctx.hideHoverCursor).toHaveBeenCalledOnce();
    expect(ctx.drawSnapOverlay.hide).toHaveBeenCalledOnce();
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });

  it("commits section drawing with current selection, tab, status and props refresh behavior", () => {
    const ctx = createContext();
    const controller = createSectionDrawController(ctx);

    expect(controller.commitSectionDraw({ x: 500, z: 600 })).toBe(true);

    expect(ctx.createSectionInstance).toHaveBeenCalledExactlyOnceWith({
      name: "A",
      aMm: { x: 100, z: 200 },
      bMm: { x: 500, z: 600 },
      mirrored: true
    });
    expect(ctx.setSelectedSection).toHaveBeenCalledExactlyOnceWith("section-1");
    expect(ctx.activateViewerTab).toHaveBeenCalledExactlyOnceWith("section:section-1");
    expect(ctx.setUnderlayStatus).toHaveBeenCalledExactlyOnceWith("Section A created.");
    expect(ctx.mountProps).toHaveBeenCalledOnce();
  });
});
