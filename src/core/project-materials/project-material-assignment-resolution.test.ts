import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import type { ClientCatalog } from "../catalog/catalog-types";
import { createDefaultProjectMaterialAssignments } from "./project-material-business";
import {
  projectMaterialScopeAssignmentId,
  resolveEffectiveProjectMaterialAssignment
} from "./project-material-assignment-resolution";

const NOW = "2026-07-18T20:30:00.000Z";
const catalog = (): ClientCatalog => ({ clientId: "client_test", ...createSystemCatalogSeed() });
const corpusItem = { id: "corpus-panel", category: "corpus" as const };
const hingeItem = { id: "hinge-1", category: "hinge" as const };

describe("effective project material assignment", () => {
  it.each([corpusItem, hingeItem])("inherits the global material or hardware assignment for $category", (item) => {
    const state = createDefaultProjectMaterialAssignments(catalog(), NOW);
    const general = state.assignments.find((assignment) => assignment.category === item.category)!;

    expect(resolveEffectiveProjectMaterialAssignment(state.assignments, "module:base-1", item)).toEqual({
      assignmentId: projectMaterialScopeAssignmentId("module:base-1", item),
      assignment: general,
      source: "general"
    });
  });

  it("preserves legacy per-part edge choices until the user explicitly assigns a shared group", () => {
    const state=createDefaultProjectMaterialAssignments(catalog(),NOW);
    const group=state.assignments.find(a=>a.category==="edge_other")!;
    const item={id:"side-panels-edge",category:"edge_other" as const,edgeGroupId:group.assignmentId};
    const override={...structuredClone(group),assignmentId:projectMaterialScopeAssignmentId("module:base-1",item),materialId:"legacy-specific-edge"};
    state.assignments.push(override);
    expect(resolveEffectiveProjectMaterialAssignment(state.assignments,"module:base-1",item).assignment).toBe(override);
    expect(resolveEffectiveProjectMaterialAssignment(state.assignments,"module:base-1",{...item,edgeGroupExplicit:true}).assignment).toBe(group);
  });

  it("keeps an individual module override while other parts continue following later global changes", () => {
    const state = createDefaultProjectMaterialAssignments(catalog(), NOW);
    const originalGeneral = state.assignments.find((assignment) => assignment.category === "corpus")!;
    const override = {
      ...structuredClone(originalGeneral),
      assignmentId: projectMaterialScopeAssignmentId("module:base-1", corpusItem),
      materialId: "module-specific-material"
    };
    state.assignments.push(override);

    expect(resolveEffectiveProjectMaterialAssignment(state.assignments, "module:base-1", corpusItem)).toMatchObject({
      assignment: { materialId: "module-specific-material" },
      source: "override"
    });

    originalGeneral.materialId = "new-global-material";
    expect(resolveEffectiveProjectMaterialAssignment(state.assignments, "module:base-2", corpusItem)).toMatchObject({
      assignment: { materialId: "new-global-material" },
      source: "general"
    });
    expect(resolveEffectiveProjectMaterialAssignment(state.assignments, "module:base-1", corpusItem)).toMatchObject({
      assignment: { materialId: "module-specific-material" },
      source: "override"
    });
  });
});
