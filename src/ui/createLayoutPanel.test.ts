import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeElement, installFakeDocument } from "../app/testUtils/propertiesPanelHarness";
import { createLayoutPanel } from "./createLayoutPanel";

class LayoutPanelFakeElement extends FakeElement {
  private selectors = new Map<string, LayoutPanelFakeElement>();

  querySelector<T = FakeElement>(selector: string): T | null {
    if (selector === ".name" || selector === ".dims" || selector === "#dupBtn" || selector === "#delBtn") {
      return this.getSelector(selector) as T;
    }
    return null;
  }

  private getSelector(selector: string) {
    const current = this.selectors.get(selector);
    if (current) return current;
    const element = new LayoutPanelFakeElement();
    if (selector === ".name") {
      element.className = "name muted";
      element.textContent = "Click a module...";
    }
    if (selector === ".dims") element.className = "dims muted";
    if (selector === "#dupBtn") {
      element.id = "dupBtn";
      element.type = "button";
      element.disabled = true;
      element.textContent = "Duplicate";
    }
    if (selector === "#delBtn") {
      element.id = "delBtn";
      element.type = "button";
      element.disabled = true;
      element.textContent = "Delete";
    }
    this.selectors.set(selector, element);
    return element;
  }
}

describe("createLayoutPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps selected actions and list selection callbacks wired", () => {
    vi.stubGlobal("document", {
      createElement: () => new LayoutPanelFakeElement()
    });
    const container = new LayoutPanelFakeElement();
    const onSelect = vi.fn();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();

    const panel = createLayoutPanel(container as unknown as HTMLElement, {
      onSelect,
      onDuplicate,
      onDelete
    });

    const selected = container.children[0] as LayoutPanelFakeElement;
    const dupBtn = selected.querySelector<LayoutPanelFakeElement>("#dupBtn")!;
    const delBtn = selected.querySelector<LayoutPanelFakeElement>("#delBtn")!;
    expect(dupBtn.type).toBe("button");
    expect(dupBtn.disabled).toBe(true);
    expect(delBtn.type).toBe("button");
    expect(delBtn.disabled).toBe(true);

    panel.setRows([{ id: "m1", type: "drawer_low", xMm: 1200, zMm: 450 }]);

    const list = container.children[1] as LayoutPanelFakeElement;
    const labelButton = list.children[0]!.children[0]!.children[0] as LayoutPanelFakeElement;
    expect(labelButton.type).toBe("button");
    expect(labelButton.className).toBe("label");
    expect(labelButton.textContent).toBe("drawer_low • m1");
    labelButton.click();
    expect(onSelect).toHaveBeenCalledWith("m1");

    panel.setSelected("m1");

    expect(dupBtn.disabled).toBe(false);
    expect(delBtn.disabled).toBe(false);
    dupBtn.click();
    delBtn.click();
    expect(onDuplicate).toHaveBeenCalledWith("m1");
    expect(onDelete).toHaveBeenCalledWith("m1");
  });
});
