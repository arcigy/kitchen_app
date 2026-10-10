import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import {
  createProject,
  downloadProject,
  deleteProject,
  importProjectFile,
  ProjectApiError,
  restoreProjectVersion,
  saveProject
} from "./projectApi";

const appState = {
  layout: {},
  kitchen: {},
  modules: [],
  materialAssignments: createEmptyProjectMaterialAssignmentsState(),
  scene: {}
} satisfies ProjectSaveFile["appState"];

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("project API", () => {
  it("sends a new project request with only its required name", async () => {
    const project = { projectId: "minimal_project", name: "Minimal project" };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ project }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createProject({ name: "Minimal project" });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toEqual({ name: "Minimal project" });
  });

  it("keeps a project download anchor attached until after the browser dispatches the download", async () => {
    vi.useFakeTimers();
    const anchor = {
      click: vi.fn(),
      download: "",
      href: "",
      isConnected: false,
      remove() { this.isConnected = false; },
      style: {}
    };
    const append = vi.fn((node: unknown) => { anchor.isConnected = true; return node; });
    vi.stubGlobal("document", { body: { appendChild: append }, createElement: vi.fn(() => anchor) });
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout });
    const createObjectURL = vi.fn(() => "blob:project-file");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["encrypted-file"]), { status: 200 })));

    await downloadProject({ projectId: "project_1", name: "Kitchen" } as ProjectMetadata);

    expect(anchor.isConnected).toBe(true);
    expect(anchor.download).toBe("Kitchen.fqp");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(anchor.isConnected).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:project-file");
    vi.useRealTimers();
  });

  it("persists the BOM-derived material quantity snapshot with the current app state", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ save: {projectId: "project_1", appState} }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);
    const bomSnapshot = {
      materialQuantities: [{ category: "corpus", quantity: 2.5, unit: "m2" }]
    };

    await saveProject("project_1", appState, "editing_1", bomSnapshot, 7);

    const request = fetchMock.mock.calls[0]?.[1];
    if (!request) throw new Error("Missing fetch request options.");
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.bomSnapshot).toEqual(bomSnapshot);
    expect(body.appState).toEqual(appState);
    expect(body.expectedSaveRevision).toBe(7);
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^project-save:/);
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

  it("sends a fresh idempotency key for create and import user actions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(
      (String(input).endsWith("/import") || String(input).endsWith("/restore")) ? { save: {projectId: "project_1", appState} } : { project: {} }
    ), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createProject({ name: "Kitchen", address: "Main 1", contactName: "Jane" });
    await importProjectFile({ text: async () => "encrypted-envelope" } as File);
    await restoreProjectVersion("project-1", 2);

    const createHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const importHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    const restoreHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(createHeaders["Idempotency-Key"]).toMatch(/^project-create:/);
    expect(importHeaders["Idempotency-Key"]).toMatch(/^project-import:/);
    expect(importHeaders["Idempotency-Key"]).not.toBe(createHeaders["Idempotency-Key"]);
    expect(restoreHeaders["Idempotency-Key"]).toMatch(/^project-restore:/);
  });

  it("reports a plain-text server error without leaking a JSON parser failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));

    await expect(deleteProject("missing_project")).rejects.toThrow("Not found");
  });

  it("preserves structured revision-conflict details for recovery policy", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: "Project changed since it was loaded.",
      code: "PROJECT_SAVE_REVISION_CONFLICT",
      expectedRevision: 4,
      currentRevision: 5,
      requestId: "request_1"
    }), { status: 409, headers: { "Content-Type": "application/json" } })));

    const error = await saveProject("project_1", appState, "edit_1", undefined, 4).catch((caught) => caught);

    expect(error).toBeInstanceOf(ProjectApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "PROJECT_SAVE_REVISION_CONFLICT",
      expectedRevision: 4,
      currentRevision: 5,
      requestId: "request_1"
    });
  });

  it("keeps non-JSON authorization failures structured instead of treating them as offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Unauthorized", { status: 401 })));

    const error = await saveProject("project_1", appState, "edit_1", undefined, 4).catch((caught) => caught);

    expect(error).toBeInstanceOf(ProjectApiError);
    expect(error).toMatchObject({ status: 401, code: "PROJECT_REQUEST_FAILED" });
  });
});
