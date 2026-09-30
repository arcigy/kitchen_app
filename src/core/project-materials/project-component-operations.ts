import { getMaterialAssignmentCategoryDefinition, isComponentAllowedForCategory } from "./project-material-business";
import type { ClientCatalog } from "../catalog/catalog-types";
import type { MaterialAssignmentCategory, ProjectMaterialAssignment, ProjectMaterialAssignmentsState, ProjectMaterialScope } from "./project-material-types";
import type { ProjectComponentValues } from "./project-component-values";
import { projectMaterialScopeAssignmentId, resolveEffectiveProjectMaterialAssignment } from "./project-material-assignment-resolution";
import { validateProjectMaterialAssignmentsState } from "./project-material-validation";

export type ProjectComponentTarget = { scopeId: string; itemId: string; category: MaterialAssignmentCategory };
export type ProjectComponentOperation =
  | { type: "set_component_values"; assignmentId?: string; target?: ProjectComponentTarget; componentId?: string; values: ProjectComponentValues | null }
  | { type: "add_component"; id: string; scopeId: string; label: string; componentId?: string; values: ProjectComponentValues };

export function applyProjectComponentOperation(state: ProjectMaterialAssignmentsState, operation: ProjectComponentOperation,
  scopes: readonly ProjectMaterialScope[], catalog: ClientCatalog, now: string): ProjectMaterialAssignmentsState {
  const next = structuredClone(state);
  let assignment: ProjectMaterialAssignment;
  if (operation.type === "add_component") {
    if (!operation.id || !/^[a-zA-Z0-9_-]{1,100}$/.test(operation.id)) throw new Error("Neplatné ID komponentu.");
    if (operation.scopeId !== "project" && !scopes.some(scope => scope.id === operation.scopeId && scope.kind === "module")) throw new Error("Skrinka pre doplnok už neexistuje.");
    if (!operation.label?.trim()) throw new Error("Zadajte názov komponentu.");
    const component = operation.componentId ? catalog.components.find(item => item.id === operation.componentId && item.isActive) : undefined;
    if (operation.componentId && !component) throw new Error("Vybraný komponent neexistuje.");
    assignment = {
      assignmentId: `material-assignment:extra:${operation.id}`, category: "other_component", kind: "component",
      extraComponent: { scopeId: operation.scopeId, label: operation.label.trim() }, projectValues: structuredClone(operation.values),
      customValues: {}, snapshots: {}, source: "user", updatedAt: now
    };
    if (next.assignments.some(item => item.assignmentId === assignment.assignmentId)) throw new Error("Doplnok s týmto ID už existuje.");
    if (component) {
      assignment.componentId = component.id;
      assignment.snapshots.component = { definition: structuredClone(component), unitPrice: catalog.priceList.prices[component.id] ?? null,
        currency: catalog.priceList.currency, priceListId: catalog.priceList.id, capturedAt: now };
    }
  } else {
    if (operation.target) {
      const target = operation.target;
      const item = scopes.find(scope => scope.id === target.scopeId)?.items.find(item => item.id === target.itemId && item.category === target.category);
      if (item && getMaterialAssignmentCategoryDefinition(item.category).kind !== "component") throw new Error("Vyberte komponent.");
      if (!item) throw new Error("Komponent už nie je v aktuálnom kusovníku.");
      const effective = resolveEffectiveProjectMaterialAssignment(next.assignments, target.scopeId, item).assignment;
      assignment = effective ? structuredClone(effective) : {
        assignmentId: "", category: item.category, kind: "component", customValues: {}, snapshots: {}, source: "user", updatedAt: now
      };
      if (!assignment.extraComponent) assignment.assignmentId = projectMaterialScopeAssignmentId(target.scopeId, item);
    } else {
      const existing = next.assignments.find(item => item.assignmentId === operation.assignmentId);
      if (!existing) throw new Error("Priradenie komponentu už neexistuje.");
      assignment = structuredClone(existing);
    }
    if (assignment.kind !== "component") throw new Error("Toto nastavenie je určené pre komponenty.");
    if (operation.values === null) delete assignment.projectValues;
    else assignment.projectValues = structuredClone(operation.values);
  }
  if (operation.type === "set_component_values" && operation.componentId !== undefined && operation.componentId !== assignment.componentId) {
    const component = catalog.components.find(item => item.id === operation.componentId && item.isActive && (assignment.extraComponent || isComponentAllowedForCategory(item, assignment.category)));
    if (!component) throw new Error("Komponent nie je platný pre túto kategóriu.");
    assignment.componentId = component.id;
    assignment.snapshots.component = { definition: structuredClone(component), unitPrice: catalog.priceList.prices[component.id] ?? null, currency: catalog.priceList.currency, priceListId: catalog.priceList.id, capturedAt: now };
  }
  assignment.source = "user"; assignment.updatedAt = now;
  next.assignments = next.assignments.filter(item => item.assignmentId !== assignment.assignmentId);
  next.assignments.push(assignment); next.revision++; next.updatedAt = now;
  validateProjectMaterialAssignmentsState(next);
  return next;
}
