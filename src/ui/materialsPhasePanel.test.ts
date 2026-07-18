import { describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createDefaultProjectMaterialAssignments, createProjectMaterialsView } from "../core/project-materials/project-material-business";
import { FakeElement, FakeInputElement } from "../app/testUtils/propertiesPanelHarness";
import { mountProjectMaterialsPanel, renderProjectMaterialsPanel } from "./materialsPhasePanel";
import { summarizeMaterialUsage } from "../layout/bom/materialUsageSummary";

class MaterialsInput extends FakeInputElement {
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
}

class MaterialsHost extends FakeElement {
  error = new FakeElement();

  querySelector<T = FakeElement>(selector: string): T | null {
    return selector.includes("data-material-field-error") ? this.error as T : null;
  }
}

const testCatalog = (): ClientCatalog => ({ clientId: "client_test", ...createSystemCatalogSeed() });

describe("materials phase panel", () => {
  it("renders the approved material groups and quantities without pricing controls", () => {
    const summary = summarizeMaterialUsage([
      {
        schemaVersion: "module-quote-bom.v1",
        moduleType: "test_module",
        displayName: "Test module",
        generatedAt: "2026-07-09T00:00:00.000Z",
        moduleInstance: { quantity: 1, widthMm: 600, heightMm: 720, depthMm: 560 },
        items: [
          {
            id: "front",
            itemType: "board",
            category: "board",
            name: "Front",
            description: "Front",
            pricingBasis: "sheet_area",
            pricingUnit: "m2",
            quantity: 2,
            pricingQuantity: 0.96,
            pricingQuantityBase: 0.96,
            metrics: { areaM2: 0.96 },
            dimensionsMm: { length: 720, width: 400, thickness: 19 },
            materialGroup: "front",
            material: { catalogId: "mat.front.oak", displayName: "Dub <matný>" } as never
          }
        ]
      }
    ]);

    const html = renderProjectMaterialsPanel(summary);

    expect(html).toContain("Materiály a komponenty");
    expect(html).toContain("Korpus");
    expect(html).toContain("Fronty");
    expect(html).toContain("Pracovná doska");
    expect(html).toContain("Sokel");
    expect(html).toContain("Chrbát");
    expect(html).toContain("Hrany");
    expect(html).toContain("Úchytky a kovanie");
    expect(html).toContain("0,96 m²");
    expect(html).toContain("Dub &lt;matný&gt;");
    expect(html).not.toContain("Cena");
    expect(html).not.toContain("Cenník");
  });

  it("renders compact quantities and global supplier launchers without per-row IDs", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, "2026-07-09T20:00:00.000Z");
    const view = createProjectMaterialsView(
      state,
      [
        { category: "corpus", quantity: 24.56, unit: "m2", pieces: 32 },
        { category: "edge_front", quantity: 28, unit: "lm" },
        { category: "handle", quantity: 10, unit: "pcs" }
      ],
      catalog
    );

    const html = renderProjectMaterialsPanel(view);

    expect(html).toContain("data-material-assignment-category=\"corpus\"");
    expect(html).toContain("data-material-assignment-category=\"edge_front\"");
    expect(html).toContain("Hrany frontov");
    expect(html).toContain("Hrany korpusu");
    expect(html).toContain("data-material-edge-split=\"edge_front\"");
    expect(html).toContain("data-material-assignment-category=\"handle\"");
    expect(html).not.toContain("Materiál ID");
    expect(html).not.toContain("Komponent ID");
    expect(html).toContain("24,56 m²");
    expect(html).toContain("32 dosiek / ks");
    expect(html).toContain("Varovania");
    expect(html).toContain("Prehľad materiálov");
    expect(html).not.toContain("Zdroj cenníka");
    expect(html).toContain("Pre klienta nie je povolený žiadny dodávateľ");
    expect(html).not.toContain("data-supplier-open");
    expect(html).not.toContain("data-supplier-draft-field");
    expect(html).not.toContain("Cena projektu");
    expect(html).not.toContain("Celková cena");
  });

  it("shows global assignments on every module part and keeps an individual override distinct", () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, "2026-07-18T20:30:00.000Z");
    const corpus = state.assignments.find((assignment) => assignment.category === "corpus")!;
    corpus.customValues = { supplierBridge: { supplierId: "demos", supplierProductCode: "GLOBAL-100" } };
    if (corpus.snapshots.material) corpus.snapshots.material.definition.displayName = "Globálny korpus";
    const override = structuredClone(corpus);
    override.assignmentId = "material-assignment:module:base-1:corpus:panel-override";
    override.customValues = { supplierBridge: { supplierId: "demos", supplierProductCode: "OWN-200" } };
    if (override.snapshots.material) override.snapshots.material.definition.displayName = "Vlastný korpus";
    state.assignments.push(override);
    const view = createProjectMaterialsView(state, [], catalog);
    view.scopes = [{
      id: "module:base-1",
      kind: "module",
      label: "Spodná skrinka",
      items: [
        { id: "panel-general", category: "corpus", label: "Bok", description: "720 × 560 × 18 mm", quantity: 1, unit: "m2", pieces: 1 },
        { id: "panel-override", category: "corpus", label: "Dno", description: "600 × 560 × 18 mm", quantity: 1, unit: "m2", pieces: 1 }
      ]
    }];

    const html = renderProjectMaterialsPanel(view, { activeSettingsTab: "modules", selectedScopeId: "module:base-1" });

    expect(html).toContain('data-material-scope-item="panel-general"');
    expect(html).toContain('data-material-assignment-source="general"');
    expect(html).toContain("Globálny korpus · GLOBAL-100 · Zdedené z General settings");
    expect(html).toContain('data-material-scope-item="panel-override"');
    expect(html).toContain('data-material-assignment-source="override"');
    expect(html).toContain("Vlastný korpus · OWN-200 · Vlastné priradenie");
  });

  it("restores the committed input value and leaves derived content mounted after invalid blur validation", async () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, "2026-07-09T20:00:00.000Z");
    const view = createProjectMaterialsView(state, [], catalog);
    const host = new MaterialsHost();
    const onCommitId = vi.fn().mockResolvedValue({ ok: false, error: "Neplatné ID. Ponechaná pôvodná hodnota." });
    mountProjectMaterialsPanel(host as unknown as HTMLElement, view, { onCommitId });
    const input = new MaterialsInput();
    input.value = "missing.id";
    input.dataset.materialAssignmentInput = "true";
    input.dataset.materialCategory = "front";
    input.dataset.materialIdField = "materialId";
    input.dataset.committedValue = "material.front.old";

    host.dispatch("focusout", { target: input });
    await vi.waitFor(() => expect(onCommitId).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(input.disabled).toBe(false));

    expect(input.value).toBe("material.front.old");
    expect(input.attributes.get("aria-invalid")).toBe("true");
    expect(host.error.textContent).toContain("Ponechaná pôvodná hodnota");
    expect(host.innerHTML).toContain("General settings");
  });

  it("waits for an active blur commit and keeps Escape inside the ID field", async () => {
    const catalog = testCatalog();
    const state = createDefaultProjectMaterialAssignments(catalog, "2026-07-09T20:00:00.000Z");
    const view = createProjectMaterialsView(state, [], catalog);
    let finishCommit: (result: { ok: boolean }) => void = () => {
      throw new Error("Commit resolver was not initialized.");
    };
    const onCommitId = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => {
      finishCommit = resolve;
    }));
    const host = new MaterialsHost();
    const handle = mountProjectMaterialsPanel(host as unknown as HTMLElement, view, { onCommitId });
    const input = new MaterialsInput();
    input.value = "material.front.new";
    input.dataset.materialAssignmentInput = "true";
    input.dataset.materialCategory = "front";
    input.dataset.materialIdField = "materialId";
    input.dataset.committedValue = "material.front.old";

    host.dispatch("focusout", { target: input });
    let flushed = false;
    const flush = handle.flushPending().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    finishCommit({ ok: true });
    await flush;
    expect(flushed).toBe(true);

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    (input as unknown as { blur: () => void }).blur = vi.fn();
    input.value = "draft";
    host.dispatch("keydown", { target: input, key: "Escape", preventDefault, stopPropagation });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(input.value).toBe("material.front.new");
  });
});
