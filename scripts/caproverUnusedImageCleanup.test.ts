import { describe, expect, it } from "vitest";
import {
  createCapRoverUnusedImageDeletePayload,
  validateCapRoverUnusedImageDeleteResponse
} from "./caproverUnusedImageCleanup";

const imageId = (digit: string) => `sha256:${digit.repeat(64)}`;

describe("CapRover unused image cleanup", () => {
  it("builds a delete request only from CapRover's unused image inventory", () => {
    expect(createCapRoverUnusedImageDeletePayload({
      unusedImages: [
        { id: imageId("a"), tags: ["img-captain-old:1"] },
        { id: imageId("b"), tags: [] }
      ]
    })).toEqual({ imageIds: [imageId("a"), imageId("b")] });
  });

  it("accepts direct CLI data and wrapped API data", () => {
    expect(createCapRoverUnusedImageDeletePayload({
      unusedImages: []
    })).toEqual({ imageIds: [] });
    expect(createCapRoverUnusedImageDeletePayload({
      status: 100,
      data: { unusedImages: [{ id: imageId("d") }] }
    })).toEqual({ imageIds: [imageId("d")] });
  });

  it("refuses failed, malformed, duplicate, and non-full image IDs", () => {
    expect(() => createCapRoverUnusedImageDeletePayload({ status: 111, data: { unusedImages: [] } }))
      .toThrow("does not report success");
    expect(() => createCapRoverUnusedImageDeletePayload({}))
      .toThrow("unusedImages inventory");
    expect(() => createCapRoverUnusedImageDeletePayload({
      unusedImages: [{ id: "abc" }]
    })).toThrow("full Docker image ID");
    expect(() => createCapRoverUnusedImageDeletePayload({
      unusedImages: [{ id: imageId("c") }, { id: imageId("c") }]
    })).toThrow("duplicate image IDs");
  });

  it("accepts successful direct CLI data and refuses failed API responses", () => {
    expect(() => validateCapRoverUnusedImageDeleteResponse({})).not.toThrow();
    expect(() => validateCapRoverUnusedImageDeleteResponse({ status: 100, data: {} })).not.toThrow();
    expect(() => validateCapRoverUnusedImageDeleteResponse({ status: 110, description: "failed" }))
      .toThrow("does not report success");
    expect(() => validateCapRoverUnusedImageDeleteResponse(null)).toThrow("not an object");
  });
});
