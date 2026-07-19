import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { AppState } from "../layout/appState";
import { FakeElement } from "./testUtils/propertiesPanelHarness";
import { createWorkspaceNavigationController } from "./workspaceNavigationController";

class WorkspaceFakeElement extends FakeElement {
  private selectors = new Map<string, WorkspaceFakeElement>();
  hidden = false;

  querySelector<T = FakeElement>(selector: string): T | null {
    if (selector === ".workspace-dialog" || selector === "[data-workspace-close]") {
      return this.getSelector(selector) as T;
    }
    return null;
  }

  private getSelector(selector: string) {
    const current = this.selectors.get(selector);
    if (current) return current;
    const element = new WorkspaceFakeElement();
    if (selector === ".workspace-dialog") element.className = "workspace-dialog wide";
    if (selector === "[data-workspace-close]") {
      element.type = "button";
      element.setAttribute("aria-label", "Close");
    }
    this.selectors.set(selector, element);
    return element;
  }
}

function materialsPhaseHarness() {
  return {
    mainEl: new WorkspaceFakeElement() as unknown as HTMLElement,
    hostEl: new WorkspaceFakeElement() as unknown as HTMLElement,
    warningsEl: new WorkspaceFakeElement() as unknown as HTMLElement,
    warningListEl: new WorkspaceFakeElement() as unknown as HTMLElement
  };
}

function marginsPhaseHarness() {
  return {
    mainEl: new WorkspaceFakeElement() as unknown as HTMLElement,
    hostEl: new WorkspaceFakeElement() as unknown as HTMLElement,
    footerEl: new WorkspaceFakeElement() as unknown as HTMLElement
  };
}

function emptyAppState() {
  return {
    instances: [],
    sections: [],
    kitchenWorktops: [],
    customFurniture: [],
    kitchenGroups: [],
    kitchenCtx: {}
  } as unknown as AppState;
}

