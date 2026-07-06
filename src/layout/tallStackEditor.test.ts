import { describe, expect, it } from "vitest";
import {
  appendTallStackSlot,
  copyTallStackSlot,
  insertTallStackSlotAt,
  moveTallStackSlot,
  removeTallStackSlot,
  resolveTallStackSlotBaseBottomMm,
  resolveTallStackUsableBoundsMm
} from "./tallStackEditor";
import type { ModuleParams } from "../model/cabinetTypes";

function tallParams(overrides: Record<string, unknown> = {}) {
  return {
    type: "fwm_catalog_tall_cabinet",
    tallStackMode: "builder",
    tallSlotCount: 0,
    drawerCount: 0,
    shelfCount: 0,
    doorCount: 0,
    applianceKind: "none",
    ...overrides
  } as ModuleParams;
}

describe("tall stack editor", () => {
  it("appends inserted submodules into the generic custom tall host", () => {
    const params = tallParams();

    expect(appendTallStackSlot(params, "drawer")).toMatchObject({ ok: true, slotIndex: 1 });
    expect(appendTallStackSlot(params, "shelf")).toMatchObject({ ok: true, slotIndex: 2 });
    expect(appendTallStackSlot(params, "oven")).toMatchObject({ ok: true, slotIndex: 3 });
    expect(appendTallStackSlot(params, "microwave")).toMatchObject({ ok: true, slotIndex: 4 });
    expect(appendTallStackSlot(params, "door")).toMatchObject({ ok: true, slotIndex: 5 });

    const record = params as Record<string, unknown>;
    expect(record.tallSlotCount).toBe(5);
    expect(record.tallSlot1Type).toBe("drawer");
    expect(record.tallSlot2Type).toBe("shelf");
    expect(record.tallSlot3Type).toBe("oven");
    expect(record.tallSlot4Type).toBe("microwave");
    expect(record.tallSlot5Type).toBe("door");
    expect(record.drawerCount).toBe(1);
    expect(record.shelfCount).toBe(1);
    expect(record.doorCount).toBe(1);
    expect(record.applianceKind).toBe("oven_microwave");
  });

  it("reuses the first empty slot before extending the stack", () => {
    const params = tallParams({
      tallSlotCount: 3,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "empty",
      tallSlot2HeightMm: 0,
      tallSlot3Type: "door",
      tallSlot3HeightMm: 0
    });

    expect(appendTallStackSlot(params, "sink")).toMatchObject({ ok: true, slotIndex: 2 });
    const record = params as Record<string, unknown>;
    expect(record.tallSlotCount).toBe(3);
    expect(record.tallSlot2Type).toBe("sink");
    expect(record.tallSlot2HeightMm).toBe(220);
    expect(record.applianceKind).toBe("sink");
  });

  it("inserts a door with an explicit bottom line and top line height", () => {
    const params = tallParams({
      height: 2080,
      plinthHeight: 100,
      boardThickness: 18,
      tallSlotCount: 1,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot1OffsetMm: 0
    });

    expect(insertTallStackSlotAt(params, "door", 520, 780)).toMatchObject({ ok: true, slotIndex: 2 });
    const record = params as Record<string, unknown>;
    expect(record.tallSlot2Type).toBe("door");
    expect(record.tallSlot2HeightMm).toBe(780);
    expect(resolveTallStackSlotBaseBottomMm(params, 2)).toBeCloseTo(308, 3);
    expect(record.tallSlot2OffsetMm).toBe(212);
    expect(record.doorCount).toBe(1);
  });

  it("does not resize an existing fill slot when another submodule is inserted", () => {
    const params = tallParams({
      height: 2080,
      plinthHeight: 100,
      boardThickness: 18,
      tallSlotCount: 1,
      tallSlot1Type: "door",
      tallSlot1HeightMm: 0,
      tallSlot1OffsetMm: 0,
      doorCount: 1
    });

    const beforeBottom = resolveTallStackSlotBaseBottomMm(params, 1);
    expect(appendTallStackSlot(params, "oven")).toMatchObject({ ok: true, slotIndex: 2 });

    const record = params as Record<string, unknown>;
    expect(record.tallSlot1Type).toBe("door");
    expect(record.tallSlot1HeightMm).toBe(1944);
    expect(record.tallSlot1OffsetMm).toBe(0);
    expect(resolveTallStackSlotBaseBottomMm(params, 1)).toBeCloseTo(beforeBottom as number, 3);
    expect(record.tallSlot2Type).toBe("oven");
    expect(record.tallSlot2HeightMm).toBe(600);
  });

  it("removes a selected submodule slot without deleting the tall host", () => {
    const params = tallParams({
      tallSlotCount: 4,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "oven",
      tallSlot2HeightMm: 600,
      tallSlot3Type: "microwave",
      tallSlot3HeightMm: 390,
      tallSlot4Type: "door",
      tallSlot4HeightMm: 0,
      drawerCount: 1,
      doorCount: 1,
      applianceKind: "oven_microwave"
    });

    expect(removeTallStackSlot(params, 3)).toMatchObject({ ok: true, slotIndex: 3 });
    const record = params as Record<string, unknown>;
    expect(record.type).toBe("fwm_catalog_tall_cabinet");
    expect(record.tallSlotCount).toBe(4);
    expect(record.tallSlot3Type).toBe("empty");
    expect(record.tallSlot3HeightMm).toBe(0);
    expect(record.drawerCount).toBe(1);
    expect(record.doorCount).toBe(1);
    expect(record.applianceKind).toBe("oven");
  });

  it("can remove the last remaining submodule slot without hanging", () => {
    const params = tallParams({
      tallSlotCount: 1,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      drawerCount: 1,
      doorCount: 0,
      applianceKind: "none"
    });

    expect(removeTallStackSlot(params, 1)).toMatchObject({ ok: true, slotIndex: 1 });
    const record = params as Record<string, unknown>;
    expect(record.tallSlotCount).toBe(0);
    expect(record.tallSlot1Type).toBe("empty");
    expect(record.drawerCount).toBe(0);
    expect(record.type).toBe("fwm_catalog_tall_cabinet");
  });

  it("keeps a shelf at its real position when the neighboring drawer is removed", () => {
    const params = tallParams({
      height: 2080,
      plinthHeight: 100,
      boardThickness: 18,
      frontGap: 2,
      tallSlotCount: 3,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "shelf",
      tallSlot2HeightMm: 18,
      tallSlot2OffsetMm: 0,
      tallSlot3Type: "oven",
      tallSlot3HeightMm: 600
    });

    const shelfBottomBefore = resolveTallStackSlotBaseBottomMm(params, 2);
    expect(shelfBottomBefore).toBeCloseTo(289, 3);
    expect(removeTallStackSlot(params, 1)).toMatchObject({ ok: true, slotIndex: 1 });

    const record = params as Record<string, unknown>;
    expect(record.tallSlot2Type).toBe("shelf");
    expect(resolveTallStackSlotBaseBottomMm(params, 2)).toBeCloseTo(shelfBottomBefore as number, 3);
    expect(record.tallSlot2OffsetMm).toBeGreaterThan(0);
  });

  it("moves a submodule by its own vertical offset without changing neighbors", () => {
    const params = tallParams({
      tallSlotCount: 2,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "door",
      tallSlot2HeightMm: 600,
      drawerCount: 1,
      doorCount: 1
    });

    expect(moveTallStackSlot(params, 1, 120)).toMatchObject({ ok: true, movedMm: 120, slotIndex: 1 });
    const record = params as Record<string, unknown>;
    expect(record.tallSlotCount).toBe(2);
    expect(record.tallSlot1Type).toBe("drawer");
    expect(record.tallSlot1HeightMm).toBe(190);
    expect(record.tallSlot1OffsetMm).toBe(120);
    expect(record.tallSlot2Type).toBe("door");
    expect(record.tallSlot2HeightMm).toBe(600);
    expect(record.tallSlot2OffsetMm).toBeUndefined();
  });

  it("moves an inserted shelf independently from other slots", () => {
    const params = tallParams({
      tallSlotCount: 3,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "shelf",
      tallSlot2HeightMm: 18,
      tallSlot3Type: "oven",
      tallSlot3HeightMm: 600
    });

    expect(moveTallStackSlot(params, 2, -45)).toMatchObject({ ok: true, movedMm: -45, slotIndex: 2 });
    const record = params as Record<string, unknown>;
    expect(record.tallSlot1HeightMm).toBe(190);
    expect(record.tallSlot2Type).toBe("shelf");
    expect(record.tallSlot2HeightMm).toBe(18);
    expect(record.tallSlot2OffsetMm).toBe(-45);
    expect(record.tallSlot3HeightMm).toBe(600);
  });

  it("copies a selected submodule into a new independent slot", () => {
    const params = tallParams({
      tallSlotCount: 2,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot1OffsetMm: 20,
      tallSlot2Type: "oven",
      tallSlot2HeightMm: 600
    });

    expect(copyTallStackSlot(params, 1, 120)).toMatchObject({ ok: true, copiedMm: 120, sourceSlotIndex: 1, slotIndex: 3 });
    const record = params as Record<string, unknown>;
    expect(record.tallSlot1Type).toBe("drawer");
    expect(record.tallSlot1HeightMm).toBe(190);
    expect(record.tallSlot1OffsetMm).toBe(20);
    expect(record.tallSlot3Type).toBe("drawer");
    expect(record.tallSlot3HeightMm).toBe(190);
    expect(record.tallSlot3OffsetMm).toBe(140);
  });

  it("resolves the real board bottom for shelves that are hidden from the dimension chain", () => {
    const params = tallParams({
      height: 2080,
      plinthHeight: 100,
      boardThickness: 18,
      frontGap: 2,
      tallSlotCount: 3,
      tallSlot1Type: "drawer",
      tallSlot1HeightMm: 190,
      tallSlot2Type: "shelf",
      tallSlot2HeightMm: 18,
      tallSlot3Type: "oven",
      tallSlot3HeightMm: 600
    });

    expect(resolveTallStackSlotBaseBottomMm(params, 2)).toBeCloseTo(289, 3);
  });

  it("keeps tall insert placement inside the bottom and top boards", () => {
    const params = tallParams({
      height: 2080,
      plinthHeight: 100,
      boardThickness: 18
    });

    expect(resolveTallStackUsableBoundsMm(params)).toEqual({
      bottomMm: 118,
      topMm: 2062,
      heightMm: 1944
    });
  });
});
