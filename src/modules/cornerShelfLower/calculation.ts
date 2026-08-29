import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { BOMResult } from "../../layout/bom/bomTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import {
  calculateCommercialPricingFromQuoteBom,
  type PortableQuoteBomItem,
  type PortableQuoteBomPayload
} from "../runtime/portableCommercial";
import {
  boardItem,
  componentRef,
  edgeItem,
  findEdgeMaterial,
  hardwareItem,
  materialRef,
  num,
  resolveComponent,
  resolveMaterial,
  round
} from "../runtime/parametricCommercialBom";
import { normalizeCornerShelfLowerParams, type CornerShelfLowerParams } from "./types";

export function calculateBOM(params: CornerShelfLowerParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  const p = normalizeCornerShelfLowerParams(params);
  const source = p as Record<string, unknown>;
  const lengthX = num(source, "lengthX", 1000);
  const lengthZ = num(source, "lengthZ", 1000);
  const depth = num(source, "depth", 560);
  const height = num(source, "height", 720);
  const worktopT = num(source, "worktopThicknessMm", 38);
  const heightCarcass = num(source, "heightCarcass", Math.max(50, height - worktopT));
  const boardT = num(source, "boardThickness", 18);
  const backT = num(source, "backThickness", 6);
  const frontT = num(source, "frontThicknessMm", 18);
  const plinthHeight = num(source, "plinthHeight", 100);
  const plinthSetback = num(source, "plinthSetbackMm", 60);
  const sideGap = num(source, "sideGap", 2);
  const topGap = num(source, "topGap", 2);
  const bottomGap = num(source, "bottomGap", 2);
  const shelfPairCount = Math.max(0, Math.round(num(source, "shelfCount", 4)) - 1);
  const hingeCount = Math.max(1, Math.round(num(source, "hingeCountPerDoor", 2)));

  const sideHeight = Math.max(1, heightCarcass - plinthHeight);
  const innerLengthX = Math.max(1, lengthX - boardT);
  const innerLengthZ = Math.max(1, lengthZ - boardT);
  const shelfXLength = Math.max(1, lengthX - depth + boardT);
  const shelfZLength = Math.max(1, lengthZ - depth + boardT);
  const shelfDepth = Math.max(1, depth - backT - boardT * 0.5);
  const doorHeight = Math.max(1, heightCarcass - plinthHeight - topGap - bottomGap);
  const doorWidthX = Math.max(40, depth - sideGap * 2 - frontT);
  const doorWidthZ = Math.max(40, depth - sideGap * 2 - frontT);

  const bodyMaterial = resolveMaterial(catalog, source, "body");
  const frontMaterial = resolveMaterial(catalog, source, "front");
  const backMaterial = resolveMaterial(catalog, source, "back");
  const shelfMaterial = resolveMaterial(catalog, source, "shelf");
  const plinthMaterial = resolveMaterial(catalog, source, "plinth");
  const bodyRef = materialRef(bodyMaterial, "body");
  const frontRef = materialRef(frontMaterial, "front");
  const backRef = materialRef(backMaterial, "back");
  const shelfRef = materialRef(shelfMaterial, "shelf");
  const plinthRef = materialRef(plinthMaterial, "plinth");
  const edgeRef = materialRef(findEdgeMaterial(catalog, frontMaterial ?? bodyMaterial), "edge");

  const items: PortableQuoteBomItem[] = [
    boardItem({ id: "left-side", category: "carcass", description: "Left side panel", quantity: 1, length: sideHeight, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "right-side", category: "carcass", description: "Right side panel", quantity: 1, length: sideHeight, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "back-panel-x", category: "back_panel", description: "Back panel X", quantity: 1, length: innerLengthX, width: sideHeight, thickness: backT, material: backRef ?? bodyRef, slot: "back", wasteMultiplier: 1.1 }),
    boardItem({ id: "back-panel-z", category: "back_panel", description: "Back panel Z", quantity: 1, length: innerLengthZ, width: sideHeight, thickness: backT, material: backRef ?? bodyRef, slot: "back", wasteMultiplier: 1.1 }),
    boardItem({ id: "bottom-panel-x", category: "carcass", description: "Bottom panel X", quantity: 1, length: innerLengthX, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "bottom-panel-z", category: "carcass", description: "Bottom panel Z", quantity: 1, length: shelfZLength, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "top-rails-x", category: "carcass", description: "Top rails X", quantity: 2, length: innerLengthX, width: 80, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "top-panel-z", category: "carcass", description: "Top panel Z", quantity: 1, length: shelfZLength, width: 80, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 })
  ];

  if (shelfPairCount > 0) {
    items.push(
      boardItem({ id: "shelves-x", category: "shelf", description: "Shelves X", quantity: shelfPairCount, length: shelfXLength, width: shelfDepth, thickness: boardT, material: shelfRef ?? bodyRef, slot: "shelf", wasteMultiplier: 1.1 }),
      boardItem({ id: "shelves-z", category: "shelf", description: "Shelves Z", quantity: shelfPairCount, length: shelfZLength, width: shelfDepth, thickness: boardT, material: shelfRef ?? bodyRef, slot: "shelf", wasteMultiplier: 1.1 })
    );
  }

  if (plinthHeight > 0) {
    items.push(
      boardItem({ id: "plinth-x", category: "plinth", description: "Plinth X", quantity: 1, length: Math.max(1, lengthX - depth - plinthSetback), width: plinthHeight, thickness: Math.max(8, Math.min(boardT, 24)), material: plinthRef ?? bodyRef, slot: "plinth", wasteMultiplier: 1.1 }),
      boardItem({ id: "plinth-z", category: "plinth", description: "Plinth Z", quantity: 1, length: Math.max(1, lengthZ - depth - plinthSetback), width: plinthHeight, thickness: Math.max(8, Math.min(boardT, 24)), material: plinthRef ?? bodyRef, slot: "plinth", wasteMultiplier: 1.1 })
    );
  }

  items.push(
    boardItem({ id: "door-front-z", category: "front", description: "Door front Z", quantity: 1, length: doorWidthZ, width: doorHeight, thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 }),
    boardItem({ id: "door-front-x", category: "front", description: "Door front X", quantity: 1, length: doorWidthX, width: doorHeight, thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 })
  );

  const visibleEdgeLm = round((sideHeight * 2 + innerLengthX * 3 + innerLengthZ * 2 + shelfPairCount * (shelfXLength + shelfZLength) + doorWidthX * 2 + doorWidthZ * 2 + doorHeight * 4) / 1000);
  if (edgeRef) items.push(edgeItem("visible-edge-banding", "Visible ABS edge banding", visibleEdgeLm, edgeRef, "front"));

  const hardware = [
    hardwareItem("door-handles", "Door handles", source.handleType === "none" ? 0 : 2, componentRef(resolveComponent(catalog, source, "handleComponentId"))),
    hardwareItem("corner-hinges", "Corner hinges", 2 * hingeCount, componentRef(resolveComponent(catalog, source, "hingeComponentId"))),
    hardwareItem("adjustable-legs", "Adjustable legs", plinthHeight > 0 ? 5 : 0, componentRef(resolveComponent(catalog, source, "legComponentId"))),
    hardwareItem("plinth-clips", "Plinth clips", plinthHeight > 0 ? 2 : 0, componentRef(resolveComponent(catalog, source, "clipComponentId")))
  ].filter((item): item is PortableQuoteBomItem => Boolean(item));
  items.push(...hardware);

  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "corner_shelf_lower",
    displayName: "Corner Shelf Lower",
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: lengthX,
      heightMm: height,
      depthMm: lengthZ,
      wallMounted: false
    },
    materials: {
      body: bodyRef!,
      front: frontRef!,
      back: backRef ?? bodyRef!,
      shelf: shelfRef ?? bodyRef!,
      plinth: plinthRef ?? bodyRef!,
      worktop: bodyRef!
    },
    items
  };

  return {
    moduleType: "corner_shelf_lower",
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog
    }),
    materialsSnapshot: null
  };
}
