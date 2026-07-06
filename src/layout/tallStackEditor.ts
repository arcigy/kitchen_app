import type { ModuleParams } from "../model/cabinetTypes";
import { isTallStackInternalEditParams } from "./moduleInternalEditing";

export type TallStackInsertType = "drawer" | "shelf" | "oven" | "sink" | "microwave" | "door";

export const TALL_STACK_INSERT_TOOLS: Array<{ type: TallStackInsertType; label: string; heightMm: number }> = [
  { type: "drawer", label: "Suflik", heightMm: 190 },
  { type: "shelf", label: "Policka", heightMm: 18 },
  { type: "oven", label: "Rura", heightMm: 600 },
  { type: "sink", label: "Drez", heightMm: 220 },
  { type: "microwave", label: "Mikrovlnka", heightMm: 390 },
  { type: "door", label: "Dvierka", heightMm: 0 }
];

const MAX_TALL_STACK_SLOTS = 12;
const MIN_REAL_SLOT_HEIGHT_MM = 60;
const MIN_SHELF_SLOT_HEIGHT_MM = 8;

type TallStackSlot = {
  type: TallStackInsertType | "empty";
  heightMm: number;
  offsetMm: number;
};

type TallStackSlotLayout = TallStackSlot & {
  index: number;
  cursorMm: number;
  resolvedHeightMm: number;
  actualBottomMm: number;
  shelfFreeBottomMm: number | null;
  shelfHiddenBottomMm: number | null;
};

type PreservedTallStackSlot = {
  type: TallStackSlot["type"];
  bottomMm: number;
};

function asRecord(params: ModuleParams): Record<string, unknown> {
  return params as Record<string, unknown>;
}

function readCount(record: Record<string, unknown>) {
  const value = record.tallSlotCount;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_TALL_STACK_SLOTS, Math.round(value)))
    : 0;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function activeSlotTypes(record: Record<string, unknown>, count: number) {
  return Array.from({ length: count }, (_, index) => String(record[`tallSlot${index + 1}Type`] ?? "empty"));
}

function readSlot(record: Record<string, unknown>, slotIndex: number): TallStackSlot {
  const rawType = String(record[`tallSlot${slotIndex}Type`] ?? "empty");
  const type = rawType === "drawer" || rawType === "shelf" || rawType === "oven" || rawType === "sink" || rawType === "microwave" || rawType === "door"
    ? rawType
    : "empty";
  const rawHeight = record[`tallSlot${slotIndex}HeightMm`];
  const heightMm = typeof rawHeight === "number" && Number.isFinite(rawHeight) ? Math.max(0, Math.round(rawHeight)) : 0;
  const rawOffset = record[`tallSlot${slotIndex}OffsetMm`];
  const offsetMm = typeof rawOffset === "number" && Number.isFinite(rawOffset) ? Math.round(rawOffset) : 0;
  return { type, heightMm, offsetMm };
}

function slotMinHeight(type: TallStackSlot["type"]) {
  if (type === "empty") return 0;
  if (type === "shelf") return MIN_SHELF_SLOT_HEIGHT_MM;
  return MIN_REAL_SLOT_HEIGHT_MM;
}

