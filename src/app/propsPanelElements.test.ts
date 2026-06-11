import { afterEach, describe, expect, it, vi } from "vitest";
import { appendMutedText, createMutedText, createTextElement } from "./propsPanelElements";
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
