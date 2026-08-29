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
import { normalizeFlapShelvesLowParams, type FlapShelvesLowParams } from "./types";

export function calculateBOM(params: FlapShelvesLowParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  const p = normalizeFlapShelvesLowParams(params);
  const source = p as Record<string, unknown>;
  const width = num(source, "width", 900);
  const height = num(source, "height", 720);
  const depth = num(source, "depth", 560);
  const boardT = num(source, "boardThickness", 18);
  const backT = num(source, "backThickness", 8);
  const frontT = num(source, "frontThicknessMm", 18);
  const shelfT = num(source, "shelfThickness", boardT);
  const shelfCount = Math.max(1, Math.round(num(source, "shelfCount", 3)));
  const sideGap = num(source, "sideGap", 2);
  const topGap = num(source, "topGap", 2);
  const bottomGap = num(source, "bottomGap", 2);

  const innerWidth = Math.max(1, width - boardT * 2);
  const innerHeight = Math.max(1, height - boardT * 2);
  const innerDepth = Math.max(1, depth - backT);
  const frontWidth = Math.max(1, width - sideGap * 2);
  const frontHeight = Math.max(1, height - topGap - bottomGap);

  const bodyMaterial = resolveMaterial(catalog, source, "body");
  const frontMaterial = resolveMaterial(catalog, source, "front");
  const backMaterial = resolveMaterial(catalog, source, "back");
  const shelfMaterial = resolveMaterial(catalog, source, "shelf");
  const bodyRef = materialRef(bodyMaterial, "body");
  const frontRef = materialRef(frontMaterial, "front");
  const backRef = materialRef(backMaterial, "back");
  const shelfRef = materialRef(shelfMaterial, "shelf");
  const edgeRef = materialRef(findEdgeMaterial(catalog, frontMaterial ?? bodyMaterial), "edge");

  const items: PortableQuoteBomItem[] = [
    boardItem({ id: "carcass-side-left", category: "carcass", description: "Carcass side left", quantity: 1, length: height, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "carcass-side-right", category: "carcass", description: "Carcass side right", quantity: 1, length: height, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "carcass-bottom", category: "carcass", description: "Carcass bottom", quantity: 1, length: innerWidth, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "carcass-top", category: "carcass", description: "Carcass top", quantity: 1, length: innerWidth, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "carcass-back", category: "back_panel", description: "Carcass back", quantity: 1, length: innerWidth, width: innerHeight, thickness: backT, material: backRef, slot: "back", wasteMultiplier: 1.1 }),
    boardItem({ id: "shelves", category: "carcass", description: "Internal shelves", quantity: shelfCount, length: innerWidth, width: innerDepth, thickness: shelfT, material: shelfRef ?? bodyRef, slot: "shelf", wasteMultiplier: 1.1 }),
    boardItem({ id: "door-front", category: "front", description: "Flap front", quantity: 1, length: frontWidth, width: frontHeight, thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 })
  ];

  const visibleEdgeLm = round((height * 2 + innerWidth * (2 + shelfCount) + frontWidth * 2 + frontHeight * 2) / 1000);
  if (edgeRef) items.push(edgeItem("visible-edge-banding", "Visible ABS edge banding", visibleEdgeLm, edgeRef, "front"));

  const hardware = [
    hardwareItem("door-handle", "Door handle", source.handleType === "none" ? 0 : 1, componentRef(resolveComponent(catalog, source, "handleComponentId"))),
    hardwareItem("lift-up-fittings", "Lift-up fittings", 2, componentRef(resolveComponent(catalog, source, "liftUpComponentId"))),
    hardwareItem("hanging-brackets", "Wall hanging brackets", 2, componentRef(resolveComponent(catalog, source, "hangingBracketComponentId"))),
    hardwareItem("shelf-supports", "Shelf supports", shelfCount * 4, componentRef(resolveComponent(catalog, source, "shelfSupportComponentId")))
  ].filter((item): item is PortableQuoteBomItem => Boolean(item));
  items.push(...hardware);

  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "flap_shelves_low",
    displayName: "Flap Shelves Low",
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: width,
      heightMm: height,
      depthMm: depth,
      wallMounted: true
    },
    materials: {
      body: bodyRef!,
      front: frontRef!,
      back: backRef!,
      shelf: shelfRef ?? bodyRef!,
      plinth: bodyRef!,
      worktop: bodyRef!
    },
    items
  };

  return {
    moduleType: "flap_shelves_low",
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog
    }),
    materialsSnapshot: null
  };
}
