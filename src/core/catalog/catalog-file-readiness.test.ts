import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../client/client-context";
import * as bootstrap from "./catalog-bootstrap";
import { createFileClientCatalogRepository } from "./catalog-file-repository";

const io = vi.hoisted(() => ({
  reads: [] as string[],
  beforeWrite: undefined as ((file: string) => Promise<void>) | undefined
}));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readFile: (...args: Parameters<typeof fs.readFile>) => {
      io.reads.push(String(args[0]));
      return fs.readFile(...args);
    },
    writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
      await io.beforeWrite?.(String(args[0]));
      return fs.writeFile(...args);
    }
  };
});

const ctx: ClientContext = { clientId: "readiness", userId: "fixture", role: "owner" };
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "catalog-readiness-"));
  roots.push(root);
  return root;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(async () => {
  io.beforeWrite = undefined;
  io.reads = [];
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("file catalog request readiness", () => {
  it("loads persisted tenant data without constructing unused full system catalogs", async () => {
    const root = await fixture();
    const repo = createFileClientCatalogRepository(root);
    const catalog = await repo.ensureCatalogExists(ctx);
    catalog.materials[0]!.name = "Tenant material";
    catalog.modules[0]!.enabled = false;
    await repo.saveCatalog(ctx, catalog);
    const seed = vi.spyOn(bootstrap, "createSystemCatalogSeed");
    const loaded = await createFileClientCatalogRepository(root).ensureCatalogExists(ctx);
    expect(loaded.materials[0]!.name).toBe("Tenant material");
    expect(loaded.modules[0]!.enabled).toBe(false);
    expect(loaded.legacyMaterials).toEqual(catalog.legacyMaterials);
    expect(seed).not.toHaveBeenCalled();
  }, 30_000);

  it("reads each persisted package only once per reconciliation", async () => {
    const root = await fixture();
    await createFileClientCatalogRepository(root).ensureCatalogExists(ctx);
    io.reads = [];
    await createFileClientCatalogRepository(root).ensureCatalogExists(ctx);
    const reads = io.reads.filter((file) => file.endsWith("module.package.json"));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.length).toBe(new Set(reads).size);
  }, 30_000);

  it("serializes concurrent cold requests across repository instances", async () => {
    const root = await fixture();
    const seed = vi.spyOn(bootstrap, "createSystemCatalogSeed");
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      createFileClientCatalogRepository(root).ensureCatalogExists(ctx)));
    expect(seed).toHaveBeenCalledTimes(1);
    for (const result of results.slice(1)) expect(result).toEqual(results[0]);
    expect(await createFileClientCatalogRepository(root).getCatalog(ctx)).toEqual(results[0]);
  }, 30_000);

  it("waits for a tenant save before reading, without blocking a different tenant", async () => {
    const root = await fixture();
    const repo = createFileClientCatalogRepository(root);
    const catalog = await repo.ensureCatalogExists(ctx);
    const other = { ...ctx, clientId: "other" };
    await repo.saveCatalog(other, { ...catalog, clientId: other.clientId });
    catalog.materials[0]!.name = "Saved material";
    const entered = deferred();
    const release = deferred();
    io.beforeWrite = async (file) => {
      if (file.includes(`${path.sep}${ctx.clientId}${path.sep}`) && file.endsWith("materials.json")) {
        entered.resolve();
        await release.promise;
      }
    };
    const saving = repo.saveCatalog(ctx, catalog);
    await entered.promise;
    let settled = false;
    const reading = createFileClientCatalogRepository(root).getCatalog(ctx).then((value) => {
      settled = true;
      return value;
    });
    try {
      expect((await createFileClientCatalogRepository(root).getCatalog(other)).clientId).toBe(other.clientId);
      // Let an unprotected filesystem read finish while the write remains paused.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
    } finally {
      release.resolve();
      await saving;
      await reading;
    }
    expect((await reading).materials[0]!.name).toBe("Saved material");
  }, 30_000);

  it("sees subsequent saves and releases a failed operation for retry", async () => {
    const root = await fixture();
    const repo = createFileClientCatalogRepository(root);
    const catalog = await repo.ensureCatalogExists(ctx);
    const revision = await repo.getRevision(ctx);
    const wrongTenant = { ...catalog, clientId: "foreign" };
    await expect(repo.saveCatalog(ctx, wrongTenant)).rejects.toThrow("clientId");
    catalog.materials[0]!.name = "Changed after first read";
    await createFileClientCatalogRepository(root).saveCatalog(ctx, catalog);
    expect((await repo.getCatalog(ctx)).materials[0]!.name).toBe("Changed after first read");
    expect(await repo.getRevision(ctx)).not.toEqual(revision);
  }, 30_000);

  it.each(["catalog", "packages"])("waits for sibling %s writes after an I/O failure and allows retry", async (kind) => {
    const root = await fixture();
    const repo = createFileClientCatalogRepository(root);
    const catalog = kind === "catalog" ? await repo.ensureCatalogExists(ctx) : null;
    const entered = deferred();
    const release = deferred();
    let writes = 0;
    io.beforeWrite = async (file) => {
      if (kind === "packages" && !file.endsWith("module.fqm")) return;
      writes++;
      if (writes === 1) throw new Error("simulated I/O failure");
      if (writes === 2) {
        entered.resolve();
        await release.promise;
      }
    };
    let settled = false;
    const operation = catalog ? repo.saveCatalog(ctx, catalog) : repo.ensureCatalogExists(ctx);
    const outcome = operation.then(() => { settled = true; return null; }, (error: unknown) => {
      settled = true;
      return error;
    });
    await entered.promise;
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(settled).toBe(false);
    } finally {
      release.resolve();
      await outcome;
      io.beforeWrite = undefined;
    }
    expect(await outcome).toEqual(new Error("simulated I/O failure"));
    if (catalog) await repo.saveCatalog(ctx, catalog);
    const loaded = await repo.ensureCatalogExists(ctx);
    expect(loaded.modules.length).toBeGreaterThan(0);
    expect(await repo.getCatalog(ctx)).toEqual(loaded);
  }, 30_000);
});
