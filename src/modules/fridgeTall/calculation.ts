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
import { normalizeFridgeTallParams, type FridgeTallParams } from "./types";

export function calculateBOM(params: FridgeTallParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  const p = normalizeFridgeTallParams(params);
  const source = p as Record<string, unknown>;
  const width = num(source, "width", 600);
  const height = num(source, "height", 1916);
  const depth = num(source, "depth", 600);
  const boardT = num(source, "boardThickness", 18);
  const backT = num(source, "backThickness", 6);
  const frontT = num(source, "frontThicknessMm", 18);
  const plinthHeight = num(source, "plinthHeight", 100);
  const plinthSetback = num(source, "plinthSetbackMm", 60);
  const sideGap = num(source, "sideGap", 0);
  const fridgeDoorGap = num(source, "fridgeDoorGapMm", 2);
  const freezerDoorHeight = Math.max(1, num(source, "freezerDoorHeightMm", 700) + boardT);
  const sideHeight = Math.max(1, height - plinthHeight);
  const innerWidth = Math.max(1, width - boardT * 2);
  const doorWidth = Math.max(40, width - sideGap * 2);
  const visibleDoorStackHeight = Math.max(1, height - plinthHeight);
  const clampedFreezerDoorHeight = Math.min(freezerDoorHeight, Math.max(1, visibleDoorStackHeight - fridgeDoorGap - 1));
  const fridgeDoorHeight = Math.max(1, visibleDoorStackHeight - clampedFreezerDoorHeight - fridgeDoorGap);

  const bodyMaterial = resolveMaterial(catalog, source, "body");
  const frontMaterial = resolveMaterial(catalog, source, "front");
  const backMaterial = resolveMaterial(catalog, source, "back");
  const plinthMaterial = resolveMaterial(catalog, source, "plinth");
  const bodyRef = materialRef(bodyMaterial, "body");
  const frontRef = materialRef(frontMaterial, "front");
  const backRef = materialRef(backMaterial, "back");
  const plinthRef = materialRef(plinthMaterial, "plinth");
  const edgeRef = materialRef(findEdgeMaterial(catalog, frontMaterial ?? bodyMaterial), "edge");

  const items: PortableQuoteBomItem[] = [
    boardItem({ id: "leftSide", category: "carcass", description: "Left side panel", quantity: 1, length: sideHeight, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "rightSide", category: "carcass", description: "Right side panel", quantity: 1, length: sideHeight, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "bottom", category: "carcass", description: "Bottom panel", quantity: 1, length: innerWidth, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "top", category: "carcass", description: "Top panel", quantity: 1, length: innerWidth, width: depth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "back", category: "back_panel", description: "Back panel", quantity: 1, length: width, width: sideHeight, thickness: backT, material: backRef ?? bodyRef, slot: "back", wasteMultiplier: 1.1 }),
    boardItem({ id: "freezerDoorFront", category: "front", description: "Freezer door front", quantity: 1, length: doorWidth, width: clampedFreezerDoorHeight, thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 }),
    boardItem({ id: "fridgeDoorFront", category: "front", description: "Fridge door front", quantity: 1, length: doorWidth, width: fridgeDoorHeight, thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 })
  ];

  if (plinthHeight > 0) {
    items.push(boardItem({
      id: "kickboard",
      category: "plinth",
      description: "Plinth front board",
      quantity: 1,
      length: width,
      width: plinthHeight,
      thickness: Math.max(8, Math.min(boardT, 24)),
      material: plinthRef ?? bodyRef,
      slot: "plinth",
      wasteMultiplier: 1.1
    }));
  }

  const visibleEdgeLm = round((sideHeight * 2 + innerWidth * 2 + width + doorWidth * 2 + clampedFreezerDoorHeight * 2 + fridgeDoorHeight * 2 + (plinthHeight > 0 ? width : 0)) / 1000);
  if (edgeRef) items.push(edgeItem("visible-edge-banding", "Visible ABS edge banding", visibleEdgeLm, edgeRef, "front"));

  const hardware = [
    hardwareItem("door-handles", "Door handles", source.handleType === "none" ? 0 : 2, componentRef(resolveComponent(catalog, source, "handleComponentId"))),
    hardwareItem("fridge-door-hinges", "Integrated fridge door hinges", 6, componentRef(resolveComponent(catalog, source, "hingeComponentId"))),
    hardwareItem("adjustable-legs", "Adjustable legs", plinthHeight > 0 ? 4 : 0, componentRef(resolveComponent(catalog, source, "legComponentId"))),
    hardwareItem("plinth-clips", "Plinth clips", plinthHeight > 0 && plinthSetback >= 0 ? 2 : 0, componentRef(resolveComponent(catalog, source, "clipComponentId")))
  ].filter((item): item is PortableQuoteBomItem => Boolean(item));
  items.push(...hardware);

  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "fridge_tall",
    displayName: "Fridge Tall",
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
      back: backRef ?? bodyRef!,
      plinth: plinthRef ?? bodyRef!,
      worktop: bodyRef!
    },
    items
  };

  return {
    moduleType: "fridge_tall",
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog
    }),
    materialsSnapshot: null
  };
}
