import { describe, expect, it } from "vitest";
import { normalizeFeedbackText } from "./feedbackText";

describe("feedback report text", () => {
  it("accepts a standalone title or description and derives the missing title", () => {
    expect(normalizeFeedbackText("  Title  ", " ")).toEqual({ title: "Title", description: "", comment: "" });
    expect(normalizeFeedbackText("Title", undefined)).toEqual({ title: "Title", description: "", comment: "" });
    expect(normalizeFeedbackText(undefined, "Description")).toEqual({ title: "Description", description: "Description", comment: "" });
    expect(normalizeFeedbackText("", "Description")).toEqual({ title: "Description", description: "Description", comment: "" });
  });

  it("requires meaningful letters or digits and enforces matching field limits", () => {
    expect(normalizeFeedbackText("...", "   ")).toBeNull();
    expect(normalizeFeedbackText("", "Description", " ")).toEqual({ title: "Description", description: "Description", comment: "" });
    expect(normalizeFeedbackText("x".repeat(181), "")).toBeNull();
    expect(normalizeFeedbackText("", "x".repeat(8_001))).toBeNull();
    expect(normalizeFeedbackText("Title", "", "x".repeat(4_001))).toBeNull();
  });
});
