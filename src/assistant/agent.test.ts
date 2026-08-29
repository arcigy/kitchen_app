import { describe, expect, it } from "vitest";
import { runAssistantTurn, sanitizeAssistantToolCalls } from "./agent";
import type { AssistantClientContext } from "./types";
import type { ClientCatalog, ClientModuleDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";

const baseContext: AssistantClientContext = {
  projectId: "project_a",
  phaseId: "phase_a",
  viewMode: "2d",
  activeViewerTab: "floorplan",
  layoutTool: "select",
  selectedKind: null,
  selectedKitchenGroupId: null,
  activeKitchenGroupId: null,
  selectedInstanceIds: [],
  selectedWallIds: [],
  selectedParams: [],
  catalogSummary: { materialCount: 2, componentCount: 1, moduleCount: 3, moduleTypes: ["drawer_low"] }
};

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

describe("assistant agent fallback", () => {
  it("drops unregistered and schema-invalid model tool calls", () => {
    expect(sanitizeAssistantToolCalls([
      { id: "unknown", toolId: "filesystem.delete", input: {} },
      { id: "bad_move", toolId: "editor.moveSelection", input: { dxMm: 20 } },
      { id: "good_move", toolId: "editor.moveSelection", input: { dxMm: 20, dzMm: 0 }, confirmed: true }
    ])).toEqual([{ id: "good_move", toolId: "editor.moveSelection", input: { dxMm: 20, dzMm: 0 } }]);
  });

  it("does not falsely claim that full-kitchen workflows are unavailable when OpenAI is offline", async () => {
    const response = await runAssistantTurn({
      message: "vytvor celu kuchynu podla zadania",
      clientContext: baseContext,
      ragChunks: []
    });

    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls).toEqual([]);
    expect(response.assistantMessage).not.toContain("nie je dostupne");
  });

  it("creates a module patch tool call for selected module dimensions", async () => {
    const response = await runAssistantTurn({
      message: "nastav sirka 800 a sufliky 3",
      clientContext: {
        ...baseContext,
        selectedKind: "module",
        selectedInstanceIds: ["m1"],
        selectedParams: [{ id: "m1", kind: "module", label: "drawer_low", params: { type: "drawer_low", widthMm: 600 } }]
      },
      ragChunks: []
    });

    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls[0]?.toolId).toBe("module.patchSelectedParams");
    expect(response.toolCalls[0]?.input).toMatchObject({ instanceIds: ["m1"], patch: { width: 800, drawerCount: 3 } });
  });

  it("keeps how-to questions read-only even when they contain edit verbs", async () => {
    const response = await runAssistantTurn({
      message: "kde zmenim materialy?",
      clientContext: baseContext,
      ragChunks: [{ id: "docs_1", source: "docs/materials.md", title: "Materials", text: "Materialy sa menia v sekcii Materialy.", tags: ["docs"], updatedAt: new Date().toISOString() }]
    });

    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls).toEqual([]);
    expect(response.assistantMessage).toContain("Materialy");
  });

  it("uses a deterministic live read for module-count questions", async () => {
    const response = await runAssistantTurn({
      message: "Koľko modulov je v aktuálnej kuchyni?",
      clientContext: baseContext,
      ragChunks: []
    });

    expect(response.phase).toBe("plan");
    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0]).toMatchObject({
      toolId: "context.queryObjects",
      input: { kinds: ["module"], limit: 500 }
    });
    expect(response.workflow?.successCriteria[0]).toContain("počet modulov");
  });

  it("routes a live price question away from unrelated RAG content", async () => {
    const response = await runAssistantTurn({
      message: "koľko stoja označené veci dokopy teraz, akú majú cenu?",
      clientContext: baseContext,
      ragChunks: [{ id: "irrelevant", source: "AGENTS.md", title: "Git workflow", text: "git add -A", tags: [], updatedAt: new Date().toISOString() }]
    });
    expect(response.toolCalls).toEqual([expect.objectContaining({ toolId: "pricing.getSummary", input: {} })]);
    expect(response.assistantMessage).not.toContain("git add");
  });

  it("dispatches deletion as an immediate editor command without exposing archive data", async () => {
    const response = await runAssistantTurn({
      message: "vymaž ich",
      clientContext: {
        ...baseContext,
        selectedKind: "module",
        selectedInstanceIds: ["m1", "m2"],
        selectedParams: [{ id: "m1", kind: "module" }, { id: "m2", kind: "module" }]
      },
      ragChunks: [{ id: "archive", source: "modpkg.archive.json", title: "Archive", text: "{ secret implementation }", tags: ["schema"], updatedAt: new Date().toISOString() }]
    });
    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls).toEqual([expect.objectContaining({ toolId: "editor.deleteSelection" })]);
    expect(response.assistantMessage).not.toContain("modpkg");
  });

  it("prioritizes deletion over a generic selected-objects read", async () => {
    const response = await runAssistantTurn({
      message: "Vyma\u017e ozna\u010den\u00e9 moduly a potom over projekt.",
      clientContext: {
        ...baseContext,
        selectedKind: "module",
        selectedInstanceIds: ["m1"],
        selectedParams: [{ id: "m1", kind: "module" }]
      },
      ragChunks: []
    });
    expect(response.phase).toBe("plan");
    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls).toEqual([expect.objectContaining({ toolId: "editor.deleteSelection" })]);
  });

  it("dispatches routine editor writes immediately", async () => {
    const response = await runAssistantTurn({
      message: "nastav sirka 800 a sufliky 3",
      clientContext: { ...baseContext, selectedKind: "module", selectedInstanceIds: ["m1"], selectedParams: [{ id: "m1", kind: "module" }] },
      ragChunks: []
    });
    expect(response.requiresConfirmation).toBe(false);
  });

  it("reads the exact open-project name from live metadata instead of answering from RAG", async () => {
    const response = await runAssistantTurn({
      message: "Ako sa volá tento projekt?",
      clientContext: baseContext,
      ragChunks: [{
        id: "unrelated_product_name",
        source: "README.md",
        title: "Product",
        text: "The application product is called FurnQuote.",
        tags: ["product"],
        updatedAt: "2026-07-23T00:00:00.000Z"
      }]
    });

    expect(response.phase).toBe("plan");
    expect(response.toolCalls).toEqual([expect.objectContaining({
      toolId: "project.getMetadata",
      input: {}
    })]);
    expect(response.assistantMessage).not.toContain("FurnQuote");
    expect(response.workflow?.successCriteria[0]).toContain("presný názov");
    expect(response.debugTrace).toMatchObject({
      schemaVersion: "arcigy-assistant-debug.v1",
      rawReasoningPolicy: { rawChainOfThoughtAvailable: false }
    });
    expect(response.debugTrace?.events.some((event) =>
      event.stage === "workflow_state" && event.actor.role === "workflow_controller"
    )).toBe(true);
  });

  it("validates tool results on continue", async () => {
    const response = await runAssistantTurn({
      message: "continue",
      clientContext: baseContext,
      ragChunks: [],
      toolResults: [{ ok: true, toolId: "context.getSelection", stateDeltaSummary: "Read live context." }]
    });

    expect(response.validation?.done).toBe(true);
    expect(response.toolCalls).toEqual([]);
  });

  it("creates a confirmed PINO insertion tool call from a verbal module description", async () => {
    const response = await runAssistantTurn({
      message: "vloz mi vysoky modul, dole dvierka, potom jeden suflik, nad tym mikrovlnku a hore policky",
      clientContext: {
        ...baseContext,
        selectedKind: "kitchenGroup",
        selectedKitchenGroupId: "kg1",
        activeKitchenGroupId: "kg1"
      },
      ragChunks: [],
      catalog: tenantCatalog()
    });

    expect(response.requiresConfirmation).toBe(false);
    expect(response.toolCalls[0]?.toolId).toBe("vendorCatalog.insertResolvedModule");
    expect(response.toolCalls[0]?.input).toMatchObject({
      catalogKey: "GBS-FB",
      moduleType: "pino_side_cabinet",
      modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1"
    });
  });
});
