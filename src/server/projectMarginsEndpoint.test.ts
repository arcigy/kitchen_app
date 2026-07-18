import { describe, expect, it } from "vitest";
import type { KitchenGroup, LayoutInstance } from "../layout/appState";
import type { KitchenContext } from "../layout/kitchenContext";
import {
  parseProjectMarginSettingsOperation,
  resolveProjectMarginKitchenContext
} from "./projectMarginsEndpoint";

describe("project margins endpoint contract", () => {
  it("parses the bounded operation shapes without accepting client pricing totals", () => {
    expect(parseProjectMarginSettingsOperation({
      type: "set_item",
      target: { scopeId: "module:a", itemId: "side", category: "corpus" },
      marginPercent: 15
    })).toEqual({
      type: "set_item",
      target: { scopeId: "module:a", itemId: "side", category: "corpus" },
      marginPercent: 15
    });
    expect(() => parseProjectMarginSettingsOperation({ type: "replace_totals", finalPrice: 1 })).toThrow("Unsupported");
  });

  it("rejects malformed and unsupported categories", () => {
    expect(() => parseProjectMarginSettingsOperation({
      type: "set_group",
      category: "secret_group",
      marginPercent: 15
    })).toThrow("unsupported");
    expect(() => parseProjectMarginSettingsOperation({
      type: "set_item",
      target: { scopeId: "", itemId: "side", category: "corpus" },
      marginPercent: 15
    })).toThrow("requires scopeId");
  });

  it("uses the module kitchen-group context before the project fallback", () => {
    const fallback = { marker: "fallback" } as unknown as KitchenContext;
    const groupContext = { marker: "group" } as unknown as KitchenContext;
    const groups = [{ id: "group-a", ctx: groupContext }] as KitchenGroup[];
    expect(resolveProjectMarginKitchenContext(
      { kitchenGroupId: "group-a" } as Pick<LayoutInstance, "kitchenGroupId">,
      fallback,
      groups
    )).toBe(groupContext);
    expect(resolveProjectMarginKitchenContext(
      { kitchenGroupId: "missing" } as Pick<LayoutInstance, "kitchenGroupId">,
      fallback,
      groups
    )).toBe(fallback);
  });
});