function computeTallStackSlotLayouts(record: Record<string, unknown>): TallStackSlotLayout[] {
  const currentCount = readCount(record);
  const height = Math.max(200, readNumber(record, "height", 2080));
  const plinth = Math.max(0, readNumber(record, "plinthHeight", 100));
  const boardThickness = Math.max(1, readNumber(record, "boardThickness", 18));
  const frontGap = Math.max(0, readNumber(record, "frontGap", 2));
  const slots = Array.from({ length: currentCount }, (_, index) => ({
    index: index + 1,
    ...readSlot(record, index + 1)
  }));
  const usableBottom = plinth + boardThickness;
  const usableHeight = Math.max(80, height - plinth - boardThickness * 2);
  const fixedTotal = slots.reduce((sum, slot) => (
    sum + (slot.type !== "shelf" && slot.type !== "empty" && slot.heightMm > 0 ? slot.heightMm : 0)
  ), 0);
  const fillSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty" && slot.heightMm <= 0).length;
  const fillHeight = fillSlots > 0 ? Math.max(MIN_REAL_SLOT_HEIGHT_MM, (usableHeight - fixedTotal) / fillSlots) : 0;
  const shouldScaleOverflow = String(record.tallStackMode ?? "builder") !== "builder";
  const scale = shouldScaleOverflow && fillSlots === 0 && fixedTotal > usableHeight ? usableHeight / fixedTotal : 1;

  let cursor = usableBottom;
  let previousNonShelfType: TallStackSlot["type"] | null = null;
  const layouts: TallStackSlotLayout[] = [];
  for (const slot of slots) {
    const resolvedHeightMm = slot.heightMm > 0
      ? Math.max(slotMinHeight(slot.type), slot.heightMm * scale)
      : fillHeight;
    if (slot.type === "shelf") {
      const nextNonShelf = slots.slice(slot.index).find((candidate) => candidate.type !== "shelf" && candidate.type !== "empty")?.type ?? null;
      const isMoved = Math.abs(slot.offsetMm) > 0.001;
      const shouldHideUnderDrawer = previousNonShelfType === "drawer" && !isMoved && (nextNonShelf === "oven" || nextNonShelf === "sink" || nextNonShelf === "microwave");
      const shelfHeightMm = Math.max(MIN_SHELF_SLOT_HEIGHT_MM, resolvedHeightMm);
      const shelfFreeBottomMm = cursor + slot.offsetMm - shelfHeightMm;
      const shelfHiddenBottomMm = previousNonShelfType === "drawer"
        ? cursor - frontGap / 2 - shelfHeightMm
        : null;
      const shelfTopMm = shouldHideUnderDrawer
        ? cursor - frontGap / 2
        : cursor + slot.offsetMm;
      layouts.push({
        ...slot,
        cursorMm: cursor,
        resolvedHeightMm: shelfHeightMm,
        actualBottomMm: shelfTopMm - shelfHeightMm,
        shelfFreeBottomMm,
        shelfHiddenBottomMm
      });
      if (!isMoved) cursor = shelfTopMm;
      continue;
    }

    const actualBottomMm = cursor + slot.offsetMm;
    layouts.push({
      ...slot,
      cursorMm: cursor,
      resolvedHeightMm,
      actualBottomMm,
      shelfFreeBottomMm: null,
      shelfHiddenBottomMm: null
    });
    if (slot.type === "empty") {
      cursor += Math.max(0, slot.heightMm);
      continue;
    }
    cursor += resolvedHeightMm;
    previousNonShelfType = slot.type;
  }
  return layouts;
}

function freezeAutoTallSlotHeights(record: Record<string, unknown>, exceptSlotIndex?: number) {
  for (const layout of computeTallStackSlotLayouts(record)) {
    if (layout.index === exceptSlotIndex) continue;
    if (layout.type === "empty" || layout.type === "shelf" || layout.heightMm > 0) continue;
    record[`tallSlot${layout.index}HeightMm`] = Math.max(slotMinHeight(layout.type), Math.round(layout.resolvedHeightMm));
  }
}

function captureTallStackSlotPositions(record: Record<string, unknown>, exceptSlotIndex?: number) {
  const preserved = new Map<number, PreservedTallStackSlot>();
  for (const layout of computeTallStackSlotLayouts(record)) {
    if (layout.index === exceptSlotIndex || layout.type === "empty") continue;
    preserved.set(layout.index, {
      type: layout.type,
      bottomMm: layout.actualBottomMm
    });
  }
  return preserved;
}

function restoreTallStackSlotPositions(record: Record<string, unknown>, preserved: Map<number, PreservedTallStackSlot>) {
  const layouts = new Map(computeTallStackSlotLayouts(record).map((layout) => [layout.index, layout]));
  for (const [slotIndex, target] of preserved.entries()) {
    const layout = layouts.get(slotIndex);
    if (!layout || layout.type === "empty" || layout.type !== target.type) continue;
    let nextOffset = 0;
    if (layout.type === "shelf") {
      if (layout.shelfHiddenBottomMm != null && Math.abs(target.bottomMm - layout.shelfHiddenBottomMm) < 0.5) {
        nextOffset = 0;
      } else {
        const freeBottomAtZeroOffset = layout.cursorMm - layout.resolvedHeightMm;
        nextOffset = target.bottomMm - freeBottomAtZeroOffset;
      }
    } else {
      nextOffset = target.bottomMm - layout.cursorMm;
    }
    record[`tallSlot${slotIndex}OffsetMm`] = Math.round(nextOffset);
  }
}

