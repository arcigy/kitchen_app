import assert from "node:assert/strict";

import type { KitchenContext } from "../src/layout/kitchenContext";
import { makeDefaultKitchenContext } from "../src/layout/kitchenContext";
import { getComponentDefinitionById } from "../src/data/pricing/componentDefinitions";
import { getMaterialDefinitionById } from "../src/data/pricing/materialDefinitions";
import { applyKitchenContextToModuleParams } from "../src/layout/kitchenMaterialSync";
import { calculateBOM as calculateCornerShelfLowerBOM } from "../src/modules/cornerShelfLower/calculation";
import { makeDefaultCornerShelfLowerParams } from "../src/modules/cornerShelfLower/types";
import { calculateBOM as calculateDrawerLowBOM } from "../src/modules/drawerLow/calculation";
import { makeDefaultDrawerLowParams } from "../src/modules/drawerLow/types";
import { calculateBOM as calculateFridgeTallBOM } from "../src/modules/fridgeTall/calculation";
import { makeDefaultFridgeTallParams } from "../src/modules/fridgeTall/types";
import {
  buildRuntimeQuoteBom,
  calculateCommercialPricingFromQuoteBom,
  type PortableQuoteBomPayload
} from "../src/modules/runtime/portableCommercial";
import { getUnitPriceForCatalogId } from "../src/data/pricing";

const ctx: KitchenContext = makeDefaultKitchenContext();

function approx(actual: number, expected: number, epsilon = 0.0001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `Expected ${actual} to be within ${epsilon} of ${expected}`);
}

function runDrawerLowScenario() {
  const params = makeDefaultDrawerLowParams();
  const result = calculateDrawerLowBOM(params, ctx);

  assert.equal(result.quoteBom.moduleType, "drawer_low");
  assert.equal(result.pricing.pricingStatus, "ok");
  assert.equal(result.pricing.validationErrors.length, 0);
  assert.ok(result.pricing.groups.boards.cost > 0);
  assert.ok(result.pricing.groups.hardware.cost > 0);

  const changed = structuredClone(params) as Record<string, unknown>;
  changed.width = 1200;
  changed.depth = 620;
  changed.commercialSelections = {
    boardMaterials: {
      "left-side": "mat.board.body.dtd.grey.18",
      "drawer-front-1": "mat.board.front.mdf.cashmere_supermat.19"
    },
    boardThicknesses: {
      "left-side": 18,
      "drawer-front-1": 19
    }
  };

  const changedResult = calculateDrawerLowBOM(changed as typeof params, ctx);
  assert.equal(changedResult.pricing.pricingStatus, "ok");
  const leftSide = changedResult.quoteBom.items.find((item) => item.id === "left-side");
  assert.equal(leftSide?.material?.catalogId, "mat.board.body.dtd.grey.18");
  assert.ok((leftSide?.dimensionsMm?.width ?? 0) > 0);

  const drawerFront1 = changedResult.quoteBom.items.find((item) => item.id === "drawer-front-1");
  assert.equal(drawerFront1?.material?.catalogId, "mat.board.front.mdf.cashmere_supermat.19");

  assert.notEqual(changedResult.pricing.finalPrice, result.pricing.finalPrice);
  assert.ok((changedResult.quoteBom.aggregates?.boardsByMaterial?.length ?? 0) > 0);
}

function runCornerShelfLowerScenario() {
  const params = makeDefaultCornerShelfLowerParams();
  const result = calculateCornerShelfLowerBOM(params, ctx);

  assert.equal(result.quoteBom.moduleType, "corner_shelf_lower");
  assert.equal(result.pricing.pricingStatus, "ok");
  assert.equal(result.pricing.validationErrors.length, 0);
  assert.equal(result.quoteBom.moduleInstance.widthMm, 1000);
  assert.equal(result.quoteBom.moduleInstance.depthMm, 1000);

  const hingeItem = result.pricing.items.find((item) => item.id === "door-hinges");
  const handleItem = result.pricing.items.find((item) => item.id === "door-handles");
  const legsItem = result.pricing.items.find((item) => item.id === "adjustable-legs");
  const clipsItem = result.pricing.items.find((item) => item.id === "plinth-clips");

  assert.equal(hingeItem?.component?.catalogId, "cmp.hinge.corner.45.softclose");
  assert.equal(handleItem?.component?.catalogId, "cmp.handle.bar.160.inox");
  assert.equal(legsItem?.component?.catalogId, "cmp.leg.adjustable.100.black");
  assert.equal(clipsItem?.component?.catalogId, "cmp.clip.plinth.standard");

  const synced = structuredClone(params);
  applyKitchenContextToModuleParams(synced, ctx);
  assert.equal(synced.height, ctx.heightMm);
  assert.equal(synced.heightCarcass, ctx.moduleHeightMm);
  assert.equal(synced.depth, ctx.moduleDepthMm);

  const changed = structuredClone(synced) as Record<string, unknown>;
  changed.commercialSelections = {
    boardMaterials: {
      "left-side": "mat.board.body.dtd.grey.18",
      "door-front-x": "mat.board.front.mdf.cashmere_supermat.19"
    },
    boardThicknesses: {
      "left-side": 18,
      "door-front-x": 19
    }
  };
  changed.hingeComponentId = "cmp.hinge.wide_angle.155.softclose";
  changed.clipComponentId = "cmp.clip.plinth.heavy";

  const changedResult = calculateCornerShelfLowerBOM(changed as typeof params, ctx);
  assert.equal(changedResult.pricing.pricingStatus, "ok");
  assert.equal(changedResult.quoteBom.moduleInstance.depthMm, params.lengthZ);
  assert.equal(
    changedResult.quoteBom.items.find((item) => item.id === "left-side")?.material?.catalogId,
    "mat.board.body.dtd.grey.18"
  );
  assert.equal(
    changedResult.quoteBom.items.find((item) => item.id === "door-front-x")?.material?.catalogId,
    "mat.board.front.mdf.cashmere_supermat.19"
  );
  assert.equal(
    changedResult.pricing.items.find((item) => item.id === "door-hinges")?.component?.catalogId,
    "cmp.hinge.wide_angle.155.softclose"
  );
  assert.equal(
    changedResult.pricing.items.find((item) => item.id === "plinth-clips")?.component?.catalogId,
    "cmp.clip.plinth.heavy"
  );
}

