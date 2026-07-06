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
import { normalizeSwingShelvesLowParams, type SwingShelvesLowParams } from "./types";

export function calculateBOM(params: SwingShelvesLowParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  const p = normalizeSwingShelvesLowParams(params);
  const source = p as Record<string, unknown>;
  const width = num(source, "width", 800);
  const height = num(source, "height", 700);
  const heightCarcass = num(source, "heightCarcass", Math.max(80, height - num(source, "worktopThicknessMm", 38)));
  const depth = num(source, "depth", 560);
  const boardT = num(source, "boardThickness", 18);
  const shelfT = num(source, "shelfThickness", boardT);
  const backT = num(source, "backThickness", 6);
  const frontT = num(source, "frontThicknessMm", 19);
  const plinthHeight = num(source, "plinthHeight", 100);
  const sideGap = num(source, "sideGap", 2);
  const topGap = num(source, "topGap", 2);
  const bottomGap = num(source, "bottomGap", 2);
  const frontGap = num(source, "frontGap", 2);
  const hingeCount = Math.max(1, Math.round(num(source, "hingeCountPerDoor", 2)));
  const shelfBoardCount = Math.max(0, Math.round(num(source, "shelfCount", 4)) - 1);

  const carcassDepth = Math.max(80, depth - frontT);
  const sideHeight = Math.max(1, heightCarcass - plinthHeight);
  const innerWidth = Math.max(1, width - boardT * 2);
  const backVisibleWidth = Math.max(1, innerWidth + 2 * num(source, "backGrooveDepthMm", 8) - num(source, "backGrooveClearanceMm", 1));
  const backVisibleHeight = Math.max(1, sideHeight - 2 * boardT + 2 * num(source, "backGrooveDepthMm", 8) - num(source, "backGrooveClearanceMm", 1));
  const shelfDepth = Math.max(40, carcassDepth - backT - 29);
  const doorDouble = source.doorDouble !== false;
  const doorCount = doorDouble ? 2 : 1;
  const meetingGap = doorDouble ? frontGap : 0;
  const doorWidth = Math.max(40, doorDouble ? (width - sideGap * 2 - meetingGap) * 0.5 : width - sideGap * 2);
  const doorHeight = Math.max(40, heightCarcass - plinthHeight - topGap - bottomGap);

  const bodyMaterial = resolveMaterial(catalog, source, "body");
  const frontMaterial = resolveMaterial(catalog, source, "front");
  const backMaterial = resolveMaterial(catalog, source, "back");
  const shelfMaterial = resolveMaterial(catalog, source, "shelf");
  const plinthMaterial = resolveMaterial(catalog, source, "plinth");
  const worktopMaterial = resolveMaterial(catalog, source, "worktop");
  const bodyRef = materialRef(bodyMaterial, "body");
  const frontRef = materialRef(frontMaterial, "front");
  const backRef = materialRef(backMaterial, "back");
  const shelfRef = materialRef(shelfMaterial, "shelf");
  const plinthRef = materialRef(plinthMaterial, "plinth");
  const worktopRef = materialRef(worktopMaterial, "worktop");
  const edgeRef = materialRef(findEdgeMaterial(catalog, frontMaterial ?? bodyMaterial), "edge");

  const items: PortableQuoteBomItem[] = [
    boardItem({ id: "leftSide", category: "carcass", description: "Left side panel", quantity: 1, length: sideHeight, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "rightSide", category: "carcass", description: "Right side panel", quantity: 1, length: sideHeight, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "bottom", category: "carcass", description: "Bottom panel", quantity: 1, length: innerWidth, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "top", category: "carcass", description: "Top panel", quantity: 1, length: innerWidth, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "back", category: "back_panel", description: "Back panel", quantity: 1, length: backVisibleWidth, width: backVisibleHeight, thickness: backT, material: backRef, slot: "back", wasteMultiplier: 1.1 })
  ];

  if (plinthHeight > 0) {
    items.push(boardItem({ id: "plinth", category: "plinth", description: "Plinth front board", quantity: 1, length: innerWidth, width: plinthHeight, thickness: boardT, material: plinthRef ?? bodyRef, slot: "plinth", wasteMultiplier: 1.1 }));
  }
  if (shelfBoardCount > 0) {
    items.push(boardItem({ id: "shelves", category: "carcass", description: "Internal shelves", quantity: shelfBoardCount, length: innerWidth, width: shelfDepth, thickness: shelfT, material: shelfRef ?? bodyRef, slot: "shelf", wasteMultiplier: 1.1 }));
  }
  items.push(boardItem({ id: "door-fronts", category: "front", description: "Door fronts", quantity: doorCount, length: doorWidth, width: doorHeight, thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 }));

  const visibleEdgeLm = round((sideHeight * 2 + innerWidth * (2 + shelfBoardCount) + Math.max(0, plinthHeight > 0 ? innerWidth : 0) + doorCount * (doorWidth * 2 + doorHeight * 2)) / 1000);
  if (edgeRef) items.push(edgeItem("visible-edge-banding", "Visible ABS edge banding", visibleEdgeLm, edgeRef, "front"));

  const hardware = [
    hardwareItem("door-handles", "Door handles", source.handleType === "none" ? 0 : doorCount, componentRef(resolveComponent(catalog, source, "handleComponentId"))),
    hardwareItem("hinges", "Door hinges", doorCount * hingeCount, componentRef(resolveComponent(catalog, source, "hingeComponentId"))),
    hardwareItem("adjustable-legs", "Adjustable legs", plinthHeight > 0 ? 5 : 0, componentRef(resolveComponent(catalog, source, "legComponentId"))),
    hardwareItem("plinth-clips", "Plinth clips", plinthHeight > 0 ? 2 : 0, componentRef(resolveComponent(catalog, source, "clipComponentId")))
  ].filter((item): item is PortableQuoteBomItem => Boolean(item));
  items.push(...hardware);

  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "swing_shelves_low",
    displayName: "Swing Shelves Low",
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: width,
      heightMm: height,
      depthMm: depth,
      wallMounted: false
    },
    materials: {
      body: bodyRef!,
      front: frontRef!,
      back: backRef!,
      shelf: shelfRef ?? bodyRef!,
      plinth: plinthRef ?? bodyRef!,
      worktop: worktopRef!
    },
    items
  };

  return {
    moduleType: "swing_shelves_low",
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog
    }),
    materialsSnapshot: null
  };
}
