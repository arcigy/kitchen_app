import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createMeasureTools } from "./measureTools";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";

describe("measure tools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts wall and module edit HUD inputs with current attributes", () => {
    installFakeDocument();
    const viewerEl = new FakeElement() as FakeElement & HTMLElement;
    const axisLockEl = new FakeElement() as FakeElement & HTMLInputElement;
    axisLockEl.checked = true;
    const measureBtn = new FakeElement() as FakeElement & HTMLButtonElement;
    const clearMeasuresBtn = new FakeElement() as FakeElement & HTMLButtonElement;
    const measureReadoutEl = new FakeElement() as FakeElement & HTMLElement;

    const tools = createMeasureTools({
      viewerEl,
      scene: { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      getCamera: () => new THREE.PerspectiveCamera(),
      snapOverlay: { showAt: vi.fn(), hide: vi.fn() } as never,
      axisLockEl,
      measureBtn,
      clearMeasuresBtn,
      measureReadoutEl
    });

    expect(viewerEl.children).toHaveLength(2);
    expect(tools.wallEditHud.input.type).toBe("text");
    expect(tools.wallEditHud.input.id).toBe("wall-edit-length");
    expect(tools.wallEditHud.input.name).toBe("wall-edit-length");
    expect(tools.wallEditHud.input.inputMode).toBe("numeric");
    expect(tools.wallEditHud.input.placeholder).toBe("mm");
    expect(tools.wallEditHud.input.autocomplete).toBe("off");
    expect((tools.wallEditHud.input as unknown as FakeElement).attributes.get("aria-label")).toBe("Wall length in millimeters");

    expect(tools.wallEditHud.offsetInput.type).toBe("text");
    expect(tools.wallEditHud.offsetInput.id).toBe("wall-edit-offset");
    expect(tools.wallEditHud.offsetInput.name).toBe("wall-edit-offset");
    expect(tools.wallEditHud.offsetInput.inputMode).toBe("numeric");
    expect(tools.wallEditHud.offsetInput.placeholder).toBe("mm");
    expect(tools.wallEditHud.offsetInput.autocomplete).toBe("off");
    expect((tools.wallEditHud.offsetInput as unknown as FakeElement).attributes.get("aria-label")).toBe("Wall offset in millimeters");

    expect(tools.moduleEditHud.input.type).toBe("text");
    expect(tools.moduleEditHud.input.id).toBe("module-edit-width");
    expect(tools.moduleEditHud.input.name).toBe("module-edit-width");
    expect(tools.moduleEditHud.input.inputMode).toBe("numeric");
    expect(tools.moduleEditHud.input.placeholder).toBe("mm");
    expect(tools.moduleEditHud.input.autocomplete).toBe("off");
    expect((tools.moduleEditHud.input as unknown as FakeElement).attributes.get("aria-label")).toBe("Module width in millimeters");
  });
});
