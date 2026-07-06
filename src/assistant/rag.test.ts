import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildAssistantRagIndex, searchAssistantRag } from "./rag";
import type { ClientContext } from "../core/client/client-context";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";

const ctx: ClientContext = { userId: "u1", clientId: "client_test", role: "owner" };

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

describe("assistant RAG", () => {
  it("chunks docs and retrieves relevant text without Postgres", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-rag-"));
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "AGENTS.md"), "# Agent Rules\nUse safe tools.", "utf-8");
    await writeFile(path.join(root, "docs", "materials.md"), "# Materials\nMaterialy sa menia v paneli Materialy.", "utf-8");

    const index = await buildAssistantRagIndex(root);
    expect(index.chunks.length).toBeGreaterThan(0);

    const results = await searchAssistantRag({ projectRoot: root, ctx, query: "kde zmenim materialy", limit: 2 });
    expect(results[0]?.source).toBe("docs/materials.md");
  });

  it("includes tenant PINO catalog chunks in assistant retrieval", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-rag-tenant-"));
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
});
