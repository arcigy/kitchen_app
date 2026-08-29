import { describe, expect, it } from "vitest";
import { assistantCopy } from "./assistantLocale";

describe("assistantCopy", () => {
  it("selects the UI locale for deterministic assistant copy", () => {
    expect(assistantCopy("sk-SK", "Kontrola", "Kontrola", "Check")).toBe("Kontrola");
    expect(assistantCopy("cs-CZ", "Kontrola", "Ověření", "Check")).toBe("Ověření");
    expect(assistantCopy("en-GB", "Kontrola", "Ověření", "Check")).toBe("Check");
  });
});