function writeSlots(record: Record<string, unknown>, slots: TallStackSlot[]) {
  const compacted = slots.filter((slot, index) => index < MAX_TALL_STACK_SLOTS && (slot.type !== "empty" || slot.heightMm > 0));
  record.tallSlotCount = compacted.length;
  for (let index = 1; index <= MAX_TALL_STACK_SLOTS; index += 1) {
    const slot = compacted[index - 1] ?? { type: "empty", heightMm: 0, offsetMm: 0 };
    record[`tallSlot${index}Type`] = slot.type;
    record[`tallSlot${index}HeightMm`] = Math.max(slotMinHeight(slot.type), Math.round(slot.heightMm));
    record[`tallSlot${index}OffsetMm`] = slot.type === "empty" ? 0 : Math.round(slot.offsetMm);
  }
  syncTallStackDerivedParams(record);
}

function syncTallStackDerivedParams(record: Record<string, unknown>) {
  const count = readCount(record);
  const types = activeSlotTypes(record, count);
  record.drawerCount = types.filter((slotType) => slotType === "drawer").length;
  record.shelfCount = types.filter((slotType) => slotType === "shelf").length;
  record.doorCount = types.filter((slotType) => slotType === "door").length;
  record.applianceKind = types.includes("oven") && types.includes("microwave")
    ? "oven_microwave"
    : types.includes("oven")
      ? "oven"
      : types.includes("microwave")
        ? "microwave"
        : types.includes("sink")
          ? "sink"
          : "none";
}

export function isTallStackHostParams(params: ModuleParams | null | undefined) {
  return isTallStackInternalEditParams(params);
}

export function resolveTallStackUsableBoundsMm(params: ModuleParams) {
  const record = asRecord(params);
  const hostHeightMm = Math.max(200, readNumber(record, "height", 2080));
  const plinthMm = Math.max(0, readNumber(record, "plinthHeight", readNumber(record, "plinthHeightMm", 100)));
  const boardThicknessMm = Math.max(1, readNumber(record, "boardThickness", 18));
  const bottomMm = Math.max(0, Math.min(hostHeightMm, plinthMm + boardThicknessMm));
  const topMm = Math.max(bottomMm, Math.min(hostHeightMm, hostHeightMm - boardThicknessMm));
  return {
    bottomMm,
    topMm,
    heightMm: Math.max(0, topMm - bottomMm)
  };
}

export function appendTallStackSlot(params: ModuleParams, type: TallStackInsertType) {
  if (!isTallStackHostParams(params)) return { ok: false, reason: "not_tall_stack_host" as const };
  const record = asRecord(params);
  const currentCount = readCount(record);
  freezeAutoTallSlotHeights(record);
  const preservedPositions = captureTallStackSlotPositions(record);
  const firstEmptyIndex = Array.from({ length: Math.max(currentCount, 1) }, (_, index) => index + 1)
    .find((slotIndex) => String(record[`tallSlot${slotIndex}Type`] ?? "empty") === "empty");
  const slotIndex = firstEmptyIndex ?? currentCount + 1;
  if (slotIndex > MAX_TALL_STACK_SLOTS) return { ok: false, reason: "full" as const };

  const tool = TALL_STACK_INSERT_TOOLS.find((item) => item.type === type);
  record.tallStackMode = "builder";
  record.tallSlotCount = Math.max(currentCount, slotIndex);
  record[`tallSlot${slotIndex}Type`] = type;
  record[`tallSlot${slotIndex}HeightMm`] = tool?.heightMm ?? 0;
  record[`tallSlot${slotIndex}OffsetMm`] = 0;

  for (let index = slotIndex + 1; index <= MAX_TALL_STACK_SLOTS; index += 1) {
    if (index <= Number(record.tallSlotCount)) continue;
    record[`tallSlot${index}Type`] = "empty";
    record[`tallSlot${index}HeightMm`] = 0;
    record[`tallSlot${index}OffsetMm`] = 0;
  }

  restoreTallStackSlotPositions(record, preservedPositions);
  syncTallStackDerivedParams(record);

  return { ok: true, slotIndex, type } as const;
}

