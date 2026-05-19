import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertDevOnlyDebugOutputAllowed } from "./debug-output-guard";
import {
  assertClientProjectPhaseAccess,
  assertProjectBelongsToClient,
  getProjectMetaPath,
  readProjectOwnershipMetadata
} from "./project-ownership";

describe("project ownership metadata", () => {
  let projectRoot = "";
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    projectRoot = await createTempProjectRoot();
  });

  afterEach(async () => {
    process.env.NODE_ENV = previousNodeEnv;
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("allows access when metadata matches the session client", async () => {
    await assertClientProjectPhaseAccess(projectRoot, "client_a", "project_a", "phase_a", { mode: "write" });

    await expect(assertClientProjectPhaseAccess(projectRoot, "client_a", "project_a", "phase_a")).resolves.toBeUndefined();
  });

  it("denies access when metadata belongs to another client", async () => {
    const metaPath = getProjectMetaPath(projectRoot, "client_a", "project_a");
    await mkdir(path.dirname(metaPath), { recursive: true });
    await writeFile(
      metaPath,
      JSON.stringify({
        version: 1,
        clientId: "client_b",
        projectId: "project_a",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        phases: ["phase_a"]
      }),
      "utf-8"
    );

    await expect(assertClientProjectPhaseAccess(projectRoot, "client_a", "project_a", "phase_a")).rejects.toThrow(
      "Project does not belong to the current client."
    );
  });

  it("denies missing metadata by default", async () => {
    await expect(assertClientProjectPhaseAccess(projectRoot, "client_a", "legacy_project", "phase_a")).rejects.toThrow(
      "Project ownership metadata is missing."
    );
  });

  it("allows missing metadata only through explicit safe legacy mode", async () => {
    await expect(
      assertClientProjectPhaseAccess(projectRoot, "client_a", "legacy_project", "phase_a", {
        allowLegacyReadWithoutMeta: true
      })
    ).resolves.toBeUndefined();
  });

  it("creates metadata for new writes", async () => {
    await assertClientProjectPhaseAccess(projectRoot, "client_a", "project_new", "phase_new", { mode: "write" });

    const metadata = await readProjectOwnershipMetadata(projectRoot, "client_a", "project_new");
    expect(metadata).toMatchObject({
      clientId: "client_a",
      projectId: "project_new",
      phases: ["phase_new"]
    });
  });

  it("blocks global debug output paths in production", () => {
    process.env.NODE_ENV = "production";

    expect(() => assertDevOnlyDebugOutputAllowed(path.join(projectRoot, "public", "debug-pdf", "x.json"), projectRoot)).toThrow(
      "Global debug output paths are disabled in production."
    );
    expect(() => assertDevOnlyDebugOutputAllowed(path.join(projectRoot, "outputs", "x.json"), projectRoot)).toThrow(
      "Global debug output paths are disabled in production."
    );
  });

  it("allows non-global tenant storage paths in production", () => {
    process.env.NODE_ENV = "production";

    expect(() =>
      assertDevOnlyDebugOutputAllowed(
        path.join(projectRoot, "storage", "clients", "client_a", "projects", "project_a", "phases", "phase_a", "exports", "x.json"),
        projectRoot
      )
    ).not.toThrow();
  });

  it("keeps direct project checks default-deny without metadata", async () => {
    await expect(assertProjectBelongsToClient(projectRoot, "client_a", "legacy_project")).rejects.toThrow(
      "Project ownership metadata is missing."
    );
  });
});

async function createTempProjectRoot() {
  return path.join(await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "project-ownership-"))), "");
}
