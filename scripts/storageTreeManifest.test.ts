import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareStorageTreeManifests, createStorageTreeManifest } from "./storageTreeManifest";

const roots: string[] = [];

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `arcigy-${label}-`));
  roots.push(root);
  return root;
}

async function fixture(root: string): Promise<void> {
  await mkdir(path.join(root, "clients", "tenant_a", "projects", "project_a", "phases", "phase_a", "exports"), { recursive: true });
  await mkdir(path.join(root, "clients", "tenant_a", "catalog", "modules"), { recursive: true });
  await writeFile(path.join(root, "clients", "tenant_a", "projects", "project_a", "phases", "phase_a", "exports", "quote.pdf"), "pdf-content", "utf8");
  await writeFile(path.join(root, "clients", "tenant_a", "catalog", "modules", "module.json"), "{\"version\":1}\n", "utf8");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("storage tree migration evidence", () => {
  it("produces deterministic relative content evidence independent of root and capture time", async () => {
    const sourceRoot = await tempRoot("storage-source");
    const targetRoot = await tempRoot("storage-target");
    await fixture(sourceRoot);
    await fixture(targetRoot);

    const source = await createStorageTreeManifest(sourceRoot, "2026-07-16T10:00:00Z");
    const target = await createStorageTreeManifest(targetRoot, "2026-07-16T11:00:00Z");
    const comparison = compareStorageTreeManifests(source, target);

    expect(source.root).not.toBe(target.root);
    expect(source.totalFiles).toBe(2);
    expect(source.totalBytes).toBeGreaterThan(0);
    expect(source.treeSha256).toBe(target.treeSha256);
    expect(comparison).toMatchObject({ exact: true, mismatches: [] });
    expect(source.entries.every((entry) => entry.path === "." || !path.isAbsolute(entry.path))).toBe(true);
    expect(source.entries.every((entry) => !entry.path.includes("\\"))).toBe(true);
  });

  it("reports changed content, missing files, and unexpected target files exactly", async () => {
    const sourceRoot = await tempRoot("storage-source");
    const targetRoot = await tempRoot("storage-target");
    await fixture(sourceRoot);
    await fixture(targetRoot);
    await writeFile(path.join(targetRoot, "clients", "tenant_a", "catalog", "modules", "module.json"), "{\"version\":2}\n", "utf8");
    await rm(path.join(targetRoot, "clients", "tenant_a", "projects", "project_a", "phases", "phase_a", "exports", "quote.pdf"));
    await writeFile(path.join(targetRoot, "unexpected.txt"), "unexpected", "utf8");

    const comparison = compareStorageTreeManifests(
      await createStorageTreeManifest(sourceRoot),
      await createStorageTreeManifest(targetRoot)
    );

    expect(comparison.exact).toBe(false);
    expect(comparison.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "clients/tenant_a/catalog/modules/module.json", field: "sha256" }),
      expect.objectContaining({ path: "clients/tenant_a/projects/project_a/phases/phase_a/exports/quote.pdf", field: "missing_in_target" }),
      expect.objectContaining({ path: "unexpected.txt", field: "missing_in_source" })
    ]));
  });

  it("detects permission drift as part of exact redeploy evidence", async () => {
    if (process.platform === "win32") return;
    const sourceRoot = await tempRoot("storage-source");
    const targetRoot = await tempRoot("storage-target");
    await fixture(sourceRoot);
    await fixture(targetRoot);
    const targetFile = path.join(targetRoot, "clients", "tenant_a", "catalog", "modules", "module.json");
    await chmod(targetFile, 0o600);

    const comparison = compareStorageTreeManifests(
      await createStorageTreeManifest(sourceRoot),
      await createStorageTreeManifest(targetRoot)
    );
    expect(comparison.mismatches).toContainEqual(expect.objectContaining({
      path: "clients/tenant_a/catalog/modules/module.json",
      field: "mode"
    }));
  });

  it("fails closed on symbolic links instead of following data outside the selected root", async () => {
    const root = await tempRoot("storage-symlink");
    const outside = await tempRoot("storage-outside");
    await writeFile(path.join(outside, "secret.txt"), "outside", "utf8");
    try {
      await symlink(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    await expect(createStorageTreeManifest(root)).rejects.toThrow("symbolic links are not allowed");
  });

  it("rejects tampered manifests before comparing them", async () => {
    const root = await tempRoot("storage-tamper");
    await fixture(root);
    const manifest = await createStorageTreeManifest(root);
    const tampered = structuredClone(manifest);
    tampered.entries.find((entry) => entry.type === "file")!.sizeBytes += 1;

    expect(() => compareStorageTreeManifests(manifest, tampered)).toThrow("manifest digest is invalid");
  });

  it("rejects malformed paths and entries even when a caller bypasses TypeScript", async () => {
    const root = await tempRoot("storage-malformed");
    await fixture(root);
    const manifest = await createStorageTreeManifest(root);
    const malformed = structuredClone(manifest);
    malformed.entries[1]!.path = "../outside";

    expect(() => compareStorageTreeManifests(manifest, malformed)).toThrow("metadata or entries are invalid");
    expect(() => compareStorageTreeManifests(manifest, {
      ...manifest,
      entries: [null]
    } as unknown as typeof manifest)).toThrow("metadata or entries are invalid");
  });

  it("contains no filesystem mutation or subprocess execution path", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(path.join(process.cwd(), "scripts", "storageTreeManifest.ts"), "utf8"));
    expect(source).not.toMatch(/node:child_process|\b(?:copyFile|cp|rename|rm|unlink|writeFile|mkdir)\b/u);
    expect(source).toContain("permanently read-only");
  });
});
