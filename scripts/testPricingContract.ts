import assert from "node:assert/strict";

import type { KitchenContext } from "../src/layout/kitchenContext";
import { makeDefaultKitchenContext } from "../src/layout/kitchenContext";
import { getComponentDefinitionById } from "../src/data/pricing/componentDefinitions";
import { getMaterialDefinitionById } from "../src/data/pricing/materialDefinitions";
import { applyKitchenContextToModuleParams } from "../src/layout/kitchenMaterialSync";
import { getSystemSeedCatalog } from "../src/core/catalog/catalog-repository";
import { getModuleDescriptors } from "../src/modules/registry";
import { systemModulePackageTemplates } from "../src/system/module-packages";
import {
  buildRuntimeQuoteBom,
  calculateCommercialPricingFromQuoteBom,
  type PortableQuoteBomPayload
} from "../src/modules/runtime/portableCommercial";

const catalog = getSystemSeedCatalog();
const ctx: KitchenContext = makeDefaultKitchenContext(catalog);

function approx(actual: number, expected: number, epsilon = 0.0001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}

function runCurrentModuleScenarios() {
  // Explicit test rates keep completeness independent of supplier seed prices.
  const pricedCatalog = structuredClone(catalog);
  const edge = getMaterialDefinitionById("mat.edge.body.abs.white.0_8")!;
  pricedCatalog.materials.push(...(["body", "front", "worktop"] as const).map(edgeFamily => ({ ...edge, id: `test.edge.${edgeFamily}`, edgeFamily, isActive: true })));
  pricedCatalog.priceList.prices = Object.fromEntries(
    [...pricedCatalog.materials, ...pricedCatalog.components, ...pricedCatalog.hardware].map(item => [item.id, 2])
  );
  const checks: string[] = [];
  for (const descriptor of getModuleDescriptors()) {
    const params = descriptor.defaultParams();
    const modulePackage = systemModulePackageTemplates.find(pack => pack.module.moduleType === descriptor.type)!;
    applyKitchenContextToModuleParams(params, ctx, pricedCatalog, modulePackage);
    const result = descriptor.calculateBOM(params, ctx, pricedCatalog);
    assert.equal(result.quoteBom.moduleType, descriptor.type);
    assert.ok(result.quoteBom.items.some(item => item.itemType === "board"), `${descriptor.type}: no board BOM`);
    assert.ok(result.pricing.groups.boards.cost > 0, `${descriptor.type}: no board cost`);
    const pending = result.quoteBom.items.filter(item => !item.pricingLookup?.sourceCatalogId && !item.pricingLookup?.key && !item.catalogRef?.catalogId);
    assert.ok(pending.every(item => item.id.startsWith("runners-")), `${descriptor.type}: unexpected unassigned item`);
    assert.equal(result.pricing.pricingStatus, pending.length ? "incomplete" : "ok");
    // Runner variants intentionally need an explicit project assignment. Prove
    // both the missing-price state and completion after supplying a test price.
    const assignedBom = structuredClone(result.quoteBom);
    for (const item of assignedBom.items) if (item.id.startsWith("runners-")) item.unitPriceOverride = 2;
    assert.equal(calculateCommercialPricingFromQuoteBom({ quoteBom: assignedBom, catalog: pricedCatalog }).pricingStatus, "ok");
    const wider = { ...params, width: Number(params.width) + 100 };
    const changed = descriptor.calculateBOM(wider, ctx, pricedCatalog);
    assert.ok(changed.pricing.groups.boards.cost > result.pricing.groups.boards.cost, `${descriptor.type}: width did not increase board consumption`);
    assert.equal(changed.pricing.pricingStatus, result.pricing.pricingStatus);
    checks.push(descriptor.type);
  }
  return checks;
}

