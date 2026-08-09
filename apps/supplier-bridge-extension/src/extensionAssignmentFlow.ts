import type { ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import type { SupplierId } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import {
  attachSupplierBridgeSession,
  confirmSupplierCandidate,
  createExtensionTargetSession,
  loadExtensionProjectMaterials,
  submitSupplierCandidate
} from "./api";
import type { CapturedSupplierCandidate } from "./messages";
import type { ExtensionMaterialTarget } from "./materialTargetModel";

export type ExtensionAssignmentInput = {
  baseUrl: string;
  accessToken: string;
  projectId: string;
  supplierId: SupplierId;
  candidate: CapturedSupplierCandidate;
  target: ExtensionMaterialTarget;
};

type AssignmentDependencies = {
  createSession: typeof createExtensionTargetSession;
  attachSession: typeof attachSupplierBridgeSession;
  submitCandidate: typeof submitSupplierCandidate;
  confirmCandidate: typeof confirmSupplierCandidate;
  loadMaterials: typeof loadExtensionProjectMaterials;
  randomId: () => string;
};

export type ExtensionAssignmentResult = {
  sessionId: string;
  materials: ProjectMaterialsView | null;
  refreshError: unknown | null;
};

const dependencies: AssignmentDependencies = {
  createSession: createExtensionTargetSession,
  attachSession: attachSupplierBridgeSession,
  submitCandidate: submitSupplierCandidate,
  confirmCandidate: confirmSupplierCandidate,
  loadMaterials: loadExtensionProjectMaterials,
  randomId: () => crypto.randomUUID()
};

function expectedProductType(category: ExtensionMaterialTarget["category"]): "board" | "worktop" | "edge_band" | "hinge" | "drawer_system" | "hardware" {
  if (category === "worktop") return "worktop";
  if (category === "edge_front" || category === "edge_other") return "edge_band";
  if (category === "hinge") return "hinge";
  if (category === "runner") return "drawer_system";
  if (["corpus", "front", "plinth", "back", "drawer_bottom"].includes(category)) return "board";
  return "hardware";
}

export async function runExtensionAssignment(
  input: ExtensionAssignmentInput,
  deps: AssignmentDependencies = dependencies
): Promise<ExtensionAssignmentResult> {
  const supplierIdForBackend = __SUPPLIER_BRIDGE_DEBUG__ && input.supplierId === "mock-supplier"
    ? "demos"
    : input.supplierId;
  const creation = await deps.createSession(input.baseUrl, input.accessToken, input.projectId, supplierIdForBackend, {
    requestId: `extension-${deps.randomId()}`,
    materialAssignmentId: input.target.id,
    supplierProductId: input.candidate.supplierProductCode,
    expectedProductType: expectedProductType(input.target.category),
    expectedManufacturer: input.candidate.normalizedProduct.manufacturer ?? undefined,
    expectedThicknessMm: input.candidate.normalizedProduct.thicknessMm ?? undefined
  });
  const attachment = await deps.attachSession(input.baseUrl, creation.view.session.id, creation.bridgeToken);
  const item = attachment.view.items[0];
  if (!item || attachment.view.items.length !== 1) throw new Error("Bridge nevytvoril presne jeden cieľ.");
  const submission = await deps.submitCandidate(input.baseUrl, creation.view.session.id, attachment.accessToken, {
    submissionId: `extension-${deps.randomId()}`,
    syncItemId: item.id,
    supplierProductCode: input.candidate.supplierProductCode,
    normalizedProduct: input.candidate.normalizedProduct,
    sourcePageType: input.candidate.sourcePageType,
    sourcePath: input.candidate.sourcePath,
    observedAt: input.candidate.observedAt,
    price: input.candidate.price
  });
  await deps.confirmCandidate(input.baseUrl, creation.view.session.id, attachment.accessToken, item.id, submission.candidate.id);

  try {
    const materials = await deps.loadMaterials(input.baseUrl, input.accessToken, input.projectId);
    return { sessionId: creation.view.session.id, materials, refreshError: null };
  } catch (refreshError) {
    // Confirmation is the commit boundary. A failed read-after-write must never be
    // presented as a failed assignment or encourage the user to submit a duplicate.
    return { sessionId: creation.view.session.id, materials: null, refreshError };
  }
}
