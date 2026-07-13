import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { deleteProject, saveProject } from "./projectApi";

describe("project API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists the BOM-derived material quantity snapshot with the current app state", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ save: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const appState: ProjectSaveFile["appState"] = {
      layout: {},
      kitchen: {},
      modules: [],
      materialAssignments: createEmptyProjectMaterialAssignmentsState(),
      scene: {}
    };
    const bomSnapshot = {
      materialQuantities: [{ category: "corpus", quantity: 2.5, unit: "m2" }]
    };

    await saveProject("project_1", appState, "editing_1", bomSnapshot);

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request) throw new Error("Missing fetch request options.");
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.bomSnapshot).toEqual(bomSnapshot);
    expect(body.appState).toEqual(appState);
  });

  it("deletes a project through the tenant-authenticated project route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteProject("project/a");

    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project%2Fa", {
      method: "DELETE",
      credentials: "include"
    });
  });

  it("reports a plain-text server error without leaking a JSON parser failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));

    await expect(deleteProject("missing_project")).rejects.toThrow("Not found");
  });
});
