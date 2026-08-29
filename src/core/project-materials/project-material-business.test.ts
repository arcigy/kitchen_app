import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import type { ClientCatalog } from "../catalog/catalog-types";
import {
  MATERIAL_ASSIGNMENT_CATEGORIES,
  createDefaultProjectMaterialAssignments,
  createProjectMaterialsView,
  normalizeAutoProjectMaterialAssignments,
  validateProjectMaterialAssignments
} from "./project-material-business";

const NOW = "2026-07-09T20:00:00.000Z";
const testCatalog = (): ClientCatalog => ({ clientId: "client_test", ...createSystemCatalogSeed() });

describe("project material business rules", () => {
  it("warns when a captured edge width does not match its board thickness", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const corpus = state.assignments.find((item) => item.category === "corpus")!;
    const edge = state.assignments.find((item) => item.category === "edge_other")!;
    corpus.thicknessMm = 18;
    edge.customValues = { supplierBridge: { edgeWidthMm: 22, edgeThicknessMm: 1 } };

    expect(validateProjectMaterialAssignments(state, catalog)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `edge-width-mismatch:${edge.assignmentId}`, affectedCategory: "edge_other" })
    ]));
  });

  it("keeps the canonical category order and creates tenant-catalog defaults with snapshots", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);

    expect(MATERIAL_ASSIGNMENT_CATEGORIES.map((item) => item.category)).toEqual([
      "corpus",
      "front",
      "worktop",
      "plinth",
      "back",
      "drawer_bottom",
      "edge_front",
      "edge_other",
      "handle",
      "hinge",
      "runner",
      "lift_up",
      "leg",
      "fastener",
      "other_component"
    ]);
    expect(state.assignments).toHaveLength(MATERIAL_ASSIGNMENT_CATEGORIES.length - 1);
    expect(state.assignments.some((item) => item.category === "runner")).toBe(false);
    const corpus = state.assignments.find((item) => item.category === "corpus")!;
    expect(corpus.materialId).toBe(catalog.kitchenDefaults.carcassMaterialId);
    expect(corpus.snapshots.material?.definition.id).toBe(corpus.materialId);
    expect(corpus.snapshots.material?.priceListId).toBe(catalog.priceList.id);
    expect(corpus.updatedAt).toBe(NOW);
    const plinth = state.assignments.find((item) => item.category === "plinth")!;
    expect(plinth.materialId).toBeUndefined();
    expect(plinth.snapshots.material).toBeUndefined();
  });

  it("prefers current project material IDs over tenant defaults", () => {
    const catalog = testCatalog();
    const projectFront = catalog.materials.find((item) =>
      item.materialType === "board" && item.boardFamily === "front" && item.id !== catalog.kitchenDefaults.frontMaterialId
    )!;

    const state = createDefaultProjectMaterialAssignments(catalog, NOW, { front: projectFront.id });
    const front = state.assignments.find((item) => item.category === "front")!;

    expect(front.materialId).toBe(projectFront.id);
    expect(front.snapshots.material?.definition.id).toBe(projectFront.id);
  });

  it("reports duplicate, inactive and unsupported assignments without changing snapshots", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const corpus = state.assignments.find((item) => item.category === "corpus")!;
    const material = catalog.materials.find((item) => item.id === corpus.materialId)!;
    material.isActive = false;
    corpus.thicknessMm = 999;
    state.assignments.push({ ...structuredClone(corpus), assignmentId: "duplicate-corpus" });
    const originalSnapshot = structuredClone(corpus.snapshots.material);

    const warnings = validateProjectMaterialAssignments(state, catalog);

    expect(warnings.map((item) => item.id)).toContain("duplicate:corpus:default");
    expect(warnings.map((item) => item.id)).toContain(`inactive-material:${corpus.assignmentId}`);
    expect(warnings.map((item) => item.id)).toContain(`unsupported-thickness:${corpus.assignmentId}`);
    expect(corpus.snapshots.material).toEqual(originalSnapshot);
  });

  it("does not treat module overrides or supported split edges as duplicate general assignments", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const corpus = state.assignments.find((item) => item.category === "corpus")!;
    const edge = state.assignments.find((item) => item.category === "edge_front")!;
    state.assignments.push({ ...structuredClone(corpus), assignmentId: "material-assignment:module:base-1:corpus:side" });
    state.assignments.push({ ...structuredClone(edge), assignmentId: "material-assignment:edge_front:split:2" });

    const warningIds = validateProjectMaterialAssignments(state, catalog).map((item) => item.id);

    expect(warningIds).not.toContain("duplicate:corpus");
    expect(warningIds).not.toContain("duplicate:edge_front");
  });

  it("uses external quantities to warn only when a used optional category is unassigned", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const handle = state.assignments.find((item) => item.category === "handle")!;
    handle.componentId = undefined;
    handle.snapshots.component = undefined;

    const view = createProjectMaterialsView(
      state,
      [{ category: "handle", quantity: 8, unit: "pcs" }],
      catalog
    );

    expect(view.warnings).toContainEqual(expect.objectContaining({ id: "missing-used:handle", affectedCategory: "handle" }));
    expect(view.priceSource.priceListId).toBe(catalog.priceList.id);
    expect(view.priceSource.lastSynchronizedAt).toBeNull();
  });

  it("rejects a linear plinth assignment backed by an area-priced board", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const plinth = state.assignments.find((item) => item.category === "plinth")!;
    const board = catalog.materials.find((item) => item.materialType === "board" && item.boardFamily === "body")!;
    plinth.materialId = board.id;
    plinth.snapshots.material = {
      definition: structuredClone(board),
      unitPrice: catalog.priceList.prices[board.id] ?? null,
      currency: catalog.priceList.currency,
      priceListId: catalog.priceList.id,
      capturedAt: NOW
    };

    expect(validateProjectMaterialAssignments(state, catalog)).toContainEqual(expect.objectContaining({
      id: `pricing-unit:${plinth.assignmentId}`,
      affectedCategory: "plinth"
    }));
  });

  it("replaces obsolete automatic assignments without changing user assignments", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const board = catalog.materials.find((item) => item.materialType === "board" && item.boardFamily === "body")!;
    const plinth = state.assignments.find((item) => item.category === "plinth")!;
    plinth.materialId = board.id;
    plinth.snapshots.material = {
      definition: structuredClone(board),
      unitPrice: catalog.priceList.prices[board.id] ?? null,
      currency: catalog.priceList.currency,
      priceListId: catalog.priceList.id,
      capturedAt: NOW
    };
    const corpus = state.assignments.find((item) => item.category === "corpus")!;
    corpus.source = "user";
    catalog.materials = catalog.materials.filter((item) => item.id !== corpus.materialId);

    const normalized = normalizeAutoProjectMaterialAssignments(state, catalog, NOW);

    expect(normalized.assignments.find((item) => item.category === "plinth")?.materialId).toBeUndefined();
    expect(normalized.assignments.find((item) => item.category === "corpus")?.materialId).toBe(corpus.materialId);
    expect(normalized.revision).toBe(state.revision);
  });

  it("refreshes automatic front assignments when the tenant default changes and preserves user choices", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const originalFront = state.assignments.find((item) => item.category === "front")!;
    const replacementFront = catalog.materials.find((item) =>
      item.isActive &&
      item.boardFamily === "front" &&
      item.defaultThicknessMm === 18 &&
      item.id !== originalFront.materialId
    )!;
    catalog.kitchenDefaults.frontMaterialId = replacementFront.id;

    const normalized = normalizeAutoProjectMaterialAssignments(state, catalog, "2026-07-13T18:00:00.000Z");
    const normalizedFront = normalized.assignments.find((item) => item.category === "front")!;
    expect(normalizedFront.materialId).toBe(replacementFront.id);
    expect(normalizedFront.thicknessMm).toBe(18);
    expect(normalizedFront.snapshots.material?.definition.id).toBe(replacementFront.id);

    originalFront.source = "user";
    const userNormalized = normalizeAutoProjectMaterialAssignments(state, catalog, "2026-07-13T18:00:00.000Z");
    expect(userNormalized.assignments.find((item) => item.category === "front")?.materialId).toBe(originalFront.materialId);
  });

  it("restores missing category skeletons in initialized project state", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    state.assignments = state.assignments.filter((assignment) => assignment.category !== "fastener");

    const normalized = normalizeAutoProjectMaterialAssignments(state, catalog, NOW);

    expect(normalized.assignments).toHaveLength(MATERIAL_ASSIGNMENT_CATEGORIES.length - 1);
    expect(normalized.assignments.find((assignment) => assignment.category === "fastener")).toMatchObject({
      assignmentId: "material-assignment:fastener",
      category: "fastener",
      kind: "component"
    });
    expect(normalized.revision).toBe(state.revision);
  });
});
