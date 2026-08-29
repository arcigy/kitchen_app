import { describe, expect, it } from "vitest";
import { getSystemSeedCatalog } from "../core/catalog/catalog-repository";
import type { AppState } from "./appState";
import { makeDefaultKitchenContext, type KitchenContext } from "./kitchenContext";
import { getActivePlacementKitchenContext } from "./placementManager";

describe("getActivePlacementKitchenContext", () => {
  it("uses the active kitchen group context for module placement", () => {
    const catalog = getSystemSeedCatalog();
    const fallback = makeDefaultKitchenContext(catalog);
    const active = {
      ...fallback,
      frontsMaterialId: "active-front-material",
      corpusMaterialId: "active-corpus-material"
    } satisfies KitchenContext;

    const state = {
      kitchenEditMode: true,
      activeKitchenGroupId: "kg-active",
      kitchenCtx: fallback,
      kitchenGroups: [
        { id: "kg-active", name: "Active kitchen", ctx: active, instanceIds: [] }
      ]
    } as unknown as AppState;

    expect(getActivePlacementKitchenContext(state)).toBe(active);
  });

  it("falls back to the global kitchen context outside a kitchen group", () => {
    const catalog = getSystemSeedCatalog();
    const fallback = makeDefaultKitchenContext(catalog);
    const state = {
      kitchenEditMode: false,
      activeKitchenGroupId: null,
      kitchenCtx: fallback,
      kitchenGroups: []
    } as unknown as AppState;

    expect(getActivePlacementKitchenContext(state)).toBe(fallback);
  });
});
