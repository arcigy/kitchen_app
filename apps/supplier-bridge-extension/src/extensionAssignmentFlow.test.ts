import { describe, expect, it, vi } from "vitest";
import type { SupplierBridgeAttachment, SupplierBridgeSessionCreation } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import type { ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import type { CapturedSupplierCandidate } from "./messages";
import type { ExtensionMaterialTarget } from "./materialTargetModel";
import { runExtensionAssignment } from "./extensionAssignmentFlow";

vi.stubGlobal("__SUPPLIER_BRIDGE_DEBUG__", true);

const target: ExtensionMaterialTarget = {
  id: "material-assignment:corpus",
  category: "corpus",
  label: "Korpus",
  description: "",
  quantity: null,
  unit: null,
  expectedThicknessMm: 18,
  groupId: "general",
  group: "Celý projekt",
  scope: "general",
  assigned: false,
  assignedText: "Nepriradené",
  assignedProductCode: null,
  assignedPrice: null,
  assignedColorHex: null,
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
      notifyProjectMaterialsChanged: vi.fn().mockResolvedValue(undefined),
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

    expect(result).toEqual({ sessionId: "session-1", materials, warnings: [], refreshError: null });
    expect(deps.createSession).toHaveBeenCalledWith(input.baseUrl, input.accessToken, input.projectId, input.supplierId, expect.objectContaining({
      materialAssignmentId: target.id,
      supplierProductId: candidate.supplierProductCode,
      requestId: "extension-request-1"
    }));
    expect(deps.confirmCandidate).toHaveBeenCalledTimes(1);
    expect(deps.notifyProjectMaterialsChanged).toHaveBeenCalledWith(input.baseUrl, input.projectId);
    expect(deps.loadMaterials).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmed assignment successful when only the follow-up refresh fails", async () => {
    const { deps } = fixtures();
    const refreshFailure = new Error("temporary read failure");
    deps.loadMaterials.mockRejectedValue(refreshFailure);

    const result = await runExtensionAssignment(input, deps);

    expect(result).toEqual({ sessionId: "session-1", materials: null, warnings: [], refreshError: refreshFailure });
    expect(deps.confirmCandidate).toHaveBeenCalledTimes(1);
  });

  it("uses the verified backend supplier only for the debug simulator fixture", async () => {
    const { deps } = fixtures();

    await runExtensionAssignment({ ...input, supplierId: "mock-supplier" }, deps);

    expect(deps.createSession).toHaveBeenCalledWith(
      input.baseUrl,
      input.accessToken,
      input.projectId,
      "demos",
      expect.anything()
    );
  });

  it("sends a runner target without a board-thickness expectation", async () => {
    const { deps } = fixtures();
    await runExtensionAssignment({
      ...input,
      target: { ...target, id: "material-assignment:runner:front-height:80", category: "runner", expectedThicknessMm: null }
    }, deps);

    expect(deps.createSession).toHaveBeenCalledWith(
      input.baseUrl,
      input.accessToken,
      input.projectId,
      input.supplierId,
      expect.objectContaining({ expectedProductType: "drawer_system", expectedThicknessMm: undefined })
    );
  });

  it("uses the project thickness rather than the captured product thickness for boards", async () => {
    const { deps } = fixtures();
    await runExtensionAssignment({
      ...input,
      target: { ...target, expectedThicknessMm: 19 },
      candidate: { ...candidate, normalizedProduct: { ...candidate.normalizedProduct, thicknessMm: 18 } }
    }, deps);

    expect(deps.createSession).toHaveBeenCalledWith(
      input.baseUrl,
      input.accessToken,
      input.projectId,
      input.supplierId,
      expect.objectContaining({ expectedThicknessMm: 19 })
    );
  });

  it.each([
    ["hinge", "hinge"],
    ["runner", "drawer_system"],
    ["handle", "handle"],
    ["lift_up", "lift_up"],
    ["leg", "leg"],
    ["fastener", "fastener"],
    ["lighting", "lighting"],
    ["other_component", "component"],
    ["edge_front", "edge_band"],
    ["edge_other", "edge_band"]
  ] as const)("creates a %s target with the correct non-board product contract", async (category, expectedProductType) => {
    const { deps } = fixtures();

    await runExtensionAssignment({
      ...input,
      target: { ...target, id: `material-assignment:${category}`, category, expectedThicknessMm: null }
    }, deps);

    expect(deps.createSession).toHaveBeenCalledWith(
      input.baseUrl,
      input.accessToken,
      input.projectId,
      input.supplierId,
      expect.objectContaining({ expectedProductType, expectedThicknessMm: undefined })
    );
  });
});
