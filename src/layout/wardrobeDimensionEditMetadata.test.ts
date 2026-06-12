import { describe, expect, it } from "vitest";
import { parseWardrobeDimensionEdit } from "./wardrobeDimensionEditMetadata";

describe("parseWardrobeDimensionEdit", () => {
  it("accepts the current wardrobe dimension edit metadata shapes", () => {
    expect(parseWardrobeDimensionEdit({ kind: "verticalGap", aPartId: "left", bPartId: "right" })).toEqual({
      kind: "verticalGap",
      aPartId: "left",
      bPartId: "right"
    });
    expect(parseWardrobeDimensionEdit({ kind: "horizontalGap", aPartId: "bottom", bPartId: "top" })).toEqual({
      kind: "horizontalGap",
      aPartId: "bottom",
      bPartId: "top"
    });
    expect(parseWardrobeDimensionEdit({ kind: "partDepth", partId: "shelf-1" })).toEqual({
      kind: "partDepth",
      partId: "shelf-1"
    });
  });

  it("preserves the current loose key-presence behavior", () => {
    expect(parseWardrobeDimensionEdit({ kind: "verticalGap", aPartId: 1, bPartId: null })).toEqual({
      kind: "verticalGap",
      aPartId: 1,
      bPartId: null
    });
  });

  it("ignores unsupported wardrobe dimension edit metadata", () => {
    expect(parseWardrobeDimensionEdit(null)).toBeNull();
    expect(parseWardrobeDimensionEdit({ kind: "verticalGap", aPartId: "left" })).toBeNull();
    expect(parseWardrobeDimensionEdit({ kind: "horizontalGap", bPartId: "top" })).toBeNull();
    expect(parseWardrobeDimensionEdit({ kind: "partDepth" })).toBeNull();
    expect(parseWardrobeDimensionEdit({ kind: "unknown", partId: "x" })).toBeNull();
  });
});