function runFridgeTallScenario() {
  const params = makeDefaultFridgeTallParams();
  const result = calculateFridgeTallBOM(params, ctx);

  assert.equal(result.quoteBom.moduleType, "fridge_tall");
  assert.equal(result.pricing.pricingStatus, "ok");
  assert.equal(result.pricing.validationErrors.length, 0);
  assert.equal(result.quoteBom.moduleInstance.widthMm, 600);
  assert.equal(result.quoteBom.moduleInstance.depthMm, 600);

  const hingeItem = result.pricing.items.find((item) => item.id === "door-hinges");
  const handleItem = result.pricing.items.find((item) => item.id === "door-handles");
  const legsItem = result.pricing.items.find((item) => item.id === "adjustable-legs");
  const clipsItem = result.pricing.items.find((item) => item.id === "plinth-clips");

  assert.equal(hingeItem?.component?.catalogId, "cmp.hinge.fridge_integrated.softclose");
  assert.equal(handleItem?.component?.catalogId, "cmp.handle.bar.160.black");
  assert.equal(legsItem?.component?.catalogId, "cmp.leg.adjustable.100.black");
  assert.equal(clipsItem?.component?.catalogId, "cmp.clip.plinth.standard");

  const synced = structuredClone(params);
  applyKitchenContextToModuleParams(synced, ctx);
  assert.equal(synced.depth, ctx.moduleDepthMm);
  assert.equal(synced.plinthHeight, ctx.plinthHeightMm);
  assert.equal(synced.plinthSetbackMm, ctx.plinthDepthMm);
  assert.equal(synced.worktopThicknessMm, 0);

  const syncedResult = calculateFridgeTallBOM(synced, ctx);
  assert.equal(syncedResult.pricing.pricingStatus, "ok");
  assert.equal(
    syncedResult.quoteBom.items.find((item) => item.id === "carcass-side-left")?.material?.catalogId,
    ctx.corpusMaterialId
  );
  assert.equal(
    syncedResult.quoteBom.items.find((item) => item.id === "carcass-back")?.material?.catalogId,
    ctx.backMaterialId
  );
  assert.equal(
    syncedResult.quoteBom.items.find((item) => item.id === "door-front-upper")?.material?.catalogId,
    ctx.frontsMaterialId
  );
  assert.equal(
    syncedResult.pricing.items.find((item) => item.id === "door-handles")?.component?.catalogId,
    ctx.handleComponentId
  );
}

function runGenericBomScenario() {
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
    params: { width: 1200, height: 720, depth: 560 }
  });
  const pricing = calculateCommercialPricingFromQuoteBom({ quoteBom: runtimeQuoteBom, laborCostFixed: 25 });

  assert.equal(pricing.pricingStatus, "ok");
  assert.equal(pricing.validationErrors.length, 0);

  const board = pricing.items.find((item) => item.id === "side-panel")!;
  approx(board.metrics?.areaM2 ?? 0, 0.6944);
  approx(board.pricingQuantity, 0.7638);

  const expectedBoardCost = (getUnitPriceForCatalogId("mat.board.body.dtd.white.18") ?? 0) * board.pricingQuantity;
  approx(board.itemCost ?? 0, Math.round(expectedBoardCost * 100) / 100, 0.01);

  const expectedEdgeCost = (getUnitPriceForCatalogId("mat.edge.body.abs.white.0_8") ?? 0) * 1.24;
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

  const pricing = calculateCommercialPricingFromQuoteBom({ quoteBom: bom });
  assert.equal(pricing.pricingStatus, "incomplete");
  assert.ok(pricing.validationErrors.length >= 3);
}

async function main() {
  runDrawerLowScenario();
  runCornerShelfLowerScenario();
  runFridgeTallScenario();
  runGenericBomScenario();
  runInvalidBomScenario();
  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: ["drawer_low", "corner_shelf_lower", "fridge_tall", "generic_bom", "invalid_bom"]
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
