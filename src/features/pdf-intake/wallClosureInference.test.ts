import { describe, expect, it } from "vitest";
import { inferWallClosureSegments } from "./wallClosureInference";
import type { VectorSegment } from "./vectorStrokeGrouping";
import type { WallEndHighlight } from "./wallEndDetection";

describe("wall closure inference", () => {
  it("adds a closure line between two compatible dangling wall ends", () => {
    const result = inferWallClosureSegments({
      openEnds: [
        end("wall_end_1", 100, 50, 180),
        end("wall_end_2", 100, 62, 180)
      ]
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "inferred_wall_closure_1",
      x1: 100,
      y1: 50,
      x2: 100,
      y2: 62,
      sourceOpenEndIds: ["wall_end_1", "wall_end_2"]
    });
  });

  it("does not add a closure when the open ends are too far apart", () => {
    const result = inferWallClosureSegments({
      openEnds: [
        end("wall_end_1", 100, 50, 180),
        end("wall_end_2", 100, 140, 180)
      ],
      maxClosureLength: 60
    });

    expect(result).toHaveLength(0);
  });

  it("does not add a closure when an existing segment already connects the ends", () => {
    const result = inferWallClosureSegments({
      openEnds: [
        end("wall_end_1", 100, 50, 180),
        end("wall_end_2", 100, 62, 180)
      ],
      existingSegments: [segment("existing", 100, 50, 100, 62)]
    });

    expect(result).toHaveLength(0);
  });
});

function end(id: string, x: number, y: number, directionDeg: number): WallEndHighlight {
  return {
    id,
    segmentId: `${id}_segment`,
    endpoint: "start",
    x,
    y,
    directionDeg,
    confidence: 0.62,
    reasons: []
  };
}

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
