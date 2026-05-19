import { describe, expect, it } from "vitest";
import { detectCapSegments, splitWallCandidatesIntoFacesAndCaps } from "./wallCapSegmentDetection";
import type { VectorSegment } from "./vectorStrokeGrouping";

describe("wall cap segment detection", () => {
  it("detects a clean cap connecting two parallel wall faces", () => {
    const cap = segment("cap", 0, 0, 10, 0);
    const leftFace = segment("left_face", 0, 0, 0, 40);
    const rightFace = segment("right_face", 10, 0, 10, 42);

    const result = detectCapSegments([cap, leftFace, rightFace]);

    expect(result.capSegmentIds.has("cap")).toBe(true);
    expect(result.wallFaceSegmentIds.has("left_face")).toBe(true);
    expect(result.wallFaceSegmentIds.has("right_face")).toBe(true);
    expect(result.wallFaceSegmentIds.has("cap")).toBe(false);
    expect(result.reasons.get("cap")).toContain("left_face");
  });

  it("keeps a genuine short wall face when it does not connect two parallel faces", () => {
    const shortFace = segment("short_face", 0, 0, 14, 0);
    const oneTouchingFace = segment("one_touching_face", 0, 0, 0, 40);
    const unrelated = segment("unrelated", 80, 0, 80, 40);

    const result = detectCapSegments([shortFace, oneTouchingFace, unrelated]);

    expect(result.capSegmentIds.has("short_face")).toBe(false);
    expect(result.wallFaceSegmentIds.has("short_face")).toBe(true);
  });

  it("detects endpoint-to-interior contact from split PDF geometry", () => {
    const cap = segment("cap", 0, 20, 10, 20);
    const leftFace = segment("left_face", 0, 0, 0, 50);
    const rightFaceTop = segment("right_face_top", 10, 20, 10, 50);
    const rightFaceBottom = segment("right_face_bottom", 10, 0, 10, 20);

    const result = detectCapSegments([cap, leftFace, rightFaceTop, rightFaceBottom]);

    expect(result.capSegmentIds.has("cap")).toBe(true);
    expect(result.wallFaceSegmentIds.has("left_face")).toBe(true);
  });

  it("splits candidate segments into faces and caps", () => {
    const cap = segment("cap", 0, 0, 10, 0);
    const leftFace = segment("left_face", 0, 0, 0, 40);
    const rightFace = segment("right_face", 10, 0, 10, 42);

    const result = splitWallCandidatesIntoFacesAndCaps([cap, leftFace, rightFace]);

    expect(result.capSegments.map((item) => item.id)).toEqual(["cap"]);
    expect(result.faceSegments.map((item) => item.id)).toEqual(["left_face", "right_face"]);
  });
});

function segment(id: string, x1: number, y1: number, x2: number, y2: number): VectorSegment {
  return {
    id,
    x1,
    y1,
    x2,
    y2,
    strokeWidth: 1.7,
    sourceStrokeWidth: 1.7,
    pathKind: "line"
  };
}
