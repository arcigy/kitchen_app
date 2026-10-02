import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { KitchenWorktopInstance } from "../appState";
import { makeDefaultKitchenContext } from "../kitchenContext";
import { buildProjectMaterialScopes } from "./materialUsageSummary";
import { renderWorktopPurchases } from "../../ui/backsplashPurchaseView";

describe("worktop purchase explanation", () => {
  it("shows net area separately from half-stock billed area and its actual cost", () => {
    const catalog: ClientCatalog = { clientId: "qa", ...createSystemCatalogSeed() };
    const material = structuredClone(catalog.materials.find(item => item.materialType === "board")!);
    Object.assign(material, { id: "qa-worktop", displayName: "QA worktop", boardFamily: "worktop", pricingBasis: "sheet_area", pricingUnit: "m2", defaultThicknessMm: 38, metadata: { supplierLengthMm: 4100, supplierWidthMm: 635, worktopPurchaseIncrement: .5 } });
    catalog.materials.push(material); catalog.priceList.prices[material.id] = 100;
    const worktop: KitchenWorktopInstance = { id: "qa-worktop", kitchenGroupId: "qa", params: { path: [{ x: 0, z: 0 }, { x: 1850, z: 0 }], justification: "front", mirrored: false, depthMm: 600, thicknessMm: 38, heightMm: 900, overhangSideMm: 0, materialId: material.id }, root: new THREE.Group(), mesh: new THREE.Mesh(), outline: new THREE.Line() };
    const scopes = buildProjectMaterialScopes({ catalog, instances: [], worktops: [worktop], customFurniture: [], kitchenGroups: [], kitchenContext: makeDefaultKitchenContext(catalog) });
    const purchase = scopes.flatMap(scope => scope.items).find(item => item.worktopPurchase)?.worktopPurchase;
    expect(purchase).toMatchObject({ pieces: .5, netAreaM2: 1.11, areaM2: 1.30175, cost: 130.17 });
    const html = renderWorktopPurchases(scopes);
    expect(html).toContain("Čistá plocha dielca: 1.110 m²");
    expect(html).toContain("účtovaná nákupná plocha: 1.302 m²");
    expect(html).toContain("4100 × 635 mm"); expect(html).toContain("130.17");
  });
});
