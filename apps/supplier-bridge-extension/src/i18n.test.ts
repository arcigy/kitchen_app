import { describe, expect, it } from "vitest";
import { extensionCopy, normalizeSupplierBridgeLanguage } from "./i18n";

describe("Supplier Bridge localisation", () => {
  it("uses canonical tenant language values and complete explicit copy", () => {
    expect(normalizeSupplierBridgeLanguage("cz")).toBe("cs");
    expect(extensionCopy("sk", "Projekt", "Projekt", "Project")).toBe("Projekt");
    expect(extensionCopy("cs", "Projekt", "Projekt", "Project")).toBe("Projekt");
    expect(extensionCopy("en", "Projekt", "Projekt", "Project")).toBe("Project");
  });
});
