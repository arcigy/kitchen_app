import type { ProjectMaterialAssignment } from "../core/project-materials/project-material-types";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import { isMaterialAllowedForCategory } from "../core/project-materials/project-material-business";
import type { SupplierSyncItem } from "../core/supplier-bridge/supplier-bridge-types";
import { validateProjectMaterialAssignmentsState } from "../core/project-materials/project-material-validation";
import { ProjectMaterialRevisionConflictError } from "../core/project/project-repository";
import { createProjectService } from "../core/project/project-service";
import type { SupplierConfirmationApplyInput } from "../core/supplier-bridge/supplier-bridge-service";
import type { SupplierPriceBasis } from "../core/supplier-bridge/supplier-bridge-types";
import { createServerProjectRepository } from "./projectRepository";
import { createServerCatalogRepository } from "./serverRepositories";

function supplierComponentType(category: ProjectMaterialAssignment["category"]): "runner" | "handle" | "hinge" | "lift_up" | "leg" | "fastener" | "lighting" {
  if (category === "runner" || category === "handle" || category === "hinge" || category === "lift_up" || category === "leg" || category === "lighting") return category;
  return "fastener";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function priceBasisMatches(pricingUnit: string, priceBasis: SupplierPriceBasis): boolean {
  return (pricingUnit === "m2" && priceBasis === "m2")
    || (pricingUnit === "lm" && priceBasis === "linear_meter")
    || (pricingUnit === "pcs" && (priceBasis === "piece" || priceBasis === "pair" || priceBasis === "set"));
}

type SupplierMaterialFieldStatus = "supplier" | "catalog" | "retained" | "default";

type SupplierMaterialResolution = {
  definition: MaterialDefinition;
  thicknessMm: number;
  colorStatus: SupplierMaterialFieldStatus;
  thicknessStatus: SupplierMaterialFieldStatus;
};

function validColor(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9A-F]{6}$/i.test(value) ? value.toUpperCase() : null;
}

function supplierIdsMatch(catalogSupplier: string | undefined, supplierId: string): boolean {
  return catalogSupplier === supplierId || (supplierId === "demos" && catalogSupplier === "demos-sk");
}

function matchingCatalogMaterial(
  catalog: ClientCatalog | undefined,
  current: ProjectMaterialAssignment,
  supplierId: string,
  supplierProductCode: string
): MaterialDefinition | null {
  if (!catalog || current.kind !== "material") return null;
  const matches = catalog.materials.filter((material) =>
    material.isActive &&
    supplierIdsMatch(material.supplierSource?.supplier, supplierId) &&
    material.supplierSource?.supplierProductId === supplierProductCode &&
    isMaterialAllowedForCategory(material, current.category)
  );
  return matches.length === 1 ? matches[0]! : null;
}

