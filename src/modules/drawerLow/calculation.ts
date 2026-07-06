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
import { normalizeDrawerLowParams, type DrawerLowParams } from "./types";

function arrayNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

export function calculateBOM(params: DrawerLowParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  const p = normalizeDrawerLowParams(params);
  const source = p as Record<string, unknown>;
  const width = num(source, "width", 800);
  const height = num(source, "height", 700);
  const depth = num(source, "depth", 560);
  const worktopT = num(source, "worktopThicknessMm", 38);
  const heightCarcass = num(source, "heightCarcass", Math.max(50, height - worktopT));
  const plinthHeight = num(source, "plinthHeight", 100);
  const boardT = num(source, "boardThickness", 18);
  const backT = num(source, "backThickness", 6);
  const frontT = num(source, "frontThicknessMm", 18);
  const drawerBoxT = num(source, "drawerBoxThickness", 13);
  const drawerBottomT = num(source, "drawerBottomThickness", drawerBoxT);
  const drawerBoxSideHeight = num(source, "drawerBoxSideHeight", 110);
  const drawerBackReserve = num(source, "drawerBackReserveMm", 10);
  const sideClearance = num(source, "sideClearanceMm", 4);
  const sideGap = num(source, "sideGap", 2);
  const frontGap = num(source, "frontGap", 2);
  const drawerCount = Math.max(1, Math.round(num(source, "drawerCount", 3)));
  const carcassDepth = Math.max(80, depth - frontT);
  const sideHeight = Math.max(1, heightCarcass - plinthHeight);
  const innerWidth = Math.max(1, width - boardT * 2);
  const topRailDepth = Math.min(carcassDepth * 0.25, Math.max(60, boardT * 3));
  const backVisibleWidth = Math.max(1, innerWidth + 2 * num(source, "backGrooveDepthMm", 8) - num(source, "backGrooveClearanceMm", 1));
  const backVisibleHeight = Math.max(1, sideHeight - 2 * boardT + 2 * num(source, "backGrooveDepthMm", 8) - num(source, "backGrooveClearanceMm", 1));
  const drawerSideDepth = Math.max(50, carcassDepth - backT - drawerBackReserve - 11);
  const drawerOuterWidth = Math.max(40, width - 2 * boardT - sideClearance * 2);
  const drawerBackWidth = Math.max(20, drawerOuterWidth - drawerBoxT * 2);
  const drawerBottomWidth = Math.max(1, drawerOuterWidth - drawerBoxT * 2);
  const drawerBottomDepth = Math.max(1, drawerSideDepth - drawerBoxT);
  const frontWidth = Math.max(1, width - sideGap * 2);
  const frontHeights = arrayNumbers(source.drawerFrontHeights);
  const drawerFrontTotalHeight = frontHeights.reduce((sum, value) => sum + Math.max(1, value), 0);

  const bodyMaterial = resolveMaterial(catalog, source, "body");
  const frontMaterial = resolveMaterial(catalog, source, "front");
  const backMaterial = resolveMaterial(catalog, source, "back");
  const drawerBottomMaterial = resolveMaterial(catalog, source, "drawer_bottom");
  const plinthMaterial = resolveMaterial(catalog, source, "plinth");
  const bodyRef = materialRef(bodyMaterial, "body");
  const frontRef = materialRef(frontMaterial, "front");
  const backRef = materialRef(backMaterial, "back");
  const drawerBottomRef = materialRef(drawerBottomMaterial, "drawer_bottom");
  const plinthRef = materialRef(plinthMaterial, "plinth");
  const edgeRef = materialRef(findEdgeMaterial(catalog, frontMaterial ?? bodyMaterial), "edge");

  const items: PortableQuoteBomItem[] = [
    boardItem({ id: "leftSide", category: "carcass", description: "Left side panel", quantity: 1, length: sideHeight, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "rightSide", category: "carcass", description: "Right side panel", quantity: 1, length: sideHeight, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "bottom", category: "carcass", description: "Bottom panel", quantity: 1, length: innerWidth, width: carcassDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "topRails", category: "carcass", description: "Top rails", quantity: 2, length: innerWidth, width: topRailDepth, thickness: boardT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.1 }),
    boardItem({ id: "back", category: "back_panel", description: "Back panel", quantity: 1, length: backVisibleWidth, width: backVisibleHeight, thickness: backT, material: backRef ?? bodyRef, slot: "back", wasteMultiplier: 1.1 }),
    boardItem({ id: "drawerFronts", category: "front", description: "Drawer fronts", quantity: 1, length: frontWidth, width: Math.max(1, drawerFrontTotalHeight), thickness: frontT, material: frontRef, slot: "front", wasteMultiplier: 1.1 }),
    boardItem({ id: "drawerBoxSides", category: "drawer_box", description: "Drawer box side panels", quantity: drawerCount * 2, length: drawerSideDepth, width: drawerBoxSideHeight, thickness: drawerBoxT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.05 }),
    boardItem({ id: "drawerBoxBacks", category: "drawer_box", description: "Drawer box backs", quantity: drawerCount, length: drawerBackWidth, width: drawerBoxSideHeight, thickness: drawerBoxT, material: bodyRef, slot: "carcass", wasteMultiplier: 1.05 }),
    boardItem({ id: "drawerBottoms", category: "drawer_bottom", description: "Drawer bottoms", quantity: drawerCount, length: drawerBottomWidth, width: drawerBottomDepth, thickness: drawerBottomT, material: drawerBottomRef ?? bodyRef, slot: "drawer_bottom", wasteMultiplier: 1.05 })
  ];

  if (plinthHeight > 0) {
    items.push(boardItem({ id: "kick", category: "plinth", description: "Plinth front board", quantity: 1, length: width, width: plinthHeight, thickness: Math.max(8, Math.min(boardT, 24)), material: plinthRef ?? bodyRef, slot: "plinth", wasteMultiplier: 1.1 }));
  }

  const visibleEdgeLm = round((sideHeight * 2 + innerWidth * 3 + topRailDepth * 4 + frontWidth * drawerCount + drawerFrontTotalHeight * 2 + (plinthHeight > 0 ? width : 0)) / 1000);
  if (edgeRef) items.push(edgeItem("visible-edge-banding", "Visible ABS edge banding", visibleEdgeLm, edgeRef, "front"));

  const hardware = [
    hardwareItem("handles", "Drawer handles", source.handleType === "none" ? 0 : drawerCount, componentRef(resolveComponent(catalog, source, "handleComponentId"))),
    hardwareItem("drawer-runners", "Drawer runner pairs", drawerCount, componentRef(resolveComponent(catalog, source, "runnerComponentId"))),
    hardwareItem("adjustable-legs", "Adjustable legs", plinthHeight > 0 ? 4 : 0, componentRef(resolveComponent(catalog, source, "legComponentId"))),
    hardwareItem("plinth-clips", "Plinth clips", plinthHeight > 0 ? 2 : 0, componentRef(resolveComponent(catalog, source, "clipComponentId")))
  ].filter((item): item is PortableQuoteBomItem => Boolean(item));
  items.push(...hardware);

  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "drawer_low",
    displayName: "Drawer Low",
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
      drawer_bottom: drawerBottomRef ?? bodyRef!,
      plinth: plinthRef ?? bodyRef!,
      worktop: bodyRef!
    },
    items
  };

  return {
    moduleType: "drawer_low",
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog
    }),
    materialsSnapshot: null
  };
}
