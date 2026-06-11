import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewerDownbar, createViewerTabs, type ViewerDisplayMode, type ViewerProjectionMode } from "./bootstrap";
import { FakeElement } from "./testUtils/propertiesPanelHarness";

class BootstrapFakeElement extends FakeElement {
  hidden = false;
  onclick: (() => void) | null = null;

  click() {
    this.clickCount += 1;
    this.onclick?.();
    this.dispatch("click", { stopPropagation: vi.fn() });
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    if (selector !== "button") return [];
    return collectButtons(this) as T[];
  }
}

function collectButtons(root: FakeElement): FakeElement[] {
  const buttons: FakeElement[] = [];
  for (const child of root.children) {
    if (child.type === "button") buttons.push(child);
    buttons.push(...collectButtons(child));
  }
  return buttons;
}

function installBootstrapDocument() {
  vi.stubGlobal("document", {
    addEventListener: vi.fn(),
    createElement: (tagName: string) => {
      const element = new BootstrapFakeElement();
      if (tagName === "input") element.type = "text";
      return element;
    }
  });
}

describe("bootstrap viewer shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates viewer tabs and keeps dynamic tab click behavior", () => {
    installBootstrapDocument();
    const viewer = new BootstrapFakeElement();
    const onClick = vi.fn();

    const tabs = createViewerTabs(viewer as unknown as HTMLElement);
    tabs.setExtraTabs([{ key: "section:s1", label: "Section S1", onClick }]);
    tabs.syncViewerTabs("section:s1");

    expect(viewer.children[0].className).toBe("viewer-tabbar");
    expect(tabs.floorplanTab.type).toBe("button");
    expect(tabs.floorplanTab.textContent).toBe("Floorplan");
    expect(tabs.view3dTab.type).toBe("button");
    expect(tabs.view3dTab.textContent).toBe("3D");

    const dynamicTab = viewer.children[0].children[2] as BootstrapFakeElement;
    expect(dynamicTab.type).toBe("button");
    expect(dynamicTab.textContent).toBe("Section S1");
    expect(dynamicTab.className).toBe("viewer-tab viewer-tab-active");

    dynamicTab.click();

    expect(onClick).toHaveBeenCalledExactlyOnceWith();
  });

  it("creates viewer downbar controls and preserves menu/projection/hidden behavior", () => {
    installBootstrapDocument();
    const viewer = new BootstrapFakeElement();
    let mode: ViewerDisplayMode = "solid";
    let projection: ViewerProjectionMode = "perspective";
    let showHidden = false;
    const hidden = {
      hasHiddenObjects: vi.fn(() => true),
      isShowHidden: vi.fn(() => showHidden),
      toggleShowHidden: vi.fn(() => {
        showHidden = !showHidden;
      })
    };

    const downbarController = createViewerDownbar(viewer as unknown as HTMLElement, {
      getMode: () => mode,
      setMode: (next) => {
        mode = next;
      },
      getProjection: () => projection,
      setProjection: (next) => {
        projection = next;
      },
      getIs3dView: () => true,
      hidden
    });
    const downbar = downbarController.downbar as unknown as BootstrapFakeElement;

    expect(downbar.className).toBe("viewer-downbar");
    const displayWrap = downbar.children[0] as BootstrapFakeElement;
    const displayButton = displayWrap.children[0] as BootstrapFakeElement;
    const menu = displayWrap.children[1] as BootstrapFakeElement;
    expect(displayButton.type).toBe("button");
    expect(displayButton.attributes.get("aria-haspopup")).toBe("menu");
    expect(menu.children.map((child) => child.textContent)).toEqual(["Drôtový model", "Realistické", "Plné"]);
    expect(menu.children.map((child) => child.type)).toEqual(["button", "button", "button"]);

    (menu.children[0] as BootstrapFakeElement).click();

    expect(mode).toBe("wireframe");
    expect(menu.hidden).toBe(true);

    const toolbar = downbar.children[1] as BootstrapFakeElement;
    const projectionButton = toolbar.children[6] as BootstrapFakeElement;
    expect(projectionButton.type).toBe("button");
    projectionButton.click();
    expect(projection).toBe("axonometric");

    const scaleButton = downbar.children[2] as BootstrapFakeElement;
    expect(scaleButton.type).toBe("button");
    expect(scaleButton.textContent).toBe("1:100");
    expect(scaleButton.attributes.get("aria-label")).toBe("Scale 1:100");

    const showHiddenButton = downbar.children[4] as BootstrapFakeElement;
    expect(showHiddenButton.type).toBe("button");
    expect(showHiddenButton.textContent).toBe("Zobraziť skryté");
    showHiddenButton.click();
    expect(hidden.toggleShowHidden).toHaveBeenCalledExactlyOnceWith();
    expect(showHiddenButton.className).toBe("viewer-downbar-button");
    downbarController.sync();
    expect(showHiddenButton.className).toBe("viewer-downbar-button active");
  });
});
