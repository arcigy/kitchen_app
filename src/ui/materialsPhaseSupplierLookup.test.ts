// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createDefaultProjectMaterialAssignments, createProjectMaterialsView } from "../core/project-materials/project-material-business";
import { EMPTY_SUPPLIER_BRIDGE_PANEL_STATE, mountProjectMaterialsPanel } from "./materialsPhasePanel";

describe("materials supplier launch controls", () => {
  it("opens one globally selected supplier without per-row IDs", () => {
    const catalog: ClientCatalog = { clientId: "client_test", ...createSystemCatalogSeed() };
    const view = createProjectMaterialsView(createDefaultProjectMaterialAssignments(catalog, "2026-07-10T08:00:00.000Z"), [], catalog);
    const host = document.createElement("div");
    document.body.append(host);
    const onOpenSupplier = vi.fn().mockResolvedValue(undefined);
    const handle = mountProjectMaterialsPanel(host, view, { onCommitId: async () => ({ ok: true }), onOpenSupplier });
    handle.updateSupplierBridge({
      ...EMPTY_SUPPLIER_BRIDGE_PANEL_STATE,
      suppliers: [
        { supplierId: "demos", displayName: "Démos", startUrl: "https://www.demos24plus.com/", adapterKey: "demos", sortOrder: 10 },
        { supplierId: "hranipex", displayName: "Hranipex", startUrl: "https://www.hranipex.cz/cs/", adapterKey: "hranipex", sortOrder: 20 }
      ]
    });
    expect(host.querySelector('[data-supplier-draft-field="supplierId"]')).toBeNull();
    expect(host.querySelector('[data-supplier-draft-field="supplierProductId"]')).toBeNull();
    expect(host.querySelectorAll("[data-supplier-open]")).toHaveLength(0);
    const picker = host.querySelector<HTMLSelectElement>('[data-supplier-picker="true"]')!;
    picker.value = "demos";
    picker.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onOpenSupplier).toHaveBeenCalledWith("demos");
    handle?.destroy();
  });
});