function supplierMaterialResolution(
  current: ProjectMaterialAssignment,
  input: SupplierConfirmationApplyInput,
  supplierId: string,
  supplierProductCode: string,
  catalogMaterial: MaterialDefinition | null
): SupplierMaterialResolution {
  const edge = current.category === "edge_front" || current.category === "edge_other";
  const previous = current.snapshots.material?.definition;
  const capturedColor = validColor(input.candidate.normalizedProduct.previewColorHex);
  const catalogColor = validColor(catalogMaterial?.preview.colorHex);
  const retainedColor = validColor(previous?.preview.colorHex);
  const colorHex = capturedColor ?? catalogColor ?? retainedColor ?? "#777777";
  const colorStatus: SupplierMaterialFieldStatus = capturedColor ? "supplier"
    : catalogColor ? "catalog"
      : retainedColor ? "retained"
        : "default";
  const suppliedThickness = input.mapping?.thicknessMm ?? input.candidate.normalizedProduct.thicknessMm;
  const catalogThickness = catalogMaterial?.defaultThicknessMm;
  const retainedThickness = current.thicknessMm ?? previous?.defaultThicknessMm;
  const defaultThicknessMm = suppliedThickness ?? catalogThickness ?? retainedThickness ?? (edge ? 1 : 18);
  const thicknessStatus: SupplierMaterialFieldStatus = suppliedThickness != null ? "supplier"
    : catalogThickness != null ? "catalog"
      : retainedThickness != null ? "retained"
        : "default";
  const boardFamily = current.category === "front" ? "front"
    : current.category === "back" ? "back"
      : current.category === "drawer_bottom" ? "drawer_bottom"
        : current.category === "worktop" ? "worktop"
          : "body";
  const base = catalogMaterial ?? previous;
  const definition: MaterialDefinition = {
    ...(base ?? {}),
    id: catalogMaterial?.id ?? `supplier-${edge ? "edge" : "material"}:${supplierId}:${supplierProductCode}`,
    entityType: "material",
    supplierId,
    materialCode: input.mapping?.decorCode ?? input.candidate.normalizedProduct.decorCode ?? supplierProductCode,
    manufacturer: input.mapping?.manufacturer ?? input.candidate.normalizedProduct.manufacturer ?? base?.manufacturer,
    materialType: edge ? "edge" : "board",
    name: input.candidate.normalizedProduct.displayName,
    displayName: input.candidate.normalizedProduct.displayName,
    category: current.category,
    baseMaterial: edge ? "abs" : "dtd",
    decor: input.mapping?.decorCode ?? input.candidate.normalizedProduct.decorCode ?? base?.decor ?? "",
    color: capturedColor ?? catalogColor ?? base?.color ?? "",
    finish: input.mapping?.surfaceCode ?? input.candidate.normalizedProduct.surfaceCode ?? base?.finish ?? "",
    pricingBasis: edge || current.category === "plinth" ? "linear_length" : "sheet_area",
    pricingUnit: edge || current.category === "plinth" ? "lm" : "m2",
    availableThicknessesMm: [defaultThicknessMm],
    defaultThicknessMm,
    isActive: true,
    tags: ["supplier-bridge", edge ? "edge" : "material"],
    preview: { colorHex, roughness: base?.preview.roughness ?? 0.5, metalness: base?.preview.metalness ?? 0 },
    ...(edge ? { edgeFamily: current.category === "edge_front" ? "front" as const : "body" as const } : { boardFamily }),
    supplierSource: { supplier: supplierId, supplierProductId: supplierProductCode },
    metadata: {
      ...record(base?.metadata),
      supplierProductCode,
      supplierSurfaceCode: input.mapping?.surfaceCode ?? input.candidate.normalizedProduct.surfaceCode,
      supplierProductType: input.mapping?.productType ?? input.candidate.normalizedProduct.productType,
      supplierThicknessMm: suppliedThickness,
      supplierWidthMm: input.candidate.normalizedProduct.widthMm,
      supplierLengthMm: input.candidate.normalizedProduct.lengthMm,
      supplierPreviewColorHex: capturedColor,
      supplierColorStatus: colorStatus,
      supplierThicknessStatus: thicknessStatus,
      ...(suppliedThickness == null ? { supplierThicknessUnverified: true } : {})
    }
  };
  return { definition, thicknessMm: defaultThicknessMm, colorStatus, thicknessStatus };
}

