import type { ClientCatalog, MaterialDefinition } from "../catalog/catalog-types";
import { createDefaultProjectMaterialAssignments } from "../project-materials/project-material-business";
import { isScopedProjectMaterialAssignment } from "../project-materials/project-material-assignment-resolution";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { BODY_EDGE_GROUP, FRONT_EDGE_GROUP } from "./edgeEntities";
export function edgeGroups(state: ProjectMaterialAssignmentsState): ProjectMaterialAssignment[] {
  return state.assignments.filter(a => (a.category === "edge_front" || a.category === "edge_other") && !isScopedProjectMaterialAssignment(a));
}
export function edgeGroupName(group: ProjectMaterialAssignment): string {
  return typeof group.customValues.edgeGroupName === "string" ? group.customValues.edgeGroupName
    : group.assignmentId === FRONT_EDGE_GROUP ? "Olepenie frontov" : group.assignmentId === BODY_EDGE_GROUP ? "Olepenie korpusu" : "Skupina olepenia";
}
export function edgeGroupColor(groupId: string): string {
  const colors = ["#15803d", "#0369a1", "#a21caf", "#b45309", "#4338ca", "#be123c"];
  let hash = 0; for (const char of groupId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length]!;
}
export function ensureEdgeGroups(state: ProjectMaterialAssignmentsState | undefined, catalog: ClientCatalog): ProjectMaterialAssignmentsState {
  const next = structuredClone(state?.initialized ? state : createDefaultProjectMaterialAssignments(catalog));
  const defaults = createDefaultProjectMaterialAssignments(catalog);
  for (const id of [FRONT_EDGE_GROUP, BODY_EDGE_GROUP]) if (!next.assignments.some(a=>a.assignmentId === id)) {
    const source = defaults.assignments.find(a=>a.assignmentId === id); if (source) next.assignments.push(source);
  }
  return next;
}
export function updateEdgeGroup(state: ProjectMaterialAssignmentsState, groupId: string, name: string, material: MaterialDefinition | null, catalog: ClientCatalog): ProjectMaterialAssignmentsState {
  if (!name.trim()) throw new Error("Zadajte názov skupiny olepenia.");
  if (material && (material.materialType !== "edge" || material.pricingUnit !== "lm")) throw new Error("Pre olepenie vyberte hranovací materiál s cenou za bežný meter.");
  const next = structuredClone(state); const now = new Date().toISOString();
  const previous = edgeGroups(next).find(a=>a.assignmentId === groupId);
  const assignment: ProjectMaterialAssignment = {
    assignmentId:groupId, category:previous?.category ?? "edge_other", kind:"material", source:"user", updatedAt:now,
    customValues:{...previous?.customValues,edgeGroupName:name.trim()}, snapshots:{},
    ...(groupId !== BODY_EDGE_GROUP && groupId !== FRONT_EDGE_GROUP ? { variantKey: `edge-group:${groupId}` } : {})
  };
  if (material) {
    assignment.materialId=material.id; assignment.thicknessMm=material.defaultThicknessMm;
    // Retain supplier price evidence when merely renaming a group.
    assignment.snapshots.material = previous?.snapshots.material?.definition.id === material.id ? previous.snapshots.material : {
      definition:structuredClone(material), unitPrice:catalog.priceList.prices[material.id] ?? null,
      currency:catalog.priceList.currency, priceListId:catalog.priceList.id, capturedAt:now
    };
    if (previous?.materialId !== material.id) delete assignment.customValues.supplierBridge;
  } else delete assignment.customValues.supplierBridge;
  const index=next.assignments.findIndex(a=>a.assignmentId === groupId);
  if(index<0) next.assignments.push(assignment); else next.assignments[index]=assignment;
  next.revision++; next.updatedAt=now; return next;
}

const runtimeGroups = new WeakMap<ClientCatalog, Map<string, ProjectMaterialAssignment>>();
export function setRuntimeEdgeGroups(catalog: ClientCatalog, state: ProjectMaterialAssignmentsState) { runtimeGroups.set(catalog, new Map(edgeGroups(state).map(group => [group.assignmentId, structuredClone(group)]))); }
export function runtimeEdgeGroup(catalog: ClientCatalog, id: string) { return runtimeGroups.get(catalog)?.get(id); }
