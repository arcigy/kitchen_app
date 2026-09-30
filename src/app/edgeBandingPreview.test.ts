import { BoxGeometry, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Path, Shape, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { EdgeEntity } from "../core/edge-banding/edgeEntities";
import { contourEdgeEntities } from "../core/edge-banding/edgeEntities";
import { makeDefaultFwmFurnitureParams } from "../modules/fwmFurniture/types";
import { modulePreviewEdges, pickEdgeFace, previewEdgeFace, projectEdgeFaces, type PreviewEdge } from "./edgeBandingPreview";

const params = { ...makeDefaultFwmFurnitureParams("fwm_catalog_base_doors"), boardThickness: 18 };
const faceArea = (edge: PreviewEdge) => edge.worldFace[1].clone().sub(edge.worldFace[0])
  .cross(edge.worldFace[3].clone().sub(edge.worldFace[0])).length();

describe("complete edge banding side faces", () => {
  it.each([false, true])("covers both sides of an 18 mm panel after rotation and mirroring (%s)", mirrored => {
    const mesh = new Mesh(new BoxGeometry(.018, .72, .6), new MeshBasicMaterial());
    mesh.name = "left-side"; mesh.userData.materialGroup = "corpus";
    mesh.scale.set(mirrored ? -1 : 1, 1.5, 1);
    mesh.rotation.set(.25, .8, -.4); mesh.position.set(1, 2, 3);
    const root = new Group(); root.scale.x = -1; root.rotation.z = .6; root.add(mesh);
    try {
      const edges = modulePreviewEdges(root, params);
      expect(edges).toHaveLength(4);
      // Perimeter of a 1080 × 600 panel, multiplied by its 18 mm thickness.
      expect(edges.reduce((sum, edge) => sum + faceArea(edge), 0)).toBeCloseTo(3.36 * .018, 7);
      for (const edge of edges) {
        const corners = edge.worldFace.map(point => mesh.worldToLocal(point.clone()));
        expect(Math.min(...corners.map(p => p.x))).toBeCloseTo(-.009, 7);
        expect(Math.max(...corners.map(p => p.x))).toBeCloseTo(.009, 7);
        expect(corners.every(p => Math.abs(p.y) <= .360001 && Math.abs(p.z) <= .300001)).toBe(true);
        expect(faceArea(edge)).toBeCloseTo(edge.lengthMm / 1000 * .018, 7);
      }
    } finally { mesh.geometry.dispose(); mesh.material.dispose(); }
  });

  it("covers outer and inner side faces of an extruded panel without filling its broad face or hole", () => {
    const shape = new Shape(); shape.moveTo(0, 0); shape.lineTo(1, 0); shape.lineTo(1, .6); shape.lineTo(0, .6); shape.closePath();
    const hole = new Path(); hole.moveTo(.2, .2); hole.lineTo(.2, .4); hole.lineTo(.4, .4); hole.lineTo(.4, .2); hole.closePath(); shape.holes.push(hole);
    const mesh = new Mesh(new ExtrudeGeometry(shape, { depth: .018, bevelEnabled: false }), new MeshBasicMaterial());
    mesh.name = "panel-with-cutout"; mesh.userData.materialGroup = "corpus";
    const root = new Group(); root.add(mesh);
    try {
      const edges = modulePreviewEdges(root, params);
      expect(edges).toHaveLength(8);
      // Outer 3.2 m perimeter + 0.8 m cutout, each 18 mm high.
      expect(edges.reduce((sum, edge) => sum + faceArea(edge), 0)).toBeCloseTo(4 * .018, 7);
      for (const edge of edges) {
        expect(Math.min(...edge.worldFace.map(p => p.z))).toBeCloseTo(0, 7);
        expect(Math.max(...edge.worldFace.map(p => p.z))).toBeCloseTo(.018, 7);
      }
    } finally { mesh.geometry.dispose(); mesh.material.dispose(); }
  });

  it("uses the full thickness on all three edges of a custom 300/400/500 mm triangle", () => {
    const points = [{ x: 0, y: 0, z: 0 }, { x: 300, y: 0, z: 0 }, { x: 0, y: 400, z: 0 }];
    const edges = contourEdgeEntities("custom", points.map((a, i) => ({ a, b: points[(i + 1) % 3]! })))
      .map(edge => previewEdgeFace(edge, { x: 0, y: 0, z: 18 }, p => new Vector3(p.x, p.y, p.z).multiplyScalar(.001)));
    expect(edges.map(edge => edge.lengthMm).sort((a, b) => a - b)).toEqual([300, 400, 500]);
    expect(edges.reduce((sum, edge) => sum + faceArea(edge), 0)).toBeCloseTo(.0216, 8);
  });
});

function screenFace(id: string, near = 0, far = near): PreviewEdge {
  const edge: EdgeEntity = { id, partId: "panel", label: id, start: { x: 0, y: 0, z: 0 }, end: { x: 100, y: 0, z: 0 }, lengthMm: 100, defaultGroupId: null };
  const result = previewEdgeFace(edge, { x: 0, y: 20, z: 0 }, p => new Vector3(p.x, p.y, p.z));
  result.worldFace[0].z = near; result.worldFace[3].z = near;
  result.worldFace[1].z = far; result.worldFace[2].z = far;
  return result;
}
const project = (point: Vector3) => ({ x: point.x, y: point.y, z: point.z });

describe("picking the visible banding surface", () => {
  it("selects anywhere across the filled face, beyond the old line's hit radius", () => {
    const edge = screenFace("band"); const faces = projectEdgeFaces([edge], project);
    expect(pickEdgeFace(faces, { x: 50, y: 18 })?.id).toBe("band");
    expect(pickEdgeFace(faces, { x: 50, y: 26 })).toBeNull();
    expect(pickEdgeFace(faces, { x: -6, y: 10 })).toBeNull();
  });
  it("picks the closest actual surface at the cursor, independently of draw order or average depth", () => {
    const sloped = screenFace("sloped", -.8, .8), flat = screenFace("flat", -.2);
    for (const edges of [[sloped, flat], [flat, sloped]]) {
      const faces = projectEdgeFaces(edges, project);
      expect(pickEdgeFace(faces, { x: 10, y: 10 })?.id).toBe("sloped");
      expect(pickEdgeFace(faces, { x: 90, y: 10 })?.id).toBe("flat");
    }
  });
  it("keeps a panel viewed edge-on selectable and excludes clipped faces", () => {
    const edge = screenFace("edge-on"); edge.worldFace.forEach(p => { p.y = 0; });
    expect(pickEdgeFace(projectEdgeFaces([edge], project), { x: 50, y: 2 })?.id).toBe("edge-on");
    expect(projectEdgeFaces([screenFace("behind", -2), screenFace("beyond", 2)], project)).toEqual([]);
  });
});