export function updatedSupplierAssignment(
  current: ProjectMaterialAssignment,
  input: SupplierConfirmationApplyInput,
  now: string,
  catalog?: ClientCatalog
): ProjectMaterialAssignment {
  const supplierBridge = record(record(current.customValues).supplierBridge);
  if (supplierBridge.sessionId === input.session.id && supplierBridge.candidateId === input.candidate.id) return current;
  const supplierId = input.item.exactLookup?.supplierId ?? input.session.supplierId;
  const supplierProductCode = input.item.exactLookup?.supplierProductId ?? input.candidate.supplierProductCode;
  const snapshots = structuredClone(current.snapshots);
  const price = input.priceObservation;

  if (current.kind === "component" && !snapshots.component) {
    const componentType = supplierComponentType(current.category);
    const componentId = `supplier-${componentType}:${supplierId}:${supplierProductCode}`;
    snapshots.component = {
      definition: {
        id: componentId,
        entityType: "component",
        supplierId,
        componentCode: supplierProductCode,
        manufacturer: input.candidate.normalizedProduct.manufacturer ?? undefined,
        componentType,
        geometryId: `neutral-${componentType}`,
        name: input.candidate.normalizedProduct.displayName,
        displayName: input.candidate.normalizedProduct.displayName,
        category: componentType,
        brand: input.candidate.normalizedProduct.manufacturer ?? "",
        series: "",
        variant: current.variantKey ?? "",
        color: "",
        pricingBasis: "piece",
        pricingUnit: "pcs",
        defaultQuantity: 1,
        isActive: true,
        tags: ["supplier-bridge", componentType],
        preview: { colorHex: "#777777", roughness: 0.5, metalness: 0.7 },
        supplierSource: { supplier: supplierId, supplierProductId: supplierProductCode },
        metadata: { supplierProductCode, supplierProductType: input.candidate.normalizedProduct.productType }
      },
      unitPrice: null,
      currency: price?.currency ?? "EUR",
      priceListId: null,
      capturedAt: now
    };
  }

  const materialResolution = current.kind === "material"
    ? supplierMaterialResolution(current, input, supplierId, supplierProductCode, matchingCatalogMaterial(catalog, current, supplierId, supplierProductCode))
    : null;

  if (materialResolution) {
    const snapshot = snapshots.material ?? {
      definition: materialResolution.definition,
      unitPrice: null,
      currency: price?.currency ?? "EUR",
      priceListId: null,
      capturedAt: now
    };
    snapshot.definition = materialResolution.definition;
    snapshot.currency = price?.currency ?? snapshot.currency;
    snapshot.capturedAt = now;
    if (price?.normalizedAmount != null && priceBasisMatches(snapshot.definition.pricingUnit, price.normalizedPriceBasis)) {
      snapshot.unitPrice = price.normalizedAmount;
      snapshot.currency = price.currency;
      snapshot.priceListId = `supplier-observation:${supplierId}`;
      snapshot.capturedAt = price.observedAt;
    }
    snapshots.material = snapshot;
  } else if (current.kind === "component" && snapshots.component) {
    const snapshot = snapshots.component;
    snapshot.definition = {
      ...snapshot.definition,
      displayName: input.candidate.normalizedProduct.displayName,
      name: input.candidate.normalizedProduct.displayName,
      supplierId,
      manufacturer: input.candidate.normalizedProduct.manufacturer ?? snapshot.definition.manufacturer,
      supplierSource: { supplier: supplierId, supplierProductId: supplierProductCode },
      metadata: {
        ...record(snapshot.definition.metadata),
        supplierProductCode,
        supplierProductType: input.candidate.normalizedProduct.productType,
        availability: input.candidate.normalizedProduct.availability
      }
    };
    if (price?.normalizedAmount != null && priceBasisMatches(snapshot.definition.pricingUnit, price.normalizedPriceBasis)) {
      snapshot.unitPrice = price.normalizedAmount;
      snapshot.currency = price.currency;
      snapshot.priceListId = `supplier-observation:${supplierId}`;
      snapshot.capturedAt = price.observedAt;
    }
  } else {
    throw new Error("Supplier synchronization target has no matching catalog snapshot.");
  }

  return {
    ...current,
    ...(current.kind === "component" && snapshots.component
      ? { componentId: snapshots.component.definition.id }
      : {}),
    ...(current.kind === "material" && snapshots.material
      ? { materialId: snapshots.material.definition.id }
      : {}),
    ...(materialResolution
      ? { thicknessMm: materialResolution.thicknessMm }
      : {}),
    customValues: {
      ...record(current.customValues),
      supplierBridge: {
        sessionId: input.session.id,
        candidateId: input.candidate.id,
        supplierId,
        supplierProductCode,
        priceObservationId: input.priceObservation?.id ?? null,
        rawPriceText: price?.rawPriceText ?? null,
        rawUnitText: price?.rawUnitText ?? null,
        normalizedAmount: price?.normalizedAmount ?? null,
        normalizedPriceBasis: price?.normalizedPriceBasis ?? null,
        edgeWidthMm: input.candidate.normalizedProduct.widthMm,
        edgeThicknessMm: input.candidate.normalizedProduct.thicknessMm,
        ...(materialResolution ? { colorStatus: materialResolution.colorStatus, thicknessStatus: materialResolution.thicknessStatus } : {}),
        currency: price?.currency ?? null,
        vatMode: price?.vatMode ?? null,
        observedAt: price?.observedAt ?? input.candidate.observedAt,
        confirmedAt: input.mapping?.confirmedAt ?? now,
        priceLocked: false
      }
    },
    snapshots,
    source: "user",
    updatedAt: now
  };
}

