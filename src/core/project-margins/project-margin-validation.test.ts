import { describe, expect, it } from "vitest";
import {
  createDefaultProjectMarginSettingsState,
  projectMarginTargetId,
  type ProjectMarginSettingsState
} from "./project-margin-types";
import {
  assertNextProjectMarginRevision,
  PROJECT_MARGIN_ID_MAX_LENGTH,
  PROJECT_MARGIN_MAX_ITEM_OVERRIDES,
  validateProjectMarginSettingsState
} from "./project-margin-validation";

function validState(): ProjectMarginSettingsState {
  const target = { scopeId: "module:base-1", itemId: "left-side", category: "corpus" as const };
  return {
    ...createDefaultProjectMarginSettingsState(),
    initialized: true,
    revision: 3,
    groupMargins: { corpus: 15, labor: 10 },
    itemOverrides: [{ ...target, targetId: projectMarginTargetId(target), marginPercent: 7.5 }],
    updatedAt: "2026-07-18T18:00:00.000Z"
  };
}

describe("project margin settings validation", () => {
  it("accepts the canonical typed state", () => {
    expect(() => validateProjectMarginSettingsState(validState())).not.toThrow();
  });

  it.each([
    ["negative margin", (state: ProjectMarginSettingsState) => { state.defaultMarginPercent = -1; }],
    ["unbounded margin", (state: ProjectMarginSettingsState) => { state.groupMargins.corpus = 1_001; }],
    ["unknown category", (state: ProjectMarginSettingsState) => {
      (state.groupMargins as Record<string, number>).unknown = 10;
    }],
    ["mismatched target id", (state: ProjectMarginSettingsState) => { state.itemOverrides[0]!.targetId = "wrong"; }],
    ["invalid revision", (state: ProjectMarginSettingsState) => { state.revision = -1; }]
  ])("rejects %s", (_label, mutate) => {
    const state = validState();
    mutate(state);
    expect(() => validateProjectMarginSettingsState(state)).toThrow();
  });

  it("rejects duplicate target identities", () => {
    const state = validState();
    state.itemOverrides.push(structuredClone(state.itemOverrides[0]!));
    expect(() => validateProjectMarginSettingsState(state)).toThrow(/duplicate targetId/);
  });

  it("bounds persisted override cardinality and identifier size", () => {
    const tooMany = validState();
    tooMany.itemOverrides = Array.from({ length: PROJECT_MARGIN_MAX_ITEM_OVERRIDES + 1 }, () =>
      structuredClone(tooMany.itemOverrides[0]!)
    );
    expect(() => validateProjectMarginSettingsState(tooMany)).toThrow(/cannot contain more/);

    const longId = validState();
    longId.itemOverrides[0]!.scopeId = "x".repeat(PROJECT_MARGIN_ID_MAX_LENGTH + 1);
    expect(() => validateProjectMarginSettingsState(longId)).toThrow(/cannot exceed/);
  });

  it("rejects non-finite numbers and unsafe timestamps", () => {
    const nonFinite = validState();
    nonFinite.itemOverrides[0]!.marginPercent = Number.NaN;
    expect(() => validateProjectMarginSettingsState(nonFinite)).toThrow(/finite number/);

    const invalidLabor = validState();
    invalidLabor.additionalLaborCost = Number.POSITIVE_INFINITY;
    expect(() => validateProjectMarginSettingsState(invalidLabor)).toThrow(/additionalLaborCost/);

    const invalidTimestamp = validState();
    invalidTimestamp.updatedAt = "not-a-timestamp";
    expect(() => validateProjectMarginSettingsState(invalidTimestamp)).toThrow(/valid timestamp/);
  });

  it("rejects unknown fields so a forged save cannot hide an unbounded payload", () => {
    const extraTopLevel = validState() as ProjectMarginSettingsState & { privatePayload?: string };
    extraTopLevel.privatePayload = "x".repeat(1024);
    expect(() => validateProjectMarginSettingsState(extraTopLevel)).toThrow(/unsupported field privatePayload/);

    const extraOverride = validState();
    (extraOverride.itemOverrides[0] as ProjectMarginSettingsState["itemOverrides"][number] & { clientId?: string }).clientId = "other-client";
    expect(() => validateProjectMarginSettingsState(extraOverride)).toThrow(/unsupported field clientId/);
  });

  it("requires the next revision to increment exactly once", () => {
    const state = validState();
    expect(() => assertNextProjectMarginRevision(2, state)).not.toThrow();
    expect(() => assertNextProjectMarginRevision(1, state)).toThrow(/increment/);
  });
});
