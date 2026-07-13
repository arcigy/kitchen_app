import type { ProjectMaterialAssignment } from "../core/project-materials/project-material-types";
import { validateProjectMaterialAssignmentsState } from "../core/project-materials/project-material-validation";
import { ProjectMaterialRevisionConflictError } from "../core/project/project-repository";
import { createProjectService } from "../core/project/project-service";
import type { SupplierConfirmationApplyInput } from "../core/supplier-bridge/supplier-bridge-service";
import type { SupplierPriceBasis } from "../core/supplier-bridge/supplier-bridge-types";
import { createServerProjectRepository } from "./projectRepository";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function priceBasisMatches(pricingUnit: string, priceBasis: SupplierPriceBasis): boolean {
  return (pricingUnit === "m2" && priceBasis === "m2")
    || (pricingUnit === "lm" && priceBasis === "linear_meter")
    || (pricingUnit === "pcs" && priceBasis === "piece");
}

export function updatedSupplierAssignment(current: ProjectMaterialAssignment, input: SupplierConfirmationApplyInput, now: string): ProjectMaterialAssignment {
  const supplierBridge = record(record(current.customValues).supplierBridge);
  if (supplierBridge.sessionId === input.session.id && supplierBridge.candidateId === input.candidate.id) return current;
  const supplierId = input.item.exactLookup?.supplierId ?? input.session.supplierId;
  const supplierProductCode = input.item.exactLookup?.supplierProductId ?? input.candidate.supplierProductCode;
  const snapshots = structuredClone(current.snapshots);
  const price = input.priceObservation;

  if (current.kind === "material" && snapshots.material) {
    const snapshot = snapshots.material;
    snapshot.definition = {
      ...snapshot.definition,
      displayName: input.candidate.normalizedProduct.displayName,
      name: input.candidate.normalizedProduct.displayName,
      supplierId,
      manufacturer: input.mapping?.manufacturer ?? input.candidate.normalizedProduct.manufacturer ?? snapshot.definition.manufacturer,
      materialCode: input.mapping?.decorCode ?? input.candidate.normalizedProduct.decorCode ?? snapshot.definition.materialCode,
      supplierSource: { supplier: supplierId, supplierProductId: supplierProductCode },
      metadata: {
        ...record(snapshot.definition.metadata),
        supplierProductCode,
        supplierSurfaceCode: input.mapping?.surfaceCode ?? input.candidate.normalizedProduct.surfaceCode,
        supplierProductType: input.mapping?.productType ?? input.candidate.normalizedProduct.productType,
        supplierThicknessMm: input.mapping?.thicknessMm ?? input.candidate.normalizedProduct.thicknessMm,
        supplierWidthMm: input.candidate.normalizedProduct.widthMm
      }
    };
    if (price?.normalizedAmount != null && priceBasisMatches(snapshot.definition.pricingUnit, price.normalizedPriceBasis)) {
      snapshot.unitPrice = price.normalizedAmount;
      snapshot.currency = price.currency;
      snapshot.priceListId = `supplier-observation:${supplierId}`;
      snapshot.capturedAt = price.observedAt;
    }
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
    ...(current.kind === "material" && (input.mapping?.thicknessMm ?? input.candidate.normalizedProduct.thicknessMm) != null
      ? { thicknessMm: input.mapping?.thicknessMm ?? input.candidate.normalizedProduct.thicknessMm ?? undefined }
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

export async function applyConfirmedSupplierCandidateToProject(
  projectRoot: string,
  input: SupplierConfirmationApplyInput
): Promise<void> {
  const repository = createServerProjectRepository({ projectRoot });
  const service = createProjectService(repository);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const save = await service.loadProject(input.context, input.session.projectId);
    const currentState = save.appState.materialAssignments;
    let index = currentState.assignments.findIndex((assignment) => assignment.assignmentId === input.item.materialAssignmentId);
    const now = new Date().toISOString();
    const assignments = structuredClone(currentState.assignments);
    if (index < 0) {
      const base = assignments.find((assignment) => assignment.assignmentId === `material-assignment:${categoryFromAssignmentId(input.item.materialAssignmentId)}`);
      if (!base) throw new Error("Material assignment for supplier sync item no longer exists.");
      assignments.push({ ...structuredClone(base), assignmentId: input.item.materialAssignmentId, updatedAt: now });
      index = assignments.length - 1;
    }
    const assignment = updatedSupplierAssignment(assignments[index]!, input, now);
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

function categoryFromAssignmentId(assignmentId: string): string {
  const parts = assignmentId.split(":");
  if (parts.length === 2) return parts[1] ?? "";
  const category = parts[parts.length - 2];
  return category ?? "";
}
