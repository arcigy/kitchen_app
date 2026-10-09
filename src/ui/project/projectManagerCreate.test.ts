// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectMetadata } from "../../core/project/project-types";

vi.mock("../../app/project/projectApi", () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  downloadProject: vi.fn(),
  importProjectFile: vi.fn(),
  listProjectVersions: vi.fn(),
  listProjects: vi.fn(),
  loadProject: vi.fn(),
  loadProjectVersion: vi.fn(),
  ProjectApiError: class ProjectApiError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  restoreProjectVersion: vi.fn()
}));

import {
  createProject,
  listProjects
} from "../../app/project/projectApi";
import { renderProjectManager } from "./projectManager";

const createdProject: ProjectMetadata = {
  version: 1,
  clientId: "client_test",
  projectId: "minimal_project",
  name: "Minimal project",
  location: { address: "" },
  contact: { name: "" },
  status: "draft",
  createdAt: "2026-10-08T00:00:00.000Z",
  updatedAt: "2026-10-08T00:00:00.000Z",
  createdByUserId: "user_test",
  updatedByUserId: "user_test",
  activePhaseId: "phase_1",
  phases: ["phase_1"],
  phaseDetails: [{
    phaseId: "phase_1",
    phaseName: "Fáza 1",
    phaseNumber: 1,
    status: "draft",
    createdAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z"
  }]
};

describe("project manager creation form", () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.append(root);
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(createProject).mockResolvedValue(createdProject);
  });

  afterEach(() => {
    root.remove();
    vi.clearAllMocks();
  });

  it("allows creating a project with only its name", async () => {
    const onSelect = vi.fn();
    renderProjectManager({
      root,
      clientId: "client_test",
      clientName: "Test tenant",
      organizationUsers: [],
      currentUserId: "user_test",
      currentUserRole: "owner",
      onSelect
    });

    await vi.waitFor(() => expect(listProjects).toHaveBeenCalledOnce());
    root.querySelector<HTMLButtonElement>("[data-project-manager-new]")?.click();
    const form = root.querySelector<HTMLFormElement>("[data-project-manager-form]");
    const name = form?.querySelector<HTMLInputElement>('[name="name"]');
    expect(name?.required).toBe(true);
    expect(form?.querySelector<HTMLInputElement>('[name="address"]')?.required).toBe(false);
    expect(form?.querySelector<HTMLInputElement>('[name="contactName"]')?.required).toBe(false);

    if (!form || !name) throw new Error("Project create form did not render.");
    name.value = "Minimal project";
    form.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();

    await vi.waitFor(() => expect(createProject).toHaveBeenCalledOnce());
    expect(createProject).toHaveBeenCalledWith({
      name: "Minimal project",
      address: "",
      city: "",
      contactName: "",
      email: "",
      phone: "",
      notes: ""
    });
    expect(onSelect).toHaveBeenCalledWith({ kind: "created", project: createdProject });
  });
});
