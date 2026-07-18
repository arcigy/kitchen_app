import { describe, expect, it } from "vitest";
import {
  createDefaultProjectMarginSettingsState,
  normalizeProjectMarginSettingsState,
  projectMarginTargetId,
  resolveEffectiveProjectMarginPercent
} from "./project-margin-types";

describe("project margin settings model", () => {
  it("creates backward-compatible project defaults", () => {
    expect(createDefaultProjectMarginSettingsState()).toEqual({
      schemaVersion: 1,
      initialized: false,
      revision: 0,
      calculationMode: "markup_on_cost",
      defaultMarginPercent: 20,
      additionalLaborCost: 0,
      groupMargins: {},
      itemOverrides: []
    });
  });

  it("normalizes legacy quote settings without making old saves unreadable", () => {
    expect(normalizeProjectMarginSettingsState({ marginPercent: 17.5, additionalLaborCost: 125 })).toMatchObject({
      initialized: true,
      revision: 0,
      defaultMarginPercent: 17.5,
      additionalLaborCost: 125
    });
    expect(normalizeProjectMarginSettingsState(null)).toEqual(createDefaultProjectMarginSettingsState());
  });

  it("resolves item override before group and default margins", () => {
    const target = { scopeId: "module:base-1", itemId: "left-side", category: "corpus" as const };
    const state = {
      ...createDefaultProjectMarginSettingsState(),
      initialized: true,
      defaultMarginPercent: 20,
      groupMargins: { corpus: 15 },
      itemOverrides: [{ ...target, targetId: projectMarginTargetId(target), marginPercent: 8 }]
    };
    expect(resolveEffectiveProjectMarginPercent(state, target)).toBe(8);
    expect(resolveEffectiveProjectMarginPercent(
      { ...state, itemOverrides: [] },
      target
    )).toBe(15);
    expect(resolveEffectiveProjectMarginPercent(
      { ...state, itemOverrides: [], groupMargins: {} },
      target
    )).toBe(20);
  });
});
