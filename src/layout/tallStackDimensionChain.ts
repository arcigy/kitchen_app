import type { ModuleParams } from "../model/cabinetTypes";
import { isTallStackHostParams } from "./tallStackEditor";

export type TallStackDimensionSlotType = "drawer" | "shelf" | "oven" | "sink" | "microwave" | "door" | "empty";

export type TallStackDimensionSegment = {
  segmentIndex: number;
  slotIndex: number;
  type: TallStackDimensionSlotType;
  bottomMm: number;
  topMm: number;
  heightMm: number;
  paramKey: string;
};

export type TallStackDimensionBoundary = {
  boundaryIndex: number;
  yMm: number;
  lowerSegmentIndex: number | null;
  upperSegmentIndex: number | null;
  isBottom: boolean;
  isTop: boolean;
};

export type TallStackDimensionChain = {
  hostHeightMm: number;
  contentBottomMm: number;
  contentTopMm: number;
  segments: TallStackDimensionSegment[];
  boundaries: TallStackDimensionBoundary[];
};

export type TallStackDimensionEditResult =
  | { ok: true; params: ModuleParams }
  | { ok: false; reason: "not_tall_stack_host" | "missing_segment" | "missing_boundary" | "not_adjacent" | "below_minimum" };

const MAX_TALL_STACK_SLOTS = 12;

