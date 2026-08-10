import { afterEach, describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import {
  createDefaultProjectMaterialAssignments,
  createProjectMaterialsView
} from "../core/project-materials/project-material-business";
import {
  copyProjectMaterialAssignment,
  loadProjectMaterials,
  lookupProjectMaterialCatalogItem,
  removeProjectMaterialAssignment,
  updateProjectMaterialAssignment
} from "./projectMaterialsApi";

const NOW = "2026-07-09T20:00:00.000Z";
const testCatalog = (): ClientCatalog => ({ clientId: "client_test", ...createSystemCatalogSeed() });

describe("project materials API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads only the project materials view with the authenticated session cookie", async () => {
    const catalog = testCatalog();
    const view = createProjectMaterialsView(createDefaultProjectMaterialAssignments(catalog, NOW), [], catalog);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ view }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const loaded = await loadProjectMaterials("project one");

    expect(loaded.assignments.assignments).toHaveLength(view.assignments.assignments.length);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project%20one/materials",
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toBe("/api/catalog");
  });

  it("looks up one exact ID without requesting the full catalog", async () => {
    const catalog = testCatalog();
    const material = catalog.materials.find((item) => item.boardFamily === "front")!;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ material, unitPrice: 31.5 }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await lookupProjectMaterialCatalogItem("front", material.id);

    expect(result).toEqual({ kind: "material", definition: material, unitPrice: 31.5 });
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("/api/catalog/lookup?");
    expect(requestUrl).toContain(`id=${encodeURIComponent(material.id)}`);
    expect(requestUrl).toContain("family=front");
    expect(requestUrl).not.toBe("/api/catalog");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });

  it("sends revision and one assignment, and treats an unknown exact ID as a normal miss", async () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const view = createProjectMaterialsView(state, [], catalog);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ materials: view }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupProjectMaterialCatalogItem("front", "missing.id")).resolves.toBeNull();
    const assignment = state.assignments.find((item) => item.category === "front")!;
    await updateProjectMaterialAssignment("project_1", { revision: state.revision, assignment });

    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/projects/project_1/materials");
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ revision: state.revision, assignment });
  });

  it("copies a complete project assignment through a stable scoped target operation", async () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const view = createProjectMaterialsView(state, [], catalog);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ view }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await copyProjectMaterialAssignment("project copy", {
      revision: state.revision,
      sourceAssignmentId: state.assignments[0]!.assignmentId,
      target: { scopeId: "module:m1", itemId: "left-side", category: "corpus" }
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects/project%20copy/materials");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      revision: state.revision,
      operation: {
        type: "copy_assignment",
        sourceAssignmentId: state.assignments[0]!.assignmentId,
        target: { scopeId: "module:m1", itemId: "left-side", category: "corpus" }
      }
    });
  });

  it("removes one scoped override through a revision-safe operation", async () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const view = createProjectMaterialsView(state, [], catalog);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ view }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await removeProjectMaterialAssignment("project remove", {
      revision: 7,
      assignmentId: "material-assignment:module:m1:front:door"
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/projects/project%20remove/materials");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      revision: 7,
      operation: {
        type: "remove_assignment",
        assignmentId: "material-assignment:module:m1:front:door"
      }
    });
  });
});
