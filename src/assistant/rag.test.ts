import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../core/client/client-context";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";
import {
  buildAssistantRagIndex,
  reindexAssistantRag,
  replaceAssistantRagIndex,
  searchAssistantRag,
  type AssistantRagIndex
} from "./rag";

const ctx: ClientContext = { userId: "u1", clientId: "client_test", role: "owner" };
const roots: string[] = [];

function moduleDef(overrides: Partial<ClientModuleDefinition>): ClientModuleDefinition {
  return {
    id: overrides.modulePackageId ?? overrides.moduleType ?? "pino_side_cabinet",
    moduleType: overrides.moduleType ?? "pino_side_cabinet",
    modulePackageId: overrides.modulePackageId ?? "pino_nobilia_side_cabinet_vkh_2026_v1",
    packageVersion: "1.0.0",
    packageHash: "hash",
    name: overrides.name ?? "Module",
    enabled: overrides.enabled ?? true,
    runtimeBuilderKey: overrides.runtimeBuilderKey ?? "pinoSideCabinet.v1",
    category: overrides.category ?? "tall_cabinet",
    ...overrides
  };
}

function variant(overrides: Partial<VendorProductVariant>): VendorProductVariant {
  return attachVendorModuleIntent({
    productTemplateId: "pino_side_cabinet_gbs_fb_page245",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 245,
    articleCode: "GBS03FB",
    articleFamily: "GBS",
    widthCm: null,
    widthMm: 600,
    variantCode: "FB",
    variantCodeStatus: "extracted",
    catalogKey: "GBS-FB",
    productTemplateName: "Bocni skrinka pro vestavne spotrebice",
    notes: ["1 zasuvka", "Vyska vyklenku 590 mm", "2 prestavitelne police"],
    confidence: 0.99,
    needsReview: false,
    ...overrides
  });
}

function tenantCatalog(): Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults"> {
  return {
    clientId: "client_pino_nobilia_vkh_2026",
    modules: [moduleDef({})],
    kitchenDefaults: {
      carcassMaterialId: "mat.body",
      frontMaterialId: "mat.front",
      drawerBottomMaterialId: "mat.drawer.bottom",
      defaultHandleComponentId: "cmp.handle",
      defaultHingeComponentId: "cmp.hinge",
      defaultDrawerSystemComponentId: "cmp.runner",
      defaultWorktopThicknessMm: 38,
      defaultPlinthHeightMm: 100
    },
    vendorCatalog: {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: [variant({})],
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [245],
        productVariants: 1,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-17T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    }
  };
}

async function trackedRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function projectRoot(content: string): Promise<string> {
  const root = await trackedRoot("arcigy-rag-");
  await writeFile(path.join(root, "AGENTS.md"), content, "utf-8");
  return root;
}

function context(clientId: string): ClientContext {
  return { clientId, userId: `user_${clientId}`, role: "owner" };
}

