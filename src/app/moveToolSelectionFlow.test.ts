import { describe, expect, it, vi } from "vitest";
import { continueMoveAfterObjectSelection } from "./moveToolSelectionFlow";

describe("move tool selection flow", () => {
  it("turns a Move object selection into the base-point step without using the selection click as the base", () => {
    const transformState: { kind: "move"; step: "selectElements" | "pickBase" } = {
      kind: "move" as const,
      step: "selectElements" as const
    };
    const startTransformFromSelection = vi.fn(() => {
      transformState.step = "pickBase";
      return true;
    });

    expect(continueMoveAfterObjectSelection({ startTransformFromSelection, transformState })).toBe(true);

    expect(startTransformFromSelection).toHaveBeenCalledExactlyOnceWith("move", { sticky: true });
    expect(transformState.step).toBe("pickBase");
  });

  it("still consumes the selection click when Move cannot start after selecting a locked object", () => {
    const startTransformFromSelection = vi.fn(() => false);

    expect(
      continueMoveAfterObjectSelection({
        startTransformFromSelection,
        transformState: { kind: "move", step: "selectElements" }
      })
    ).toBe(true);

    expect(startTransformFromSelection).toHaveBeenCalledExactlyOnceWith("move", { sticky: true });
  });

  it("ignores clicks outside Move select-elements state", () => {
    const startTransformFromSelection = vi.fn(() => true);

    expect(
      continueMoveAfterObjectSelection({
        startTransformFromSelection,
        transformState: { kind: "move", step: "pickBase" }
      })
    ).toBe(false);

    expect(startTransformFromSelection).not.toHaveBeenCalled();
  });
});