export function insertTallStackSlotAt(params: ModuleParams, type: TallStackInsertType, bottomMm: number, heightMm?: number) {
  const result = appendTallStackSlot(params, type);
  if (!result.ok || typeof result.slotIndex !== "number") return result;

  const slotIndex = result.slotIndex;
  const height = typeof heightMm === "number" && Number.isFinite(heightMm)
    ? Math.max(slotMinHeight(type), Math.round(heightMm))
    : null;
  if (height != null) {
    asRecord(params)[`tallSlot${slotIndex}HeightMm`] = height;
  }

  const baseBottomMm = resolveTallStackSlotBaseBottomMm(params, slotIndex);
  if (typeof baseBottomMm === "number" && Number.isFinite(baseBottomMm)) {
    asRecord(params)[`tallSlot${slotIndex}OffsetMm`] = Math.round(bottomMm - baseBottomMm);
  }
  syncTallStackDerivedParams(asRecord(params));
  return { ...result, slotIndex } as const;
}

export function resolveTallStackSlotBaseBottomMm(params: ModuleParams, slotIndex: number) {
  if (!isTallStackHostParams(params)) return null;
  const record = asRecord(params);
  const currentCount = readCount(record);
  const targetIndex = Math.round(slotIndex);
  if (targetIndex < 1 || targetIndex > currentCount || targetIndex > MAX_TALL_STACK_SLOTS) return null;

  const height = Math.max(200, readNumber(record, "height", 2080));
  const plinth = Math.max(0, readNumber(record, "plinthHeight", 100));
  const boardThickness = Math.max(1, readNumber(record, "boardThickness", 18));
  const frontGap = Math.max(0, readNumber(record, "frontGap", 2));
  const slots = Array.from({ length: currentCount }, (_, index) => ({
    index: index + 1,
    ...readSlot(record, index + 1)
  }));
  const usableBottom = plinth + boardThickness;
  const usableHeight = Math.max(80, height - plinth - boardThickness * 2);
  const fixedTotal = slots.reduce((sum, slot) => (
    sum + (slot.type !== "shelf" && slot.type !== "empty" && slot.heightMm > 0 ? slot.heightMm : 0)
  ), 0);
  const fillSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty" && slot.heightMm <= 0).length;
  const fillHeight = fillSlots > 0 ? Math.max(MIN_REAL_SLOT_HEIGHT_MM, (usableHeight - fixedTotal) / fillSlots) : 0;
  const shouldScaleOverflow = String(record.tallStackMode ?? "builder") !== "builder";
  const scale = shouldScaleOverflow && fillSlots === 0 && fixedTotal > usableHeight ? usableHeight / fixedTotal : 1;

  let cursor = usableBottom;
  let previousNonShelfType: TallStackSlot["type"] | null = null;
  for (const slot of slots) {
    const slotHeight = slot.heightMm > 0 ? Math.max(MIN_SHELF_SLOT_HEIGHT_MM, slot.heightMm * scale) : fillHeight;
    if (slot.type === "shelf") {
      const nextNonShelf = slots.slice(slot.index).find((candidate) => candidate.type !== "shelf" && candidate.type !== "empty")?.type ?? null;
      const isMoved = Math.abs(slot.offsetMm) > 0.001;
      const shelfTop = previousNonShelfType === "drawer" && !isMoved && (nextNonShelf === "oven" || nextNonShelf === "sink" || nextNonShelf === "microwave")
        ? cursor - frontGap / 2
        : cursor + slot.offsetMm;
      if (slot.index === targetIndex) return shelfTop - slotHeight;
      if (!isMoved) cursor = shelfTop;
      continue;
    }

    if (slot.type === "empty") {
      if (slot.index === targetIndex) return cursor;
      cursor += Math.max(0, slot.heightMm);
      continue;
    }

    if (slot.index === targetIndex) return cursor;
    cursor += slotHeight;
    previousNonShelfType = slot.type;
  }
  return null;
}

