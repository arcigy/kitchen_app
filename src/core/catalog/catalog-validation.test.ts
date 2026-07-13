import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "./catalog-bootstrap";
import type { ClientCatalog } from "./catalog-types";
import { CatalogValidationError, validateClientCatalog } from "./catalog-validation";

function catalog(): ClientCatalog {
  return { clientId: "client_validation", ...createSystemCatalogSeed() };
}

describe("catalog metadata validation", () => {
  it("preserves a valid last synchronization timestamp", () => {
    const input = catalog();
    input.meta.lastSynchronizedAt = "2026-07-10T06:30:00.000Z";

    expect(validateClientCatalog(input).meta.lastSynchronizedAt).toBe("2026-07-10T06:30:00.000Z");
  });

  it("rejects an invalid last synchronization timestamp", () => {
    const input = catalog();
    input.meta.lastSynchronizedAt = "not-a-date";

    expect(() => validateClientCatalog(input)).toThrow(CatalogValidationError);
  });

  it("rejects ambiguous exact material codes", () => {
    const input = catalog();
    input.materials[0] = { ...input.materials[0]!, materialCode: "DUPLICATE-CODE" };
    input.materials[1] = { ...input.materials[1]!, materialCode: "DUPLICATE-CODE" };

    expect(() => validateClientCatalog(input)).toThrow(/duplicate materialCode/);
  });
});
