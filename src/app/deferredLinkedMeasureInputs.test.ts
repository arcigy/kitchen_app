import { describe, expect, it, vi } from "vitest";
import { createDeferredLinkedMeasureInputs } from "./deferredLinkedMeasureInputs";

describe("createDeferredLinkedMeasureInputs", () => {
  it("allows properties to mount before the measure editor is initialized", () => {
    const deferred = createDeferredLinkedMeasureInputs();
    const section = {} as HTMLElement;

    expect(() => deferred.append(section, null)).not.toThrow();

    const implementation = vi.fn();
    deferred.connect(implementation);
    deferred.append(section, null);

    expect(implementation).toHaveBeenCalledExactlyOnceWith(section, null);
  });
});