function runGenericBomScenario() {
  const fixtureCatalog = structuredClone(catalog);
  const boardId = "mat.board.body.dtd.white.18";
  const edgeId = "mat.edge.body.abs.white.0_8";
  const handleId = "cmp.handle.bar.160.black";
  fixtureCatalog.materials = [
    ...fixtureCatalog.materials.filter(item => item.id !== boardId && item.id !== edgeId),
    getMaterialDefinitionById(boardId)!, getMaterialDefinitionById(edgeId)!
  ];
  fixtureCatalog.components = [
    ...fixtureCatalog.components.filter(item => item.id !== handleId),
    getComponentDefinitionById(handleId)!
  ];
  fixtureCatalog.priceList.prices = { ...fixtureCatalog.priceList.prices, [boardId]: 20, [edgeId]: 1.5, [handleId]: 4 };
  const bom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "generic_test",
    displayName: "Generic Test",
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: 1200,
      heightMm: 720,
      depthMm: 560,
      wallMounted: false
    },
    items: [
      {
        id: "side-panel",
        itemType: "board",
        category: "carcass",
        name: "Side Panel",
        description: "Generic side panel",
        pricingBasis: "sheet_area",
        pricingUnit: "m2",
        quantity: 1,
        pricingQuantity: 0,
        formulas: {
          lengthMm: "depth",
          widthMm: "height - 100",
          thicknessMm: "18",
          quantity: "2",
          areaM2: "(lengthMm * widthMm * quantity) / 1000000",
          wasteMultiplier: "1.1",
          pricingQuantity: "areaM2 * wasteMultiplier"
        },
        materialGroup: "body",
        material: {
          ...getMaterialDefinitionById("mat.board.body.dtd.white.18")!,
          catalogId: "mat.board.body.dtd.white.18",
          family: "body"
        },
        catalogRef: {
          entityType: "material",
          catalogId: "mat.board.body.dtd.white.18"
        },
        pricingLookup: {
          key: "mat.board.body.dtd.white.18",
          sourceCatalogId: "mat.board.body.dtd.white.18"
        },
        sourcePartIds: ["side-panel"]
      },
      {
        id: "side-panel-edge",
        itemType: "edge_band",
        category: "carcass",
        name: "Side Edge",
        description: "Generic edge band",
        pricingBasis: "linear_length",
        pricingUnit: "lm",
        quantity: 1,
        pricingQuantity: 0,
        formulas: {
          edgeLengthMm: "620",
          quantity: "2",
          pricingQuantity: "(edgeLengthMm * quantity) / 1000"
        },
        materialGroup: "body",
        material: {
          ...getMaterialDefinitionById("mat.edge.body.abs.white.0_8")!,
          catalogId: "mat.edge.body.abs.white.0_8",
          family: "body"
        },
        catalogRef: {
          entityType: "material",
          catalogId: "mat.edge.body.abs.white.0_8"
        },
        pricingLookup: {
          key: "mat.edge.body.abs.white.0_8",
          sourceCatalogId: "mat.edge.body.abs.white.0_8"
        },
        sourcePartIds: ["side-panel-edge"]
      },
      {
        id: "handle-set",
        itemType: "hardware",
        category: "hardware",
        name: "Handle Set",
        description: "Generic handles",
        pricingBasis: "piece",
        pricingUnit: "pcs",
        quantity: 2,
        pricingQuantity: 2,
        formulas: {
          quantity: "2",
          pricingQuantity: "quantity"
        },
        component: {
          ...getComponentDefinitionById("cmp.handle.bar.160.black")!,
          catalogId: "cmp.handle.bar.160.black"
        },
        catalogRef: {
          entityType: "component",
          catalogId: "cmp.handle.bar.160.black"
        },
        pricingLookup: {
          key: "cmp.handle.bar.160.black",
          sourceCatalogId: "cmp.handle.bar.160.black"
        },
        sourcePartIds: ["handle-set"]
      }
    ]
  };

  const runtimeQuoteBom = buildRuntimeQuoteBom({
    bom,
    params: { width: 1200, height: 720, depth: 560 },
    catalog: fixtureCatalog
  });
  const pricing = calculateCommercialPricingFromQuoteBom({ quoteBom: runtimeQuoteBom, laborCostFixed: 25, catalog: fixtureCatalog });

  assert.equal(pricing.pricingStatus, "ok");
  assert.equal(pricing.validationErrors.length, 0);

  const board = pricing.items.find((item) => item.id === "side-panel")!;
  approx(board.metrics?.areaM2 ?? 0, 0.6944);
  approx(board.pricingQuantity, 0.7638);

  const expectedBoardCost = 20 * board.pricingQuantity;
  approx(board.itemCost ?? 0, Math.round(expectedBoardCost * 100) / 100, 0.01);

  const expectedEdgeCost = 1.5 * 1.24;
  const edge = pricing.items.find((item) => item.id === "side-panel-edge")!;
  approx(edge.pricingQuantity, 1.24);
  approx(edge.itemCost ?? 0, Math.round(expectedEdgeCost * 100) / 100, 0.01);

  const handle = pricing.items.find((item) => item.id === "handle-set")!;
  approx(handle.pricingQuantity, 2);

  assert.equal(pricing.aggregates?.boardsByMaterial?.length, 1);
  assert.equal(pricing.aggregates?.edgeBandsByMaterial?.length, 1);
  assert.equal(pricing.aggregates?.componentsByCatalogId?.length, 1);
  assert.equal(pricing.finalPrice, pricing.subtotalCost);
  assert.equal(pricing.marginAmount, 0);
}

function runInvalidBomScenario() {
  const bom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "broken_test",
    displayName: "Broken Test",
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: 600,
      heightMm: 720,
      depthMm: 560,
      wallMounted: false
    },
    items: [
      {
        id: "broken-board",
        itemType: "board",
        category: "carcass",
        name: "Broken Board",
        description: "No dimensions or lookup",
        pricingBasis: "piece",
        pricingUnit: "pcs",
        quantity: 1,
        pricingQuantity: Number.NaN
      }
    ]
  };

  const pricing = calculateCommercialPricingFromQuoteBom({ quoteBom: bom, catalog });
  assert.equal(pricing.pricingStatus, "incomplete");
  assert.ok(pricing.validationErrors.length >= 3);
}

async function main() {
  const currentModules = runCurrentModuleScenarios();
  runGenericBomScenario();
  runInvalidBomScenario();
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          ...currentModules,
          "generic_bom",
          "invalid_bom"
        ]
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
