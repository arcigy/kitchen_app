import { describe, expect, it, vi } from "vitest";
import type { SupplierBridgeAttachment, SupplierBridgeSessionCreation } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import type { ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import type { CapturedSupplierCandidate } from "./messages";
import type { ExtensionMaterialTarget } from "./materialTargetModel";
import { runExtensionAssignment } from "./extensionAssignmentFlow";

const target: ExtensionMaterialTarget = {
  id: "material-assignment:corpus",
  category: "corpus",
  label: "Korpus",
  groupId: "general",
  group: "Celý projekt",
  scope: "general",
  assigned: false,
  assignedText: "Nepriradené",
  assignedProductCode: null,
  inherited: false
};

const candidate: CapturedSupplierCandidate = {
  supplierProductCode: "175718",
  normalizedProduct: {
    displayName: "Egger H3303 ST10",
    manufacturer: "Egger",
    decorCode: "H3303",
    surfaceCode: "ST10",
    productType: "board",
    thicknessMm: 18,
    widthMm: null,
    lengthMm: null,
    availability: "unknown"
  },
  sourcePageType: "product",
  sourcePath: "/produkt/175718",
  observedAt: "2026-07-18T17:55:17.000Z",
  price: null
};

function fixtures() {
  const view = {
    session: { id: "session-1" },
    items: [{ id: "item-1" }],
    candidates: [{ id: "candidate-1" }]
  };
  const materials = { assignments: { assignments: [] }, scopes: [] } as unknown as ProjectMaterialsView;
  return {
    materials,
    deps: {
      createSession: vi.fn().mockResolvedValue({ view, bridgeToken: "bridge-token" } as unknown as SupplierBridgeSessionCreation),
      attachSession: vi.fn().mockResolvedValue({ view, accessToken: "bridge-access" } as unknown as SupplierBridgeAttachment),
      submitCandidate: vi.fn().mockResolvedValue({ view, candidate: view.candidates[0], idempotent: false }),
      confirmCandidate: vi.fn().mockResolvedValue(view),
      loadMaterials: vi.fn().mockResolvedValue(materials),
      randomId: vi.fn().mockReturnValueOnce("request-1").mockReturnValueOnce("submission-1")
    }
  };
}

const input = {
  baseUrl: "https://develop.example.test",
  accessToken: "user-access",
  projectId: "project-example",
  supplierId: "demos" as const,
  candidate,
  target
};

describe("standalone extension assignment flow", () => {
  it("creates one exact target, confirms it, and reads the updated material state", async () => {
    const { deps, materials } = fixtures();
    const result = await runExtensionAssignment(input, deps);

    expect(result).toEqual({ sessionId: "session-1", materials, refreshError: null });
    expect(deps.createSession).toHaveBeenCalledWith(input.baseUrl, input.accessToken, input.projectId, input.supplierId, expect.objectContaining({
      materialAssignmentId: target.id,
      supplierProductId: candidate.supplierProductCode,
      requestId: "extension-request-1"
    }));
    expect(deps.confirmCandidate).toHaveBeenCalledTimes(1);
    expect(deps.loadMaterials).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed assignment successful when only the follow-up refresh fails", async () => {
    const { deps } = fixtures();
    const refreshFailure = new Error("temporary read failure");
    deps.loadMaterials.mockRejectedValue(refreshFailure);

    const result = await runExtensionAssignment(input, deps);

    expect(result).toEqual({ sessionId: "session-1", materials: null, refreshError: refreshFailure });
    expect(deps.confirmCandidate).toHaveBeenCalledTimes(1);
  });
});
