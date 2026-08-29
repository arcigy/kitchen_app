import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ClientContext } from "../../core/client/client-context";
import { resolveClientStoragePath } from "../../core/storage/storage-path-resolver";
import { resolveTenantBlenderOutputPath } from "./blenderOutputAccess";

const context: ClientContext = { clientId: "client-a", userId: "user-a", role: "owner" };
const temporaryRoots: string[] = [];

describe("Blender output access", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("accepts only real files with allowed extensions inside the authenticated tenant root", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "arcigy-blender-output-"));
    temporaryRoots.push(projectRoot);
    const clientRoot = resolveClientStoragePath(projectRoot, context);
    await mkdir(clientRoot, { recursive: true });
    const previewPath = path.join(clientRoot, "preview.png");
    await writeFile(previewPath, "png", "utf8");

    await expect(resolveTenantBlenderOutputPath(projectRoot, context, previewPath))
      .resolves.toBe(await realpath(previewPath));

    const disguisedDirectory = path.join(clientRoot, "folder.png");
    await mkdir(disguisedDirectory);
    await expect(resolveTenantBlenderOutputPath(projectRoot, context, disguisedDirectory))
      .rejects.toThrow("Blender output path must be a file.");

    const wrongExtension = path.join(clientRoot, "payload.txt");
    await writeFile(wrongExtension, "not an output", "utf8");
    await expect(resolveTenantBlenderOutputPath(projectRoot, context, wrongExtension))
      .rejects.toThrow("Only .blend and .png Blender outputs can be opened.");
  });
});