function persistedIndex(): AssistantRagIndex {
  return {
    persisted: false,
    chunks: [{
      id: "chunk_1",
      source: "docs/example.md",
      title: "Example",
      text: "tenant-specific assistant content",
      tags: ["docs"],
      updatedAt: "2026-07-15T00:00:00.000Z"
    }]
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.sequential("assistant RAG", () => {
  it("chunks docs and retrieves relevant text without Postgres", async () => {
    const root = await trackedRoot("arcigy-rag-");
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "# Agent Rules\nUse safe tools.", "utf-8");
    await writeFile(path.join(root, "docs", "materials.md"), "# Materials\nMaterialy sa menia v paneli Materialy.", "utf-8");

    const index = await buildAssistantRagIndex(root);
    expect(index.chunks.length).toBeGreaterThan(0);

    const results = await searchAssistantRag({ projectRoot: root, ctx, query: "kde zmenim materialy", limit: 2 });
    expect(results[0]?.source).toBe("docs/materials.md");
  });

  it("includes tenant PINO catalog chunks in assistant retrieval", async () => {
    const root = await trackedRoot("arcigy-rag-tenant-");
    await writeFile(path.join(root, "AGENTS.md"), "# Agent Rules\nUse safe tools.", "utf-8");

    const index = await buildAssistantRagIndex(root, tenantCatalog());
    expect(index.chunks.some((chunk) => chunk.source.startsWith("tenant-catalog/"))).toBe(true);

    const results = await searchAssistantRag({
      projectRoot: root,
      ctx,
      catalog: tenantCatalog(),
      query: "vysoky modul s mikrovlnkou a zasuvkou",
      limit: 3
    });
    expect(results.some((chunk) => chunk.source.startsWith("tenant-catalog/"))).toBe(true);
  });

  it("never reuses another tenant's transient index during database fallback", async () => {
    const rootA = await projectRoot("# Alpha tenant\n\nprivatealphaonly cabinet workflow");
    const rootB = await projectRoot("# Beta tenant\n\nprivatebetaonly cabinet workflow");
    const ctxA = context("client_rag_alpha");
    const ctxB = context("client_rag_beta");

    await reindexAssistantRag(rootA, ctxA);

    expect(await searchAssistantRag({ projectRoot: rootB, ctx: ctxB, query: "privatealphaonly" })).toEqual([]);
    expect((await searchAssistantRag({ projectRoot: rootB, ctx: ctxB, query: "privatebetaonly" }))[0]?.text)
      .toContain("privatebetaonly");
    expect((await searchAssistantRag({ projectRoot: rootA, ctx: ctxA, query: "privatealphaonly" }))[0]?.text)
      .toContain("privatealphaonly");
  });

  it("preserves the local fallback when no database is configured", async () => {
    const root = await projectRoot("# Local assistant\n\nlocalfallbacktoken guidance");
    const localCtx = context("client_rag_local");

    const index = await reindexAssistantRag(root, localCtx);
    expect(index.persisted).toBe(false);
    expect((await searchAssistantRag({ projectRoot: root, ctx: localCtx, query: "localfallbacktoken" }))[0]?.text)
      .toContain("localfallbacktoken");
  });

  it("fails closed for an invalid environment and schema pairing", async () => {
    const root = await projectRoot("# Invalid config\n\ninvalidconfigtoken guidance");
    const invalidCtx = context("client_rag_invalid");
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      APP_ENV: process.env.APP_ENV,
      DATABASE_SCHEMA: process.env.DATABASE_SCHEMA,
      NODE_ENV: process.env.NODE_ENV
    };
    process.env.DATABASE_URL = "postgresql://example.invalid/arcigy";
    process.env.APP_ENV = "dev";
    process.env.DATABASE_SCHEMA = "prod";
    process.env.NODE_ENV = "production";
    try {
      await expect(reindexAssistantRag(root, invalidCtx)).rejects.toThrow("APP_ENV=dev must use DATABASE_SCHEMA=dev");
      await expect(searchAssistantRag({ projectRoot: root, ctx: invalidCtx, query: "invalidconfigtoken" }))
        .rejects.toThrow("APP_ENV=dev must use DATABASE_SCHEMA=dev");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("replaces one tenant's persisted index atomically", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [], rowCount: 0 };
      })
    } as unknown as Pick<PoolClient, "query">;

    await replaceAssistantRagIndex(client, "dev", context("client_rag_atomic"), persistedIndex());

    expect(calls[0]?.sql).toBe("BEGIN");
    expect(calls[1]).toMatchObject({ params: ["client_rag_atomic"] });
    expect(calls[1]?.sql).toContain('DELETE FROM "dev"."assistant_rag_chunks"');
    expect(calls[2]?.sql).toContain('INSERT INTO "dev"."assistant_rag_chunks"');
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("rolls back instead of leaving a partial tenant index", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.startsWith("INSERT")) throw new Error("simulated insert failure");
        return { rows: [], rowCount: 0 };
      })
    } as unknown as Pick<PoolClient, "query">;

    await expect(replaceAssistantRagIndex(client, "dev", context("client_rag_rollback"), persistedIndex()))
      .rejects.toThrow("simulated insert failure");
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
  });
});
