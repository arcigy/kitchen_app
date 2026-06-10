import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendOpeningHandleRows,
  appendOpeningMaterialRow,
  appendOpeningNumberRows,
  appendOpeningSwingRows
} from "./openingPropsPanelControls";
import type { PropertiesPanelApi } from "./toolPropsPanels";

type FakeListener = (event: Record<string, unknown>) => void;

class FakeElement {
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  className = "";
  innerHTML = "";
  listeners = new Map<string, FakeListener[]>();
  step = "";
  title = "";
  type = "";
  value = "";

  addEventListener(type: string, listener: FakeListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children: FakeElement[]) {
    this.children.push(...children);
  }

  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

function installFakeDocument() {
  vi.stubGlobal("document", {
    createElement: () => new FakeElement()
  });
}

function makeProps() {
  const rows: Array<{ label: string; control: FakeElement }> = [];
  const props: PropertiesPanelApi = {
    setTitle: vi.fn(),
    section: () => new FakeElement() as unknown as HTMLElement,
    row: (_section, label, control) => rows.push({ label, control: control as unknown as FakeElement })
  };
  return { props, rows, section: new FakeElement() as unknown as HTMLElement };
}

describe("opening props panel controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies number rows on input, change, and Enter without changing commit timing", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const params = { widthMm: 900 };
    const apply = vi.fn();

    appendOpeningNumberRows(props, section, params, [{ label: "Width", key: "widthMm" }], apply);

    const width = rows[0].control;
    width.value = "925.4";
    width.dispatch("input");
    expect(params.widthMm).toBe(925);
    expect(apply).toHaveBeenLastCalledWith(false, { widthMm: 925 });

    width.value = "930.6";
    width.dispatch("change");
    expect(params.widthMm).toBe(931);
    expect(apply).toHaveBeenLastCalledWith(true, { widthMm: 931 });

    width.value = "940";
    width.dispatch("keydown", { key: "Enter" });
    expect(apply).toHaveBeenLastCalledWith(true, { widthMm: 940 });
  });

  it("toggles opening swing controls through shared button and select behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const params = { swingDirection: "right" as const, swingSide: "outward" as const };
    const apply = vi.fn();

    appendOpeningSwingRows(props, section, params, apply, {
      controlsRow: "Sipky",
      directionRow: "Otvaranie",
      sideRow: "Smer",
      handednessButton: "Prehodit lave/prave dvere",
      sideButton: "Prehodit otvaranie dovnutra/von",
      handednessToLeft: "Prehodit na lave dvere",
      handednessToRight: "Prehodit na prave dvere",
      sideToInward: "Prehodit otvaranie dovnutra",
      sideToOutward: "Prehodit otvaranie von",
      includeButtonAriaLabel: true
    });

    const [handednessButton, sideButton] = rows[0].control.children;
    expect(handednessButton.title).toBe("Prehodit na lave dvere");
    expect(handednessButton.attributes.get("aria-label")).toBe("Prehodit lave/prave dvere");

    handednessButton.dispatch("click");
    expect(params.swingDirection).toBe("left");
    expect(apply).toHaveBeenLastCalledWith(true, { swingDirection: "left" });

    sideButton.dispatch("click");
    expect(params.swingSide).toBe("inward");
    expect(apply).toHaveBeenLastCalledWith(true, { swingSide: "inward" });

    const direction = rows[1].control;
    direction.value = "right";
    direction.dispatch("change");
    expect(params.swingDirection).toBe("right");
    expect(apply).toHaveBeenLastCalledWith(true, { swingDirection: "right" });
  });

  it("keeps opening handle rows centralized and clamps negative numeric values", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const params = { handleType: "lever" as const, handleHeightMm: 900, handleOffsetMm: 50 };
    const apply = vi.fn();

    appendOpeningHandleRows(props, section, params, apply);

    const height = rows.find((row) => row.label === "Vyska klucky (mm)")?.control;
    expect(height).toBeDefined();
    height!.value = "-12";
    height!.dispatch("change");

    expect(params.handleHeightMm).toBe(0);
    expect(apply).toHaveBeenLastCalledWith(true, { handleHeightMm: 0 });
  });

  it("applies opening material changes and supports door-style normalization", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const params = { materialId: "invalid" };
    const apply = vi.fn();

    appendOpeningMaterialRow(
      props,
      section,
      params,
      [
        { id: "mat-a", name: "A" },
        { id: "mat-b", name: "B" }
      ],
      apply,
      { normalize: (value) => (value === "mat-b" ? "mat-b" : "mat-a") }
    );

    const material = rows[0].control;
    expect(params.materialId).toBe("mat-a");
    expect(material.value).toBe("mat-a");

    material.value = "mat-b";
    material.dispatch("change");

    expect(params.materialId).toBe("mat-b");
    expect(apply).toHaveBeenLastCalledWith(true, { materialId: "mat-b" });
  });
});
