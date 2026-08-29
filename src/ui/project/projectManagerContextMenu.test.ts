// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectMetadata } from "../../core/project/project-types";
import { projectCard } from "./projectManager";

const project: ProjectMetadata = {
  version: 1,
  clientId: "client_test",
  projectId: "project-1",
  name: "Kitchen A",
  location: { address: "Main 1" },
  contact: { name: "Client" },
  status: "draft",
  createdAt: "2026-08-10T08:00:00.000Z",
  updatedAt: "2026-08-10T08:00:00.000Z",
  createdByUserId: "user-1",
  updatedByUserId: "user-1",
  activePhaseId: "phase-1",
  phases: ["phase-1"],
  phaseDetails: []
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("project card context menu", () => {
  it("reuses the real open, export, version, and role-gated delete callbacks", async () => {
    const open = vi.fn();
    const download = vi.fn();
    const versions = vi.fn();
    const remove = vi.fn();
    const card = projectCard(project, [], open, download, versions, remove);
    document.body.append(card);

    card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='project-open']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='project-export']")).not.toBeNull();
    expect(document.querySelector("[data-context-menu-action='project-versions']")).not.toBeNull();
    document.querySelector<HTMLButtonElement>("[data-context-menu-action='project-delete']")?.click();
    await Promise.resolve();
    expect(remove).toHaveBeenCalledOnce();

    const viewerCard = projectCard(project, [], open, download, versions);
    document.body.append(viewerCard);
    viewerCard.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(document.querySelector("[data-context-menu-action='project-delete']")).toBeNull();
  });
});
