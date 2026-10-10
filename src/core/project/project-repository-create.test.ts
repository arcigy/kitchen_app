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
  it("keeps project metadata readable while another request updates it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-concurrent-project-"));
    try {
      const ctx: ClientContext = { userId: "user_test", clientId: "client_test", role: "owner" };
      const repository = createFileProjectRepository(root);
      const project = await repository.createProject(ctx, { name: "Concurrent project", location: {}, contact: {} });
      const errors: unknown[] = [];
      await Promise.all([
        (async () => {
          for (let index = 0; index < 100; index += 1) {
            await repository.saveProjectMetadata(ctx, { ...project, name: `Concurrent project ${index}` });
          }
        })(),
        (async () => {
          for (let index = 0; index < 200; index += 1) {
            try {
              const loaded = await repository.getProject(ctx, project.projectId);
              expect(loaded.projectId).toBe(project.projectId);
              expect(loaded.name).toMatch(/^Concurrent project/);
            } catch (error) {
              errors.push(error);
            }
          }
        })()
      ]);
      expect(errors.map(error => error instanceof Error ? error.message : String(error))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
