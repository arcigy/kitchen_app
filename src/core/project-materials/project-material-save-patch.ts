import type { ComponentDefinition, MaterialDefinition } from "../catalog/catalog-types";
import type { ProjectSaveFile } from "../project-save/project-save-types";
import type {
  CatalogItemSnapshot,
  ProjectMaterialAssignmentsState
} from "./project-material-types";
import { validateProjectMaterialAssignmentsState } from "./project-material-validation";

type AnyCatalogSnapshot = CatalogItemSnapshot<MaterialDefinition | ComponentDefinition>;

export type PatchProjectMaterialAssignmentsInput = {
  save: ProjectSaveFile;
  phaseId: string;
  nextState: ProjectMaterialAssignmentsState;
  updatedByUserId: string;
  updatedAt?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeDefinitions(existing: readonly unknown[], incoming: readonly (MaterialDefinition | ComponentDefinition)[]): unknown[] {
  const result = structuredClone([...existing]);
  const indexes = new Map<string, number>();
  result.forEach((item, index) => {
    if (isObject(item) && typeof item.id === "string") indexes.set(item.id, index);
  });
  for (const definition of incoming) {
    const copy = structuredClone(definition);
    const index = indexes.get(definition.id);
    if (index === undefined) {
      indexes.set(definition.id, result.length);
      result.push(copy);
    } else {
      result[index] = copy;
    }
  }
  return result;
}

function mergeIds(existing: readonly string[], incoming: readonly (string | undefined)[]): string[] {
  return [...new Set([...existing, ...incoming.filter((id): id is string => typeof id === "string" && !!id.trim())])].sort();
}

function mergePriceSnapshot(value: unknown, snapshots: readonly AnyCatalogSnapshot[]): Record<string, unknown> {
  const first = snapshots[0];
  const result: Record<string, unknown> = isObject(value)
    ? structuredClone(value)
    : {
      id: first?.priceListId ?? "project-material-snapshot",
      name: "Project material snapshot",
      currency: first?.currency ?? "EUR",
      isActive: true,
      prices: {}
    };
  const targetPriceListId = typeof result.id === "string" ? result.id : first?.priceListId ?? null;
  const targetCurrency = typeof result.currency === "string" ? result.currency : first?.currency;
  const prices = isObject(result.prices) ? { ...result.prices } : {};
  for (const snapshot of snapshots) {
    if (targetPriceListId && snapshot.priceListId && snapshot.priceListId !== targetPriceListId) continue;
    if (targetCurrency && snapshot.currency !== targetCurrency) continue;
    if (snapshot.unitPrice === null) delete prices[snapshot.definition.id];
    else prices[snapshot.definition.id] = snapshot.unitPrice;
  }
  result.prices = prices;
  if (targetPriceListId) result.id = targetPriceListId;
  if (targetCurrency) result.currency = targetCurrency;
  return result;
}

function assignmentSnapshots(state: ProjectMaterialAssignmentsState): {
  materials: CatalogItemSnapshot<MaterialDefinition>[];
  components: CatalogItemSnapshot<ComponentDefinition>[];
} {
  const materials: CatalogItemSnapshot<MaterialDefinition>[] = [];
  const components: CatalogItemSnapshot<ComponentDefinition>[] = [];
  for (const assignment of state.assignments) {
    if (assignment.snapshots.material) materials.push(assignment.snapshots.material);
    if (assignment.snapshots.edgeFront) materials.push(assignment.snapshots.edgeFront);
    if (assignment.snapshots.edgeOther) materials.push(assignment.snapshots.edgeOther);
    if (assignment.snapshots.component) components.push(assignment.snapshots.component);
  }
  return { materials, components };
}

export function patchProjectSaveMaterialAssignments(input: PatchProjectMaterialAssignmentsInput): ProjectSaveFile {
  validateProjectMaterialAssignmentsState(input.nextState, "next project material assignments");
  if (input.save.activePhaseId !== input.phaseId) {
    throw new Error("Project material assignments can only patch the active project phase.");
  }
  const phaseIndex = input.save.phases.findIndex((phase) => phase.phaseId === input.phaseId);
  if (phaseIndex < 0) throw new Error("Project material assignments phase does not exist in the save.");

  const updatedAt = input.updatedAt ?? input.nextState.updatedAt ?? new Date().toISOString();
  const next = structuredClone(input.save);
  const nextState = structuredClone(input.nextState);
  nextState.updatedAt = updatedAt;
  next.appState.materialAssignments = structuredClone(nextState);
  next.phases[phaseIndex] = {
    ...next.phases[phaseIndex],
    materialAssignments: structuredClone(nextState),
    updatedAt
  };

  const snapshots = assignmentSnapshots(nextState);
  const materialDefinitions = snapshots.materials.map((snapshot) => snapshot.definition);
  const componentDefinitions = snapshots.components.map((snapshot) => snapshot.definition);
  const allSnapshots: AnyCatalogSnapshot[] = [...snapshots.materials, ...snapshots.components];
  next.catalogSnapshot = {
    ...next.catalogSnapshot,
    capturedAt: updatedAt,
    usedMaterialIds: mergeIds(next.catalogSnapshot.usedMaterialIds, nextState.assignments.flatMap((assignment) => [
      assignment.materialId,
      assignment.edgeFrontId,
      assignment.edgeOtherId,
      assignment.snapshots.material?.definition.id,
      assignment.snapshots.edgeFront?.definition.id,
      assignment.snapshots.edgeOther?.definition.id
    ])),
    usedComponentIds: mergeIds(next.catalogSnapshot.usedComponentIds, nextState.assignments.flatMap((assignment) => [
      assignment.componentId,
      assignment.snapshots.component?.definition.id
    ])),
    materials: mergeDefinitions(next.catalogSnapshot.materials, materialDefinitions),
    components: mergeDefinitions(next.catalogSnapshot.components, componentDefinitions),
    priceListSnapshot: mergePriceSnapshot(next.catalogSnapshot.priceListSnapshot, allSnapshots)
  };

  if (next.catalogSnapshot.fullCatalog) {
    const fullCatalog = next.catalogSnapshot.fullCatalog;
    next.catalogSnapshot.fullCatalog = {
      ...fullCatalog,
      materials: mergeDefinitions(fullCatalog.materials, materialDefinitions) as MaterialDefinition[],
      components: mergeDefinitions(fullCatalog.components, componentDefinitions) as ComponentDefinition[],
      priceList: mergePriceSnapshot(fullCatalog.priceList, allSnapshots) as typeof fullCatalog.priceList
    };
  }

  next.project = {
    ...next.project,
    updatedAt,
    updatedByUserId: input.updatedByUserId
  };
  next.integrity = {
    ...next.integrity,
    updatedAt,
    savedAt: updatedAt
  };
  return next;
}
