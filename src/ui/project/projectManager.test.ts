import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeElement, installFakeDocument } from "../../app/testUtils/propertiesPanelHarness";
import { createProjectVersionActionButton } from "./projectManager";

describe("project manager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates project version action buttons with current text button behavior", () => {
    installFakeDocument();

    const button = createProjectVersionActionButton("Pozriet") as unknown as FakeElement;

    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Pozriet");
  });
});
