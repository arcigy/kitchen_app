import { describe, expect, it } from "vitest";
import type { MaterialDefinition } from "../catalog/catalog-types";
import type { ProjectMaterialAssignment } from "./project-material-types";
import {
  collectProjectMaterialCopyCandidates,
  copyProjectMaterialAssignmentToScope,
  resolveProjectMaterialCopyCandidate
} from "./project-material-copy";

function material(id: string, displayName: string, updatedAt: string, materialCode = id): ProjectMaterialAssignment {
  const definition: MaterialDefinition = {
    id,
    entityType: "material",
    materialCode,
    materialType: "board",
    name: displayName,
    displayName,
    category: "board",
    baseMaterial: "dtd",
    decor: displayName,
    color: "white",
    finish: "matte",
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [18],
    defaultThicknessMm: 18,
    isActive: true,
    tags: [],
    preview: { colorHex: "#ffffff", roughness: 0.5, metalness: 0 },
    boardFamily: "body"
  };
  return {
    assignmentId: `material-assignment:${id}`,
    category: "corpus",
    kind: "material",
    materialId: id,
    thicknessMm: 18,
    customValues: { supplierBridge: { supplierId: "demos", supplierProductCode: materialCode } },
    source: "user",
    snapshots: {
      material: { definition, unitPrice: 12.5, currency: "CZK", priceListId: "prices", capturedAt: updatedAt }
    },
    updatedAt
  };
}

describe("project material copying", () => {
  it("deduplicates current project materials and resolves a copied plain display name", () => {
    const older = material("white", "Biela hladká", "2026-01-01T00:00:00.000Z");
    const newer = { ...material("white", "Biela hladká", "2026-02-01T00:00:00.000Z"), assignmentId: "material-assignment:module:a:corpus:left" };
    const candidates = collectProjectMaterialCopyCandidates([older, newer], "corpus");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.assignment.assignmentId).toBe(newer.assignmentId);
    expect(resolveProjectMaterialCopyCandidate(candidates, "  BIELA   HLADKÁ ")).toEqual({
      ok: true,
      candidate: candidates[0]
    });
  });

  it("requires the code-qualified label when two project materials have the same name", () => {
    const candidates = collectProjectMaterialCopyCandidates([
      material("white-a", "Biela", "2026-01-01T00:00:00.000Z", "A1"),
      material("white-b", "Biela", "2026-01-02T00:00:00.000Z", "B2")
    ], "corpus");

    expect(resolveProjectMaterialCopyCandidate(candidates, "Biela")).toEqual({ ok: false, reason: "ambiguous" });
    expect(resolveProjectMaterialCopyCandidate(candidates, "Biela · B2")).toEqual({
      ok: true,
      candidate: expect.objectContaining({ key: "material:white-b" })
    });
  });

  it("copies the full project assignment snapshot under the stable scoped id", () => {
    const source = material("oak", "Dub", "2026-01-01T00:00:00.000Z", "OAK-18");
    const copied = copyProjectMaterialAssignmentToScope(
      source,
      "module:base-1",
      { id: "left-side", category: "corpus" },
      "2026-03-01T00:00:00.000Z"
    );

    expect(copied.assignmentId).toBe("material-assignment:module:base-1:corpus:left-side");
    expect(copied.snapshots).toEqual(source.snapshots);
    expect(copied.customValues).toEqual(source.customValues);
    expect(copied.snapshots).not.toBe(source.snapshots);
    expect(copied.updatedAt).toBe("2026-03-01T00:00:00.000Z");
  });
});