function asRecord(params: ModuleParams): Record<string, unknown> {
  return params as Record<string, unknown>;
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readSlotType(record: Record<string, unknown>, slotIndex: number): TallStackDimensionSlotType {
  const raw = String(record[`tallSlot${slotIndex}Type`] ?? "empty");
  return raw === "drawer" || raw === "shelf" || raw === "oven" || raw === "sink" || raw === "microwave" || raw === "door"
    ? raw
    : "empty";
}

function readSlotHeight(record: Record<string, unknown>, slotIndex: number) {
  return readNumber(record, `tallSlot${slotIndex}HeightMm`, 0);
}

function readSlotOffset(record: Record<string, unknown>, slotIndex: number) {
  return readNumber(record, `tallSlot${slotIndex}OffsetMm`, 0);
}

function minHeightForType(type: TallStackDimensionSlotType) {
  if (type === "empty") return 0;
  return type === "shelf" ? 8 : 60;
}

function readSlotCount(record: Record<string, unknown>) {
  return Math.max(0, Math.min(MAX_TALL_STACK_SLOTS, Math.round(readNumber(record, "tallSlotCount", 0))));
}

export function shouldShowTallStackDimensionChainForView(viewMode: "2d" | "3d", activeViewerTab: string) {
  if (activeViewerTab.startsWith("elevation:")) return true;
  if (viewMode !== "2d") return false;
  return activeViewerTab !== "floorplan" && activeViewerTab !== "3d" && !activeViewerTab.startsWith("camera:");
}

export function resolveTallStackDimensionChain(params: ModuleParams): TallStackDimensionChain {
  const record = asRecord(params);
  const hostHeightMm = Math.max(200, readNumber(record, "height", 2080));
  const plinthMm = Math.max(0, readNumber(record, "plinthHeight", 100));
  const boardThicknessMm = Math.max(1, readNumber(record, "boardThickness", 18));
  const frontGapMm = Math.max(0, readNumber(record, "frontGap", 2));
  const slotCount = readSlotCount(record);
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const slotIndex = index + 1;
    return {
      slotIndex,
      type: readSlotType(record, slotIndex),
      authoredHeightMm: readSlotHeight(record, slotIndex),
      offsetMm: readSlotOffset(record, slotIndex)
    };
  });
  const usableBottom = plinthMm + boardThicknessMm;
  const usableHeight = Math.max(80, hostHeightMm - plinthMm - boardThicknessMm * 2);
  const fixedTotal = slots.reduce((sum, slot) => {
    return sum + (slot.type !== "shelf" && slot.type !== "empty" && slot.authoredHeightMm > 0 ? slot.authoredHeightMm : 0);
  }, 0);
  const fillSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty" && slot.authoredHeightMm <= 0).length;
  const fillHeight = fillSlots > 0 ? Math.max(60, (usableHeight - fixedTotal) / fillSlots) : 0;
  const shouldScaleOverflow = String(record.tallStackMode ?? "builder") !== "builder";
  const scale = shouldScaleOverflow && fillSlots === 0 && fixedTotal > usableHeight ? usableHeight / fixedTotal : 1;

  let cursor = usableBottom;
  const realSegments: TallStackDimensionSegment[] = [];
  let previousNonShelfType: TallStackDimensionSlotType | null = null;
  for (const slot of slots) {
    if (slot.type === "empty") {
      cursor += Math.max(0, slot.authoredHeightMm);
      continue;
    }
    if (slot.type === "shelf") {
      const isMoved = Math.abs(slot.offsetMm) > 0.001;
      const nextNonShelfType = slots
        .slice(slot.slotIndex)
        .find((candidate) => candidate.type !== "shelf" && candidate.type !== "empty")?.type ?? null;
      const shouldDimensionShelf = isMoved || (!previousNonShelfType && !nextNonShelfType);
      const shelfHeightMm = Math.max(minHeightForType(slot.type), slot.authoredHeightMm);
      const shelfTopMm = previousNonShelfType === "drawer" && !isMoved && (nextNonShelfType === "oven" || nextNonShelfType === "sink" || nextNonShelfType === "microwave")
        ? cursor - frontGapMm / 2
        : cursor + slot.offsetMm;
      const bottomMm = shelfTopMm - shelfHeightMm;
      if (shouldDimensionShelf) {
        realSegments.push({
          segmentIndex: realSegments.length,
          slotIndex: slot.slotIndex,
          type: slot.type,
          bottomMm,
          topMm: shelfTopMm,
          heightMm: shelfHeightMm,
          paramKey: `tallSlot${slot.slotIndex}HeightMm`
        });
      }
      if (isMoved) continue;
      cursor = shelfTopMm;
      continue;
    }
    const rawHeight = slot.authoredHeightMm > 0 ? slot.authoredHeightMm * scale : fillHeight;
    const heightMm = Math.max(minHeightForType(slot.type), rawHeight);
    const bottomMm = cursor + slot.offsetMm;
    const segment: TallStackDimensionSegment = {
      segmentIndex: realSegments.length,
      slotIndex: slot.slotIndex,
      type: slot.type,
      bottomMm,
      topMm: bottomMm + heightMm,
      heightMm,
      paramKey: `tallSlot${slot.slotIndex}HeightMm`
    };
    realSegments.push(segment);
    cursor += heightMm;
    previousNonShelfType = slot.type;
  }

  const segments: TallStackDimensionSegment[] = [];
  const sortedRealSegments = [...realSegments]
    .map((segment) => ({
      ...segment,
      bottomMm: Math.max(0, Math.min(hostHeightMm, segment.bottomMm)),
      topMm: Math.max(0, Math.min(hostHeightMm, segment.topMm))
    }))
    .filter((segment) => segment.topMm > segment.bottomMm)
    .sort((a, b) => a.bottomMm - b.bottomMm || a.topMm - b.topMm);
  let chainCursor = 0;
  const pushEmptySegment = (bottomMm: number, topMm: number) => {
    if (topMm - bottomMm < 0.5) return;
    segments.push({
      segmentIndex: segments.length,
      slotIndex: 0,
      type: "empty",
      bottomMm,
      topMm,
      heightMm: topMm - bottomMm,
      paramKey: ""
    });
  };
  for (const segment of sortedRealSegments) {
    if (segment.bottomMm > chainCursor) pushEmptySegment(chainCursor, segment.bottomMm);
    if (segment.bottomMm < chainCursor && chainCursor - segment.bottomMm <= Math.max(2, frontGapMm / 2 + 0.01)) {
      const previous = segments[segments.length - 1] ?? null;
      if (previous && segment.bottomMm > previous.bottomMm) {
        previous.topMm = segment.bottomMm;
        previous.heightMm = previous.topMm - previous.bottomMm;
        chainCursor = segment.bottomMm;
      }
    }
    if (segment.topMm <= chainCursor) continue;
    segments.push({
      ...segment,
      segmentIndex: segments.length,
      bottomMm: Math.max(segment.bottomMm, chainCursor),
      heightMm: segment.topMm - Math.max(segment.bottomMm, chainCursor)
    });
    chainCursor = Math.max(chainCursor, segment.topMm);
  }
  if (chainCursor < hostHeightMm) pushEmptySegment(chainCursor, hostHeightMm);

  const boundaries: TallStackDimensionBoundary[] = [];
  if (segments.length > 0) {
    boundaries.push({
      boundaryIndex: 0,
      yMm: segments[0]!.bottomMm,
      lowerSegmentIndex: null,
      upperSegmentIndex: 0,
      isBottom: true,
      isTop: false
    });
    for (let index = 0; index < segments.length - 1; index += 1) {
      boundaries.push({
        boundaryIndex: boundaries.length,
        yMm: segments[index]!.topMm,
        lowerSegmentIndex: segments[index]!.segmentIndex,
        upperSegmentIndex: segments[index + 1]!.segmentIndex,
        isBottom: false,
        isTop: false
      });
    }
    boundaries.push({
      boundaryIndex: boundaries.length,
      yMm: segments[segments.length - 1]!.topMm,
      lowerSegmentIndex: segments[segments.length - 1]!.segmentIndex,
      upperSegmentIndex: null,
      isBottom: false,
      isTop: true
    });
  }

  return {
    hostHeightMm,
    contentBottomMm: 0,
    contentTopMm: hostHeightMm,
    segments,
    boundaries
  };
}

