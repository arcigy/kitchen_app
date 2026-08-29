import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { pickBestAlignLine, pickBestCompatibleAlignLine } from "./alignTool";
import type { AlignPickedLine } from "./localTypes";

const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;

function camera() {
  const cam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  cam.up.set(0, 0, -1);
  cam.position.set(0, 10, 0);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function line(label: string, a: THREE.Vector3, b: THREE.Vector3): AlignPickedLine {
  return {
    p: a.clone(),
    dir: b.clone().sub(a).normalize(),
    segA: a,
    segB: b,
    label,
    targetKind: "wall",
    lineRole: "center"
  };
}

describe("align tool picking", () => {
  it("uses the shared align pick profile by default", () => {
    const picked = pickBestAlignLine(
      { x: 50, y: 51 },
      rect,
      camera(),
      [line("wall center", new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0))]
    );

    expect(picked?.label).toBe("wall center");
  });

  it("rejects lines outside an explicit narrow pick distance", () => {
    const picked = pickBestAlignLine(
      { x: 50, y: 51 },
      rect,
      camera(),
      [line("wall center", new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0))],
      0.5
    );

    expect(picked).toBeNull();
  });

  it("uses only compatible parallel candidates for the second align pick", () => {
    const cam = camera();
    const ref = line("anchor", new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0));
    const stealingPerpendicular = line("near perpendicular", new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1));
    const validParallel = line("parallel target", new THREE.Vector3(-1, 0, 0.2), new THREE.Vector3(1, 0, 0.2));

    const picked = pickBestCompatibleAlignLine(
      { x: 50, y: 50 },
      rect,
      cam,
      [ref, stealingPerpendicular, validParallel],
      ref,
      12
    );

    expect(picked?.label).toBe("parallel target");
  });
});
