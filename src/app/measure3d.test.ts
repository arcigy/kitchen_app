import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMeasureAxisAssist3D, createBoxMeasure3DSnapCandidates, pickBestMeasure3DSnapCandidate, snapPoint3D } from "./measure3d";

const rect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;

function camera() {
  const cam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  cam.position.set(4, 4, 8);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

describe("measure 3d snapping", () => {
  it("builds explicit box snap candidates for corners and edges", () => {
    const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    target.updateMatrixWorld(true);

    const candidates = createBoxMeasure3DSnapCandidates(new THREE.Vector3(0, 1, 1), target);

    expect(candidates.filter((candidate) => candidate.kind === "corner")).toHaveLength(8);
    expect(candidates.filter((candidate) => candidate.kind === "edge")).toHaveLength(12);
  });

  it("snaps near a real box corner before edges", () => {
    const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    target.updateMatrixWorld(true);

    const result = snapPoint3D(new THREE.Vector3(1.08, 1.04, 1), target, camera(), rect);

    expect(result.kind).toBe("corner");
    expect(result.point).toEqual(new THREE.Vector3(1, 1, 1));
  });

  it("snaps to a box edge when the corner is outside the active profile distance", () => {
    const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    target.updateMatrixWorld(true);

    const result = snapPoint3D(new THREE.Vector3(0, 1, 1), target, camera(), rect, 4);

    expect(result.kind).toBe("edge");
    expect(result.point).toEqual(new THREE.Vector3(0, 1, 1));
  });

  it("keeps corner priority ahead of a closer edge candidate inside the same threshold", () => {
    const cam = camera();
    const result = pickBestMeasure3DSnapCandidate(
      new THREE.Vector3(0, 0, 0),
      [
        { kind: "edge", point: new THREE.Vector3(0.01, 0, 0) },
        { kind: "corner", point: new THREE.Vector3(0.02, 0, 0) }
      ],
      cam,
      rect,
      10
    );

    expect(result?.kind).toBe("corner");
    expect(result?.point).toEqual(new THREE.Vector3(0.02, 0, 0));
  });

  it("uses the shared 3d axis assist distance by default", () => {
    const result = applyMeasureAxisAssist3D(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0.05, 0.05),
      camera(),
      rect
    );

    expect(result?.axis).toBe("x");
    expect(result?.point).toEqual(new THREE.Vector3(1, 0, 0));
  });
});
