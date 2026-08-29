import { describe, expect, it, vi } from "vitest";
import { TemporaryDimensionManager, type TemporaryDimensionOverlayPort } from "./temporaryDimensionManager";

function makeOverlay(): TemporaryDimensionOverlayPort {
  return {
    unitScale: 1,
    addDimension: vi.fn(),
    addPlacedDimension: vi.fn(),
    clearDimensions: vi.fn(),
    setSize: vi.fn(),
    setVisible: vi.fn(),
    syncCamera: vi.fn(),
    updateLines: vi.fn()
  };
}

describe("TemporaryDimensionManager", () => {
  it("proxies dimension overlay lifecycle without changing arguments", () => {
    const overlay = makeOverlay();
    const manager = new TemporaryDimensionManager(overlay);

    manager.setUnitScale(1000);
    manager.setSize(800, 600);
    manager.setVisible(true);
    manager.syncCamera(2, -1, 3);
    manager.clear();
    manager.render();

    expect(overlay.unitScale).toBe(1000);
    expect(overlay.setSize).toHaveBeenCalledExactlyOnceWith(800, 600);
    expect(overlay.setVisible).toHaveBeenCalledExactlyOnceWith(true);
    expect(overlay.syncCamera).toHaveBeenCalledExactlyOnceWith(2, -1, 3);
    expect(overlay.clearDimensions).toHaveBeenCalledExactlyOnceWith();
    expect(overlay.updateLines).toHaveBeenCalledExactlyOnceWith();
  });

  it("proxies offset and placed temporary dimensions", () => {
    const overlay = makeOverlay();
    const manager = new TemporaryDimensionManager(overlay);
    const start = { x: 1, y: 2 };
    const end = { x: 3, y: 4 };
    const extensionStart = { x: 5, y: 6 };
    const extensionEnd = { x: 7, y: 8 };

    manager.addOffsetDimension(start, end, "top");
    manager.addPlacedDimension(start, end, extensionStart, extensionEnd);

    expect(overlay.addDimension).toHaveBeenCalledExactlyOnceWith(start, end, "top");
    expect(overlay.addPlacedDimension).toHaveBeenCalledExactlyOnceWith(start, end, extensionStart, extensionEnd);
  });
});