export function applyTallStackDimensionSegmentEdit(
  params: ModuleParams,
  args: { boundaryIndex: number; segmentIndex: number; nextHeightMm: number; selectedSlotIndex?: number | null }
): TallStackDimensionEditResult {
  if (!isTallStackHostParams(params)) return { ok: false, reason: "not_tall_stack_host" };
  const chain = resolveTallStackDimensionChain(params);
  const boundary = chain.boundaries.find((item) => item.boundaryIndex === args.boundaryIndex) ?? null;
  if (!boundary) return { ok: false, reason: "missing_boundary" };
  const segment = chain.segments.find((item) => item.segmentIndex === args.segmentIndex) ?? null;
  if (!segment) return { ok: false, reason: "missing_segment" };

  const nextHeightMm = Math.round(args.nextHeightMm);
  if (!Number.isFinite(nextHeightMm) || nextHeightMm < minHeightForType(segment.type)) {
    return { ok: false, reason: "below_minimum" };
  }

  const nextParams = structuredClone(params);
  const nextRecord = asRecord(nextParams);
  const setSegmentHeight = (item: TallStackDimensionSegment, heightMm: number) => {
    if (!item.paramKey) return;
    nextRecord[item.paramKey] = Math.max(minHeightForType(item.type), Math.round(heightMm));
  };
  const moveSlot = (slotIndex: number, deltaMm: number) => {
    if (slotIndex <= 0 || !Number.isFinite(deltaMm)) return false;
    const key = `tallSlot${slotIndex}OffsetMm`;
    const current = readNumber(nextRecord, key, 0);
    nextRecord[key] = Math.round(current + deltaMm);
    return true;
  };

  if (boundary.isTop && boundary.lowerSegmentIndex === segment.segmentIndex) {
    const deltaMm = nextHeightMm - segment.heightMm;
    setSegmentHeight(segment, nextHeightMm);
    nextRecord.height = Math.max(200, Math.round(chain.hostHeightMm + deltaMm));
    return { ok: true, params: nextParams };
  }

  const lower = boundary.lowerSegmentIndex != null ? chain.segments[boundary.lowerSegmentIndex] ?? null : null;
  const upper = boundary.upperSegmentIndex != null ? chain.segments[boundary.upperSegmentIndex] ?? null : null;
  if (!lower || !upper) return { ok: false, reason: "not_adjacent" };
  if (segment.segmentIndex !== lower.segmentIndex && segment.segmentIndex !== upper.segmentIndex) {
    return { ok: false, reason: "not_adjacent" };
  }

  if (segment.type === "empty") {
    const deltaMm = nextHeightMm - segment.heightMm;
    const selectedSlotIndex = typeof args.selectedSlotIndex === "number" ? Math.round(args.selectedSlotIndex) : null;
    const selectedSegment = selectedSlotIndex
      ? chain.segments.find((item) => item.slotIndex === selectedSlotIndex && item.type !== "empty") ?? null
      : null;
    if (selectedSegment) {
      if (upper.segmentIndex === selectedSegment.segmentIndex) {
        moveSlot(selectedSegment.slotIndex, deltaMm);
        return { ok: true, params: nextParams };
      }
      if (lower.segmentIndex === selectedSegment.segmentIndex) {
        moveSlot(selectedSegment.slotIndex, -deltaMm);
        return { ok: true, params: nextParams };
      }
    }
    if (segment.segmentIndex === lower.segmentIndex && upper.type !== "empty") {
      moveSlot(upper.slotIndex, deltaMm);
      return { ok: true, params: nextParams };
    }
    if (segment.segmentIndex === upper.segmentIndex && lower.type !== "empty") {
      moveSlot(lower.slotIndex, -deltaMm);
      return { ok: true, params: nextParams };
    }
  }

  const totalPairHeightMm = lower.heightMm + upper.heightMm;
  const other = segment.segmentIndex === lower.segmentIndex ? upper : lower;
  const nextOtherHeightMm = totalPairHeightMm - nextHeightMm;
  if (nextOtherHeightMm < minHeightForType(other.type)) return { ok: false, reason: "below_minimum" };
  setSegmentHeight(segment, nextHeightMm);
  setSegmentHeight(other, nextOtherHeightMm);
  return { ok: true, params: nextParams };
}