describe("createWorkspaceNavigationController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens sheets overlay with sheet cards and PDF import input behavior", () => {
    const createdInputs: WorkspaceFakeElement[] = [];
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: (tagName: string) => {
        const element = new WorkspaceFakeElement();
        if (tagName === "input") {
          element.type = "text";
          createdInputs.push(element);
        }
        return element;
      }
    });

    const root = new WorkspaceFakeElement();
    root.querySelectorAll = () => [];
    const controller = createWorkspaceNavigationController({
      root: root as unknown as HTMLElement,
      S: emptyAppState(),
      catalog: { materials: [] } as unknown as ClientCatalog,
      materialsPhase: materialsPhaseHarness(),
      setDesignTopbar: vi.fn(),
      setVisualisationTopbar: vi.fn()
    });

    controller.openSheets();

    const overlay = root.children[0] as WorkspaceFakeElement;
    const dialog = overlay.querySelector<WorkspaceFakeElement>(".workspace-dialog");
    const body = dialog?.children[0] as WorkspaceFakeElement;
    const actions = body.children[0] as WorkspaceFakeElement;
    const importButton = actions.children[0] as WorkspaceFakeElement;
    const grid = body.children[1] as WorkspaceFakeElement;
    expect(importButton.type).toBe("button");
    expect(importButton.textContent).toBe("Import PDF");
    expect(importButton.className).toBe("workspace-primary");
    expect(importButton.dataset.importSheet).toBe("");
    expect(grid?.children).toHaveLength(4);
    expect(grid?.children.map((child) => child.type)).toEqual(["button", "button", "button", "button"]);
    expect(grid?.children.map((child) => child.className)).toEqual([
      "workspace-sheet-card",
      "workspace-sheet-card",
      "workspace-sheet-card",
      "workspace-sheet-card"
    ]);

    importButton.click();

    expect(createdInputs).toHaveLength(1);
    expect(createdInputs[0].type).toBe("file");
    expect(createdInputs[0].accept).toBe("application/pdf,.pdf");
    expect(createdInputs[0].clickCount).toBe(1);
  });

  it("opens schedules as an overlay and Materials as the full project phase", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new WorkspaceFakeElement()
    });

    const root = new WorkspaceFakeElement();
    root.querySelectorAll = () => [];
    const materialsPhase = materialsPhaseHarness();
    const controller = createWorkspaceNavigationController({
      root: root as unknown as HTMLElement,
      S: emptyAppState(),
      catalog: {
        materials: [{ id: "oak", displayName: "Oak", isActive: true }]
      } as unknown as ClientCatalog,
      materialsPhase,
      setDesignTopbar: vi.fn(),
      setVisualisationTopbar: vi.fn()
    });

    controller.openSchedules();

    const schedulesOverlay = root.children[0] as WorkspaceFakeElement;
    const schedulesDialog = schedulesOverlay.querySelector<WorkspaceFakeElement>(".workspace-dialog");
    const schedulesBody = schedulesDialog?.children[0] as WorkspaceFakeElement;
    const tabs = schedulesBody.children[0] as WorkspaceFakeElement;
    expect(tabs.className).toBe("workspace-schedule-tabs");
    expect(tabs.children.map((button) => button.textContent)).toEqual([
      "Module schedule",
      "Material boards",
      "Opaskovanie",
      "Components",
      "Views"
    ]);
    expect(tabs.children.map((button) => button.type)).toEqual(["button", "button", "button", "button", "button"]);
    expect(tabs.children[0].className).toBe("active");

    tabs.children[1].click();

    expect(tabs.children[0].className).toBe("");
    expect(tabs.children[1].className).toBe("active");

    controller.openMaterials();

    expect((materialsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(false);
    expect((materialsPhase.mainEl as unknown as WorkspaceFakeElement).classList.contains("archux-materials-phase")).toBe(true);
    expect(root.classList.contains("archux-materials-phase")).toBe(true);
    expect((materialsPhase.warningsEl as unknown as WorkspaceFakeElement).hidden).toBe(false);
    expect((materialsPhase.hostEl as unknown as WorkspaceFakeElement).innerHTML).toContain("Materiály a komponenty");

    await controller.leaveMaterialsPhase();

    expect((materialsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(true);
  });

  it("delegates the live Materials phase to the interactive controller and closes it on exit", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new WorkspaceFakeElement()
    });
    const root = new WorkspaceFakeElement();
    root.querySelectorAll = () => [];
    const materialsPhase = materialsPhaseHarness();
    const open = vi.fn(async () => ({ warnings: [] }));
    const close = vi.fn(async () => undefined);
    const controller = createWorkspaceNavigationController({
      root: root as unknown as HTMLElement,
      S: emptyAppState(),
      catalog: { materials: [] } as unknown as ClientCatalog,
      materialsPhase,
      materialsController: { open, close } as never,
      setDesignTopbar: vi.fn(),
      setVisualisationTopbar: vi.fn()
    });

    controller.openMaterials();
    expect(open).toHaveBeenCalledOnce();
    expect((materialsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(false);

    await controller.leaveMaterialsPhase();
    expect(close).toHaveBeenCalledOnce();
    expect((materialsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(true);
  });

  it("opens the real Margins phase from workspace navigation and closes it when returning to design", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new WorkspaceFakeElement()
    });
    const marginsButton = new WorkspaceFakeElement();
    marginsButton.dataset.workspaceNav = "margins";
    const designButton = new WorkspaceFakeElement();
    designButton.dataset.workspaceNav = "design";
    const root = new WorkspaceFakeElement();
    root.querySelectorAll = () => [marginsButton, designButton] as never[];
    const marginsPhase = marginsPhaseHarness();
    const open = vi.fn(async () => ({}));
    const close = vi.fn(async () => undefined);
    const setDesignTopbar = vi.fn();
    createWorkspaceNavigationController({
      root: root as unknown as HTMLElement,
      S: emptyAppState(),
      catalog: { materials: [] } as unknown as ClientCatalog,
      materialsPhase: materialsPhaseHarness(),
      marginsPhase,
      marginsController: { open, close } as never,
      setDesignTopbar,
      setVisualisationTopbar: vi.fn()
    });

    marginsButton.click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect((marginsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(false);
    expect((marginsPhase.footerEl as unknown as WorkspaceFakeElement).hidden).toBe(false);
    expect(root.classList.contains("archux-margins-phase")).toBe(true);
    expect((marginsPhase.mainEl as unknown as WorkspaceFakeElement).classList.contains("archux-margins-phase")).toBe(true);
    expect(marginsButton.classList.contains("active")).toBe(true);

    designButton.click();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect((marginsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(true);
    expect((marginsPhase.footerEl as unknown as WorkspaceFakeElement).hidden).toBe(true);
    expect(root.classList.contains("archux-margins-phase")).toBe(false);
    expect(designButton.classList.contains("active")).toBe(true);
    expect(setDesignTopbar).toHaveBeenCalled();
  });

  it("keeps Margins closed when Design is selected before the pending open finishes", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new WorkspaceFakeElement()
    });
    const marginsButton = new WorkspaceFakeElement();
    marginsButton.dataset.workspaceNav = "margins";
    const designButton = new WorkspaceFakeElement();
    designButton.dataset.workspaceNav = "design";
    const root = new WorkspaceFakeElement();
    root.querySelectorAll = () => [marginsButton, designButton] as never[];
    const marginsPhase = marginsPhaseHarness();
    let resolveOpen!: (value: unknown) => void;
    const pendingOpen = new Promise((resolve) => { resolveOpen = resolve; });
    const open = vi.fn(() => pendingOpen);
    const close = vi.fn(async () => undefined);
    createWorkspaceNavigationController({
      root: root as unknown as HTMLElement,
      S: emptyAppState(),
      catalog: { materials: [] } as unknown as ClientCatalog,
      materialsPhase: materialsPhaseHarness(),
      marginsPhase,
      marginsController: { open, close } as never,
      setDesignTopbar: vi.fn(),
      setVisualisationTopbar: vi.fn()
    });

    marginsButton.click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    designButton.click();
    resolveOpen({});

    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect((marginsPhase.hostEl as unknown as WorkspaceFakeElement).hidden).toBe(true);
    expect((marginsPhase.footerEl as unknown as WorkspaceFakeElement).hidden).toBe(true);
    expect(root.classList.contains("archux-margins-phase")).toBe(false);
    expect(designButton.classList.contains("active")).toBe(true);
  });

  it("escapes a Margins load failure before rendering it into the workspace", async () => {
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new WorkspaceFakeElement()
    });
    const root = new WorkspaceFakeElement();
    root.querySelectorAll = () => [];
    const marginsPhase = marginsPhaseHarness();
    const controller = createWorkspaceNavigationController({
      root: root as unknown as HTMLElement,
      S: emptyAppState(),
      catalog: { materials: [] } as unknown as ClientCatalog,
      materialsPhase: materialsPhaseHarness(),
      marginsPhase,
      marginsController: {
        open: vi.fn(async () => { throw new Error('<img src=x onerror="alert(1)">'); }),
        close: vi.fn(async () => undefined)
      } as never,
      setDesignTopbar: vi.fn(),
      setVisualisationTopbar: vi.fn()
    });

    controller.openMargins();
    await vi.waitFor(() => expect((marginsPhase.hostEl as unknown as WorkspaceFakeElement).innerHTML).toContain("data-margin-error"));
    expect((marginsPhase.hostEl as unknown as WorkspaceFakeElement).innerHTML).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect((marginsPhase.hostEl as unknown as WorkspaceFakeElement).innerHTML).not.toContain("<img");
  });
});
