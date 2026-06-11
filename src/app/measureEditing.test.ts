import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeasureInlineEditor } from "./measureEditing";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";
import type { MeasureState } from "./measureTools";

describe("measure editing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps inline and linked measure inputs mounted with current attributes and commit behavior", () => {
    installFakeDocument();
    const viewerEl = new FakeElement() as FakeElement & HTMLElement;
    const measureOverlay = new FakeElement() as FakeElement & HTMLElement;
    const section = new FakeElement() as FakeElement & HTMLElement;
    const propsRows: Array<{ label: string; input: FakeElement }> = [];
    const onCommitMeasure = vi.fn();
    const target = { kind: "wall" as const, wallId: "wall-1" };
    const measureState = {
      measures: [
        {
          id: "measure_1",
          kind: "distance",
          a: { x: 0, z: 0 },
          b: { x: 1, z: 0 },
          aBinding: { type: "wallEndpoint", wallId: "wall-1", endpoint: "a" },
          bBinding: { type: "wallEndpoint", wallId: "wall-2", endpoint: "a" },
          label: null
        }
      ]
    } as unknown as MeasureState;

    const editor = createMeasureInlineEditor({
      viewerEl,
      measureOverlay,
      measureState,
      getCurrentSelectionTarget: () => target,
      onCommitMeasure,
      propsRow: (_section, label, inputEl) => propsRows.push({ label, input: inputEl as unknown as FakeElement })
    });

    const inlineInput = measureOverlay.children[0]!;
    expect(inlineInput.type).toBe("text");
    expect(inlineInput.inputMode).toBe("numeric");
    expect(inlineInput.placeholder).toBe("mm");
    expect(inlineInput.id).toBe("measure-inline-value");
    expect(inlineInput.name).toBe("measure-inline-value");
    expect(inlineInput.autocomplete).toBe("off");
    expect(inlineInput.attributes.get("aria-label")).toBe("Measure value in millimeters");
    expect(inlineInput.style.display).toBe("none");

    editor.appendLinkedMeasureInputs(section, target);

    expect(section.children[0]!.textContent).toBe("Linked measures");
    expect(propsRows).toHaveLength(1);
    expect(propsRows[0]!.label).toBe("Measure #1");
    const linkedInput = propsRows[0]!.input;
    expect(linkedInput.type).toBe("number");
    expect(linkedInput.step).toBe("1");
    expect(linkedInput.value).toBe("1000");

    linkedInput.value = "1200";
    linkedInput.dispatch("change");
    expect(onCommitMeasure).toHaveBeenLastCalledWith("measure_1", "1200", target);

    const enterEvent = { key: "Enter", preventDefault: vi.fn() };
    linkedInput.value = "1300";
    linkedInput.dispatch("keydown", enterEvent);
    expect(onCommitMeasure).toHaveBeenLastCalledWith("measure_1", "1300", target);
    expect(enterEvent.preventDefault).toHaveBeenCalledOnce();
  });
});
