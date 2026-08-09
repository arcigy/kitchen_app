import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAutomaticLedStripGroups } from "./ledStripPlacement";

const source = (id: string, tag: string, count = 1) => {
  const root = new THREE.Group();
  for (let index = 0; index < count; index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 0.3));
    mesh.position.set(index * 1.1, 1, 0);
    mesh.userData.tags = [tag];
    root.add(mesh);
  }
  return { id, root };
};

describe("automatic LED placement anchors", () => {
  it("creates one shelf LED run per semantic shelf", () => {
    const result = createAutomaticLedStripGroups({ mode: "shelfJoint", sources: [source("module", "shelf", 7)], nextId: () => "led1" });
    expect(result.unsupportedSourceIds).toEqual([]);
    expect(result.groups[0]!.runs).toHaveLength(7);
  });

  it("rejects the whole operation when an input lacks the required semantic anchor", () => {
    const result = createAutomaticLedStripGroups({ mode: "shelfJoint", sources: [source("good", "shelf"), source("bad", "plinth")], nextId: () => "led1" });
    expect(result.groups).toEqual([]);
    expect(result.unsupportedSourceIds).toEqual(["bad"]);
  });
});