/**
 * Scoped module/addition target IDs contain opaque BOM item IDs, which may themselves
 * contain colons. Prefer the category captured when the session was created and only
 * use a unique known-category segment for legacy sessions.
 */
export function baseAssignmentForSupplierTarget(
  assignments: readonly ProjectMaterialAssignment[],
  item: SupplierSyncItem
): ProjectMaterialAssignment | null {
  const general = assignments.filter((assignment) => assignment.assignmentId.startsWith(`material-assignment:${assignment.category}`));
  if (item.assignmentCategory) {
    return general.find((assignment) =>
      assignment.category === item.assignmentCategory &&
      (item.assignmentVariantKey === undefined || assignment.variantKey === item.assignmentVariantKey)
    ) ?? null;
  }
  const matches = general.filter((assignment) => item.materialAssignmentId.includes(`:${assignment.category}:`));
  if (matches.length === 1) return matches[0]!;
  return general.find((assignment) => assignment.assignmentId === item.materialAssignmentId) ?? null;
}

export async function applyConfirmedSupplierCandidateToProject(
  projectRoot: string,
  input: SupplierConfirmationApplyInput
): Promise<void> {
  const repository = createServerProjectRepository({ projectRoot });
  const service = createProjectService(repository);
  const catalog = await createServerCatalogRepository(projectRoot).ensureCatalogExists(input.context);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const save = await service.loadProject(input.context, input.session.projectId);
    const currentState = save.appState.materialAssignments;
    let index = currentState.assignments.findIndex((assignment) => assignment.assignmentId === input.item.materialAssignmentId);
    const now = new Date().toISOString();
    const assignments = structuredClone(currentState.assignments);
    if (index < 0) {
      const base = baseAssignmentForSupplierTarget(assignments, input.item);
      if (!base) throw new Error("Material assignment for supplier sync item no longer exists.");
      assignments.push({ ...structuredClone(base), assignmentId: input.item.materialAssignmentId, updatedAt: now });
      index = assignments.length - 1;
    }
    const assignment = updatedSupplierAssignment(assignments[index]!, input, now, catalog);
    if (assignment === assignments[index]) return;
    assignments[index] = assignment;
    const nextState = {
      ...structuredClone(currentState),
      initialized: true as const,
      revision: currentState.revision + 1,
      assignments,
      updatedAt: now
    };
    validateProjectMaterialAssignmentsState(nextState, "supplier-confirmed material assignments");
    try {
      await repository.updateProjectMaterialAssignments(
        input.context,
        save.projectId,
        save.activePhaseId,
        currentState.revision,
        nextState
      );
      return;
    } catch (error) {
      if (!(error instanceof ProjectMaterialRevisionConflictError) || attempt === 2) throw error;
    }
  }
}
