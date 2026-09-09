import type { FwmFurnitureParams } from "./types";

function num(params: FwmFurnitureParams, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export type TallStackSlotType = "empty" | "drawer" | "shelf" | "oven" | "sink" | "microwave" | "door";

const TALL_STACK_SLOT_TYPES: readonly TallStackSlotType[] = ["empty", "drawer", "shelf", "oven", "sink", "microwave", "door"];
const DEFAULT_TALL_STACK: Array<{ type: TallStackSlotType; height: number }> = [];

function tallSlotType(params: FwmFurnitureParams, index: number): TallStackSlotType {
  const fallback = DEFAULT_TALL_STACK[index - 1]?.type ?? "empty";
  const value = String(params[`tallSlot${index}Type`] ?? fallback);
  return TALL_STACK_SLOT_TYPES.includes(value as TallStackSlotType) ? value as TallStackSlotType : fallback;
}

function tallSlotHeight(params: FwmFurnitureParams, index: number) {
  return Math.max(0, num(params, `tallSlot${index}HeightMm`, DEFAULT_TALL_STACK[index - 1]?.height ?? 0));
}

function tallSlotOffset(params: FwmFurnitureParams, index: number) {
  return num(params, `tallSlot${index}OffsetMm`, 0);
}

export type TallStackLayoutEntry = {
  type: Exclude<TallStackSlotType, "empty">;
  index: number;
  drawerIndex?: number;
  bottomY: number;
  height: number;
  coverBottom: number;
  coverTop: number;
};

/** One layout for geometry and commercial door assemblies; hasDoors never changes slot allocation. */
export function resolveTallStackLayout(params: FwmFurnitureParams) {
  const height = num(params, "height", 2080);
  const t = num(params, "boardThickness", 18);
  const plinth = num(params, "plinthHeight", 100);
  const entries: TallStackLayoutEntry[] = [];
  const slotCount = Math.max(0, Math.min(12, Math.round(num(params, "tallSlotCount", DEFAULT_TALL_STACK.length))));
  const slots = Array.from({ length: slotCount }, (_, index) => ({
    index: index + 1,
    type: tallSlotType(params, index + 1),
    height: tallSlotHeight(params, index + 1),
    offset: tallSlotOffset(params, index + 1)
  }));
  const nonShelfSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty");
  const usableBottom = plinth + t;
  const usableHeight = Math.max(80, height - plinth - t * 2);
  const fixedTotal = slots.reduce((sum, slot) => sum + (slot.type !== "shelf" && slot.type !== "empty" && slot.height > 0 ? slot.height : 0), 0);
  const fillSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty" && slot.height <= 0).length;
  const fillHeight = fillSlots > 0 ? Math.max(60, (usableHeight - fixedTotal) / fillSlots) : 0;
  const shouldScaleOverflow = String(params.tallStackMode ?? "builder") !== "builder";
  const scale = shouldScaleOverflow && fillSlots === 0 && fixedTotal > usableHeight ? usableHeight / fixedTotal : 1;
  let cursor = usableBottom;
  let drawerIndex = 1;
  let previousNonShelfType: TallStackSlotType | null = null;
  let lastShelfTopY: number | null = null;
  let shelfAtCurrentBoundary = false;
  for (const slot of slots) {
    const slotHeight = slot.height > 0 ? Math.max(8, slot.height * scale) : fillHeight;
    const slotBottomY = cursor + slot.offset;
    const isMoved = Math.abs(slot.offset) > 0.001;
    if (slot.type === "drawer") {
      entries.push({ type: "drawer", index: slot.index, drawerIndex, bottomY: slotBottomY, height: slotHeight, coverBottom: drawerIndex === 1 || shelfAtCurrentBoundary ? t : 0, coverTop: 0 });
      drawerIndex += 1;
      cursor += slotHeight;
      previousNonShelfType = slot.type;
      shelfAtCurrentBoundary = false;
    } else if (slot.type === "shelf") {
      const nextNonShelf = slots.slice(slot.index).find((candidate) => candidate.type !== "shelf" && candidate.type !== "empty")?.type ?? null;
      const topY = previousNonShelfType === "drawer" && !isMoved && (nextNonShelf === "oven" || nextNonShelf === "sink" || nextNonShelf === "microwave")
        ? cursor - num(params, "frontGap", 2) / 2
        : slotBottomY;
      if (lastShelfTopY == null || Math.abs(lastShelfTopY - topY) > 0.01) {
        entries.push({ type: "shelf", index: slot.index, bottomY: topY, height: slotHeight, coverBottom: 0, coverTop: 0 });
        lastShelfTopY = topY;
      }
      if (!isMoved) cursor = topY;
      shelfAtCurrentBoundary = !isMoved;
    } else if (slot.type === "oven" || slot.type === "sink" || slot.type === "microwave") {
      if (!shelfAtCurrentBoundary) {
        entries.push({ type: "shelf", index: slot.index, bottomY: cursor, height: num(params, "shelfThickness", t), coverBottom: 0, coverTop: 0 });
        shelfAtCurrentBoundary = true;
      }
      entries.push({ type: slot.type, index: slot.index, bottomY: slotBottomY, height: slotHeight, coverBottom: 0, coverTop: 0 });
      cursor += slotHeight;
      previousNonShelfType = slot.type;
      shelfAtCurrentBoundary = false;
    } else if (slot.type === "door") {
      const remainingFrontSlots = nonShelfSlots.filter((candidate) => candidate.index > slot.index && (candidate.type === "door" || candidate.type === "drawer"));
      const coverTop = remainingFrontSlots.length === 0 ? t + num(params, "frontGap", 2) / 2 : 0;
      entries.push({ type: "door", index: slot.index, bottomY: slotBottomY, height: slotHeight, coverBottom: shelfAtCurrentBoundary ? t : 0, coverTop });
      cursor += slotHeight;
      previousNonShelfType = slot.type;
      shelfAtCurrentBoundary = false;
    } else if (slot.type === "empty") {
      cursor += Math.max(0, slot.height);
      shelfAtCurrentBoundary = false;
    }
  }
  return { slots, entries };
}

export function resolveTallDoorFront(params: FwmFurnitureParams, slotIndex: number, bottomY: number, slotHeight: number, coverBottomMm = 0, coverTopMm = 0) {
  const width = num(params, "width", 600);
  const depth = num(params, "depth", 560);
  const frontT = num(params, "frontThicknessMm", 18);
  const sideGap = num(params, "sideGap", 2);
  const gap = num(params, "frontGap", 2);
  const leafCount = Math.max(1, Math.min(2, Math.round(num(params, `tallSlot${slotIndex}DoorLeafCount`, 1))));
  const openingMode = String(params[`tallSlot${slotIndex}DoorOpeningMode`] ?? "hinged") === "lift_up" ? "lift_up" : "hinged";
  const frontBottomY = bottomY - coverBottomMm + (coverBottomMm > 0 ? 0 : gap);
  const frontTopY = bottomY + slotHeight + coverTopMm - (coverTopMm > 0 ? 0 : gap);
  const frontHeight = Math.max(60, frontTopY - frontBottomY);
  const fullFrontWidth = Math.max(60, width - sideGap * 2);
  const leafGap = leafCount > 1 ? gap : 0;
  const leafWidth = Math.max(40, (fullFrontWidth - leafGap * (leafCount - 1)) / leafCount);
  return { depth, frontT, leafCount, openingMode, frontBottomY, frontTopY, frontHeight, fullFrontWidth, leafGap, leafWidth };
}
