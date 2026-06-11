import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlignPickedLine } from "./localTypes";
import { mountAlignToolPropsPanel, mountTrimToolPropsPanel } from "./toolPropsPanels";
import { installFakeDocument, makePropertiesPanelHarness } from "./testUtils/propertiesPanelHarness";

function pickedLine(label: string) {
  return { label } as AlignPickedLine;
}

describe("tool props panels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps align tool muted hint and reference summary text", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();

    mountAlignToolPropsPanel({ props, alignState: { ref: pickedLine("Wall A") } });

    expect(props.setTitle).toHaveBeenCalledWith("Align");
    expect(section.children.map((child) => child.className)).toEqual(["muted", "muted"]);
    expect(section.children[0]?.textContent).toBe("Click the reference line, then click one or more parallel lines to align. Esc = new reference, Esc again = exit.");
    expect(section.children[1]?.textContent).toBe("Reference: Wall A");
    expect(section.children[1]?.style.marginTop).toBe("8px");
  });

  it("keeps trim tool muted hint, step, and target summary text", () => {
    installFakeDocument();
    const { props, section } = makePropertiesPanelHarness();

    mountTrimToolPropsPanel({
      props,
      trimState: { step: "pickCutter", targetPick: pickedLine("Target wall") }
    });

    expect(props.setTitle).toHaveBeenCalledWith("Trim / Extend");
    expect(section.children.map((child) => child.className)).toEqual(["muted", "muted", "muted"]);
    expect(section.children[0]?.textContent).toBe("Click the target wall, then click the boundary wall or line. The nearest end trims or extends to the intersection. Esc = back.");
    expect(section.children[1]?.textContent).toBe("Step: select cut");
    expect(section.children[1]?.style.marginTop).toBe("8px");
    expect(section.children[2]?.textContent).toBe("Target: Target wall");
    expect(section.children[2]?.style.marginTop).toBe("6px");
  });
});
