import { afterEach, describe, expect, it, vi } from "vitest";
import { appendMutedText, createInputElement, createMutedText, createSelectElement, createTextElement } from "./propsPanelElements";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";

describe("props panel elements", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates reusable plain text elements", () => {
    installFakeDocument();

    const element = createTextElement("Value text") as unknown as FakeElement;

    expect(element.className).toBe("");
    expect(element.textContent).toBe("Value text");
  });

  it("creates reusable select elements with stable option values and labels", () => {
    installFakeDocument();

    const select = createSelectElement("back", [
      { value: "center", label: "Center" },
      { value: "back", label: "Back edge" }
    ]) as unknown as FakeElement;

    expect(select.value).toBe("back");
    expect(select.children.map((child) => [child.value, child.textContent])).toEqual([
      ["center", "Center"],
      ["back", "Back edge"]
    ]);
  });

  it("creates reusable text input elements with stable values", () => {
    installFakeDocument();

    const input = createInputElement("text", "Ground floor") as unknown as FakeElement;

    expect(input.type).toBe("text");
    expect(input.value).toBe("Ground floor");
  });

  it("creates reusable number input elements with stable step and values", () => {
    installFakeDocument();

    const input = createInputElement("number", "120", { step: "1" }) as unknown as FakeElement;

    expect(input.type).toBe("number");
    expect(input.step).toBe("1");
    expect(input.value).toBe("120");
  });

  it("stringifies numeric select values the same way DOM option values do", () => {
    installFakeDocument();

    const select = createSelectElement(2, [
      { value: 1, label: "One" },
      { value: 2, label: "Two" }
    ]) as unknown as FakeElement;

    expect(select.value).toBe("2");
    expect(select.children.map((child) => [child.value, child.textContent])).toEqual([
      ["1", "One"],
      ["2", "Two"]
    ]);
  });

  it("creates reusable muted text elements without changing text content", () => {
    installFakeDocument();

    const element = createMutedText("Summary text") as unknown as FakeElement;

    expect(element.className).toBe("muted");
    expect(element.textContent).toBe("Summary text");
  });

  it("appends muted text and returns the appended element", () => {
    installFakeDocument();
    const parent = new FakeElement() as FakeElement & HTMLElement;

    const element = appendMutedText(parent, "Panel status") as unknown as FakeElement;

    expect(parent.children).toEqual([element]);
    expect(element.className).toBe("muted");
    expect(element.textContent).toBe("Panel status");
  });
});
