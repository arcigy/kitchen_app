import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { AppState } from "../layout/appState";
import { FakeElement } from "./testUtils/propertiesPanelHarness";
import { createWorkspaceNavigationController } from "./workspaceNavigationController";

class WorkspaceFakeElement extends FakeElement {
  private selectors = new Map<string, WorkspaceFakeElement>();

  querySelector<T = FakeElement>(selector: string): T | null {
    if (
      selector === ".workspace-dialog" ||
      selector === "[data-workspace-close]" ||
      selector === "[data-sheet-grid]" ||
      selector === "[data-import-sheet]"
    ) {
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
    if (selector === "[data-sheet-grid]") element.dataset.sheetGrid = "";
    if (selector === "[data-import-sheet]") {
      element.type = "button";
      element.textContent = "Import PDF";
      element.dataset.importSheet = "";
    }
    this.selectors.set(selector, element);
    return element;
  }
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
      S: { instances: [], sections: [] } as unknown as AppState,
      catalog: { materials: [] } as unknown as ClientCatalog,
      setDesignTopbar: vi.fn(),
      setVisualisationTopbar: vi.fn()
    });

    controller.openSheets();

    const overlay = root.children[0] as WorkspaceFakeElement;
    const dialog = overlay.querySelector<WorkspaceFakeElement>(".workspace-dialog");
    const grid = (dialog?.children[0] as WorkspaceFakeElement).querySelector<WorkspaceFakeElement>("[data-sheet-grid]");
    expect(grid?.children).toHaveLength(4);
    expect(grid?.children.map((child) => child.type)).toEqual(["button", "button", "button", "button"]);
    expect(grid?.children.map((child) => child.className)).toEqual([
      "workspace-sheet-card",
      "workspace-sheet-card",
      "workspace-sheet-card",
      "workspace-sheet-card"
    ]);

    const importButton = (dialog?.children[0] as WorkspaceFakeElement).querySelector<WorkspaceFakeElement>("[data-import-sheet]");
    importButton?.click();

    expect(createdInputs).toHaveLength(1);
    expect(createdInputs[0].type).toBe("file");
    expect(createdInputs[0].accept).toBe("application/pdf,.pdf");
    expect(createdInputs[0].clickCount).toBe(1);
  });
});
