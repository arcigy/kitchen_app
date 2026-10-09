import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ClientContext } from "../client/client-context";
import { createFileProjectRepository } from "./project-repository";

describe("file project creation", () => {
  it("persists and reloads a project when only its name is supplied", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-minimal-project-"));
    try {
      const ctx: ClientContext = { userId: "user_test", clientId: "client_test", role: "owner" };
      const repository = createFileProjectRepository(root);
      const project = await repository.createProject(ctx, { name: "Minimal project", location: {}, contact: {} });

      expect(project.location.address).toBe("");
      expect(project.contact.name).toBe("");
      await expect(repository.getProject(ctx, project.projectId)).resolves.toMatchObject({
        name: "Minimal project",
        location: { address: "" },
        contact: { name: "" }
      });
      await expect(repository.listProjects(ctx)).resolves.toContainEqual(expect.objectContaining({ projectId: project.projectId }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
