import { describe, expect, it } from "vitest";
import { resolveKitchenEditTopbarAction } from "./kitchenModuleEditorFlow";

describe("kitchen module editor topbar flow", () => {
  it("keeps the user in the kitchen group when confirming inside a module editor", () => {
    expect(resolveKitchenEditTopbarAction({
      moduleEditorActive: true,
      intent: "accept"
    })).toEqual({ type: "exit-module-editor", discard: false });
  });

  it("keeps the user in the kitchen group when cancelling inside a module editor", () => {
    expect(resolveKitchenEditTopbarAction({
      moduleEditorActive: true,
      intent: "discard"
    })).toEqual({ type: "exit-module-editor", discard: true });
  });

  it("still exits the whole kitchen group when no module editor is active", () => {
    expect(resolveKitchenEditTopbarAction({
      moduleEditorActive: false,
      intent: "accept"
    })).toEqual({ type: "exit-kitchen-group", discard: false });
    expect(resolveKitchenEditTopbarAction({
      moduleEditorActive: false,
      intent: "discard"
    })).toEqual({ type: "exit-kitchen-group", discard: true });
  });
});
