import type { ProjectMaterialWarning, ProjectMaterialsView } from "../../../src/core/project-materials/project-material-types";
import type { SupplierId } from "../../../src/core/supplier-bridge/supplier-bridge-types";
import {
  attachSupplierBridgeSession,
  confirmSupplierCandidate,
  createExtensionTargetSession,
  loadExtensionProjectMaterials,
  resolveSupplierPreviewImageColor,
  submitSupplierCandidate
} from "./api";
import type { CapturedSupplierCandidate } from "./messages";
import type { ExtensionMaterialTarget } from "./materialTargetModel";
import { supplierExpectedProductTypeForMaterialCategory } from "../../../src/core/supplier-bridge/supplier-target-contract";
import { notifyOpenArcigyProjectMaterials } from "./projectMaterialsNotifier";

export type ExtensionAssignmentInput = {
  baseUrl: string;
  accessToken: string;
  projectId: string;
  supplierId: SupplierId;
  candidate: CapturedSupplierCandidate;
  target: ExtensionMaterialTarget;
};

export class SupplierPreviewColorRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierPreviewColorRequiredError";
  }
}

export type ExtensionPreviewColorResult = {
  status: "derived" | "not_required";
  colorHex: string | null;
  imageFound: boolean;
};

type AssignmentDependencies = {
  createSession: typeof createExtensionTargetSession;
  attachSession: typeof attachSupplierBridgeSession;
  resolvePreviewColor: typeof resolveSupplierPreviewImageColor;
  submitCandidate: typeof submitSupplierCandidate;
  confirmCandidate: typeof confirmSupplierCandidate;
  loadMaterials: typeof loadExtensionProjectMaterials;
  notifyProjectMaterialsChanged: typeof notifyOpenArcigyProjectMaterials;
  randomId: () => string;
};

export type ExtensionAssignmentResult = {
  sessionId: string;
  materials: ProjectMaterialsView | null;
  warnings: ProjectMaterialWarning[];
  refreshError: unknown | null;
  previewColor: ExtensionPreviewColorResult;
};

const dependencies: AssignmentDependencies = {
  createSession: createExtensionTargetSession,
  attachSession: attachSupplierBridgeSession,
  resolvePreviewColor: resolveSupplierPreviewImageColor,
  submitCandidate: submitSupplierCandidate,
  confirmCandidate: confirmSupplierCandidate,
  loadMaterials: loadExtensionProjectMaterials,
  notifyProjectMaterialsChanged: notifyOpenArcigyProjectMaterials,
  randomId: () => crypto.randomUUID()
};

export async function runExtensionAssignment(
  input: ExtensionAssignmentInput,
  deps: AssignmentDependencies = dependencies
): Promise<ExtensionAssignmentResult> {
  const supplierIdForBackend = __SUPPLIER_BRIDGE_DEBUG__ && input.supplierId === "mock-supplier"
    ? "demos"
    : input.supplierId;
  const demosSurfaceMaterial = supplierIdForBackend === "demos" && ["board", "worktop"].includes(input.candidate.normalizedProduct.productType ?? "");
  if (demosSurfaceMaterial && !input.candidate.previewImageUrl) {
    throw new SupplierPreviewColorRequiredError("Démos plošný materiál nemá overený produktový obrázok. Materiál nebol priradený, aby sa do modelu nezapísala nesprávna farba.");
  }
  const creation = await deps.createSession(input.baseUrl, input.accessToken, input.projectId, supplierIdForBackend, {
    requestId: `extension-${deps.randomId()}`,
    materialAssignmentId: input.target.id,
    supplierProductId: input.candidate.supplierProductCode,
    expectedProductType: supplierExpectedProductTypeForMaterialCategory(input.target.category),
    expectedManufacturer: input.candidate.normalizedProduct.manufacturer ?? undefined,
    expectedThicknessMm: input.target.expectedThicknessMm ?? undefined
  });
  const attachment = await deps.attachSession(input.baseUrl, creation.view.session.id, creation.bridgeToken);
  const item = attachment.view.items[0];
  if (!item || attachment.view.items.length !== 1) throw new Error("Bridge nevytvoril presne jeden cieľ.");
  const previewColor = demosSurfaceMaterial
    ? {
        status: "derived" as const,
        colorHex: await deps.resolvePreviewColor(
          input.baseUrl,
          creation.view.session.id,
          attachment.accessToken,
          item.id,
          input.candidate.previewImageUrl!
        ),
        imageFound: true
      }
    : { status: "not_required" as const, colorHex: null, imageFound: !!input.candidate.previewImageUrl };
  const submission = await deps.submitCandidate(input.baseUrl, creation.view.session.id, attachment.accessToken, {
    submissionId: `extension-${deps.randomId()}`,
    syncItemId: item.id,
    supplierProductCode: input.candidate.supplierProductCode,
    normalizedProduct: {
      ...input.candidate.normalizedProduct,
      ...(previewColor.colorHex ? { previewColorHex: previewColor.colorHex } : {})
    },
    sourcePageType: input.candidate.sourcePageType,
    sourcePath: input.candidate.sourcePath,
    observedAt: input.candidate.observedAt,
    price: input.candidate.price
  });
  await deps.confirmCandidate(input.baseUrl, creation.view.session.id, attachment.accessToken, item.id, submission.candidate.id);
  await deps.notifyProjectMaterialsChanged(input.baseUrl, input.projectId).catch(() => undefined);

  try {
    const materials = await deps.loadMaterials(input.baseUrl, input.accessToken, input.projectId);
    return {
      sessionId: creation.view.session.id,
      materials,
      warnings: (materials.warnings ?? []).filter((warning) => warning.affectedObjectId === input.target.id && warning.id.startsWith("supplier-")),
      refreshError: null,
      previewColor
    };
  } catch (refreshError) {
    // Confirmation is the commit boundary. A failed read-after-write must never be
    // presented as a failed assignment or encourage the user to submit a duplicate.
    return { sessionId: creation.view.session.id, materials: null, warnings: [], refreshError, previewColor };
  }
}
