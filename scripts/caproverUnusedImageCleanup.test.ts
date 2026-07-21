import { describe, expect, it } from "vitest";
import {
  createCapRoverUnusedImageDeletePayload,
  validateCapRoverUnusedImageDeleteResponse
} from "./caproverUnusedImageCleanup";

const imageId = (digit: string) => `sha256:${digit.repeat(64)}`;

describe("CapRover unused image cleanup", () => {
  it("builds a delete request only from CapRover's unused image inventory", () => {
    expect(createCapRoverUnusedImageDeletePayload({
      status: 100,
      data: {
        unusedImages: [
          { id: imageId("a"), tags: ["img-captain-old:1"] },
          { id: imageId("b"), tags: [] }
        ]
      }
    })).toEqual({ imageIds: [imageId("a"), imageId("b")] });
  });

  it("accepts an empty inventory without issuing any deletion", () => {
    expect(createCapRoverUnusedImageDeletePayload({
      status: 100,
      data: { unusedImages: [] }
    })).toEqual({ imageIds: [] });
  });

  it("refuses failed, malformed, duplicate, and non-full image IDs", () => {
    expect(() => createCapRoverUnusedImageDeletePayload({ status: 111, data: { unusedImages: [] } }))
      .toThrow("does not report success");
    expect(() => createCapRoverUnusedImageDeletePayload({ status: 100, data: {} }))
      .toThrow("unusedImages inventory");
    expect(() => createCapRoverUnusedImageDeletePayload({
      status: 100,
      data: { unusedImages: [{ id: "abc" }] }
    })).toThrow("full Docker image ID");
    expect(() => createCapRoverUnusedImageDeletePayload({
      status: 100,
      data: { unusedImages: [{ id: imageId("c") }, { id: imageId("c") }] }
    })).toThrow("duplicate image IDs");
  });

  it("requires a successful response after deletion", () => {
    expect(() => validateCapRoverUnusedImageDeleteResponse({ status: 100, data: {} })).not.toThrow();
    expect(() => validateCapRoverUnusedImageDeleteResponse({ status: 110, description: "failed" }))
      .toThrow("does not report success");
  });
});
