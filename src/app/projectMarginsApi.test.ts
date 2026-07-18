import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyProjectMarginGroup,
  loadProjectMargins,
  ProjectMarginsApiError
} from "./projectMarginsApi";

const view = {
  revision: 2,
  editable: true,
  currency: "EUR",
  priceAuthority: "BOM",
  settings: {},
  summary: { baseCost: 0, marginAmount: 0, combinedMarginPercent: 0, finalPrice: 0, overrideCount: 0, missingPriceCount: 0 },
  groups: [],
  warnings: []
};

afterEach(() => vi.unstubAllGlobals());

describe("project margins API adapter", () => {
  it("sends group apply-all as one revisioned operation", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({
        revision: 2,
        operation: { type: "set_group", category: "corpus", marginPercent: 15 }
      });
      return new Response(JSON.stringify({ ok: true, view }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(applyProjectMarginGroup("project/a", {
      revision: 2,
      category: "corpus",
      marginPercent: 15
    })).resolves.toMatchObject({ revision: 2 });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project%2Fa/margins", expect.any(Object));
  });

  it("preserves conflict code and current revision for controller recovery", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: "PROJECT_MARGIN_REVISION_CONFLICT",
      error: "Reload",
      revision: 7
    }), { status: 409 })));
    try {
      await loadProjectMargins("project-a");
      throw new Error("Expected request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectMarginsApiError);
      expect(error).toMatchObject({ status: 409, code: "PROJECT_MARGIN_REVISION_CONFLICT", revision: 7 });
    }
  });
});
