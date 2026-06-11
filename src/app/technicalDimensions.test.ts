import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { describe, expect, it, vi } from "vitest";
import { createTechnicalDimensionManager, type TechnicalDimensionRecord } from "./technicalDimensions";
import type { TemporaryDimensionManagerPort } from "./temporaryDimensionManager";

function makeTemporaryDimensions(): TemporaryDimensionManagerPort {
  return {
    addOffsetDimension: vi.fn(),
    addPlacedDimension: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    setSize: vi.fn(),
    setUnitScale: vi.fn(),
    setVisible: vi.fn(),
    syncCamera: vi.fn()
  };
}

function makeManagerArgs(overrides: Partial<Parameters<typeof createTechnicalDimensionManager>[0]> = {}) {
  const renderer = {
    domElement: {
      getBoundingClientRect: () => ({ width: 800, height: 600 })
    }
  } as unknown as THREE.WebGLRenderer;
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3);
  camera.zoom = 2;
  return {
    temporaryDimensions: makeTemporaryDimensions(),
    renderer,
    getCamera: () => camera,
    getControls: () => ({ target: new THREE.Vector3(1, 0, 2) } as unknown as OrbitControls),
    getMode: () => "layout" as const,
    getViewMode: () => "2d" as const,
    getActiveViewerTab: () => "floorplan",
    clearToolHud: vi.fn(),
    ...overrides
  } satisfies Parameters<typeof createTechnicalDimensionManager>[0];
}

describe("createTechnicalDimensionManager", () => {
  it("renders preview dimensions through the temporary dimension manager", () => {
    const args = makeManagerArgs();
    const manager = createTechnicalDimensionManager(args);
    const preview: TechnicalDimensionRecord = {
      id: "preview-1",
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      extensionStart: { x: 5, y: 6 },
      extensionEnd: { x: 7, y: 8 }
    };
    manager.state.preview = [preview];

    manager.render();

    expect(args.temporaryDimensions.setSize).toHaveBeenCalledExactlyOnceWith(800, 600);
    expect(args.temporaryDimensions.clear).toHaveBeenCalledExactlyOnceWith();
    expect(args.temporaryDimensions.setVisible).toHaveBeenCalledExactlyOnceWith(true);
    expect(args.temporaryDimensions.syncCamera).toHaveBeenCalledExactlyOnceWith(200, -1, -2);
    expect(args.temporaryDimensions.addPlacedDimension).toHaveBeenCalledExactlyOnceWith(
      preview.start,
      preview.end,
      preview.extensionStart,
      preview.extensionEnd
    );
    expect(args.temporaryDimensions.render).toHaveBeenCalledExactlyOnceWith();
  });

  it("hides temporary dimensions outside floorplan without rendering lines", () => {
    const args = makeManagerArgs({ getActiveViewerTab: () => "3d" });
    const manager = createTechnicalDimensionManager(args);

    manager.render();

    expect(args.temporaryDimensions.setSize).toHaveBeenCalledExactlyOnceWith(800, 600);
    expect(args.temporaryDimensions.clear).toHaveBeenCalledExactlyOnceWith();
    expect(args.temporaryDimensions.setVisible).toHaveBeenCalledExactlyOnceWith(false);
    expect(args.temporaryDimensions.addPlacedDimension).not.toHaveBeenCalled();
    expect(args.temporaryDimensions.render).not.toHaveBeenCalled();
  });
});