export function removeTallStackSlot(params: ModuleParams, slotIndex: number) {
  if (!isTallStackHostParams(params)) return { ok: false, reason: "not_tall_stack_host" as const };
  const record = asRecord(params);
  const currentCount = readCount(record);
  const index = Math.round(slotIndex);
  if (index < 1 || index > currentCount || index > MAX_TALL_STACK_SLOTS) return { ok: false, reason: "missing_slot" as const };
  const currentType = String(record[`tallSlot${index}Type`] ?? "empty");
  if (currentType === "empty") return { ok: false, reason: "empty_slot" as const };

  const preservedPositions = captureTallStackSlotPositions(record, index);
  freezeAutoTallSlotHeights(record, index);
  record[`tallSlot${index}Type`] = "empty";
  record[`tallSlot${index}HeightMm`] = 0;
  record[`tallSlot${index}OffsetMm`] = 0;
  while (readCount(record) > 0 && String(record[`tallSlot${readCount(record)}Type`] ?? "empty") === "empty") {
    record.tallSlotCount = Math.max(0, readCount(record) - 1);
  }
  restoreTallStackSlotPositions(record, preservedPositions);
  syncTallStackDerivedParams(record);
  return { ok: true, slotIndex: index } as const;
}

export function moveTallStackSlot(params: ModuleParams, slotIndex: number, deltaMm: number) {
  if (!isTallStackHostParams(params)) return { ok: false, reason: "not_tall_stack_host" as const };
  const record = asRecord(params);
  const currentCount = readCount(record);
  const index = Math.round(slotIndex) - 1;
  if (index < 0 || index >= currentCount) return { ok: false, reason: "missing_slot" as const };
  const delta = Math.round(deltaMm);
  if (!Number.isFinite(delta) || delta === 0) return { ok: false, reason: "zero_delta" as const };

  const selected = readSlot(record, index + 1);
  if (!selected || selected.type === "empty") return { ok: false, reason: "missing_slot" as const };
  const offsetKey = `tallSlot${index + 1}OffsetMm`;
  const nextOffset = selected.offsetMm + delta;
  record[offsetKey] = Math.round(nextOffset);
  syncTallStackDerivedParams(record);
  return { ok: true, movedMm: delta, slotIndex: index + 1 } as const;
}

export function copyTallStackSlot(params: ModuleParams, slotIndex: number, deltaMm: number) {
  if (!isTallStackHostParams(params)) return { ok: false, reason: "not_tall_stack_host" as const };
  const record = asRecord(params);
  const currentCount = readCount(record);
  const sourceIndex = Math.round(slotIndex);
  if (sourceIndex < 1 || sourceIndex > currentCount || sourceIndex > MAX_TALL_STACK_SLOTS) {
    return { ok: false, reason: "missing_slot" as const };
  }
  const source = readSlot(record, sourceIndex);
  if (!source || source.type === "empty") return { ok: false, reason: "missing_slot" as const };
  const copyIndex = Array.from({ length: Math.max(currentCount, 1) }, (_, index) => index + 1)
    .find((candidateIndex) => String(record[`tallSlot${candidateIndex}Type`] ?? "empty") === "empty") ?? currentCount + 1;
  if (copyIndex > MAX_TALL_STACK_SLOTS) return { ok: false, reason: "full" as const };

  const delta = Math.round(deltaMm);
  if (!Number.isFinite(delta)) return { ok: false, reason: "invalid_delta" as const };
  freezeAutoTallSlotHeights(record);
  const frozenSource = readSlot(record, sourceIndex);
  const preservedPositions = captureTallStackSlotPositions(record);
  record.tallStackMode = "builder";
  record.tallSlotCount = Math.max(currentCount, copyIndex);
  record[`tallSlot${copyIndex}Type`] = frozenSource.type;
  record[`tallSlot${copyIndex}HeightMm`] = frozenSource.heightMm;
  record[`tallSlot${copyIndex}OffsetMm`] = frozenSource.offsetMm + delta;
  restoreTallStackSlotPositions(record, preservedPositions);
  syncTallStackDerivedParams(record);
  return { ok: true, copiedMm: delta, sourceSlotIndex: sourceIndex, slotIndex: copyIndex } as const;
}
