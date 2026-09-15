import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildFwmFurniture } from '../modules/fwmFurniture/geometry';
import { makeDefaultFwmFurnitureParams } from '../modules/fwmFurniture/types';
import { getSystemSeedCatalog } from '../core/catalog/catalog-repository';
import type { LayoutInstance } from './localTypes';
import { getModulePlanLocalPolygon } from './planSnap';
import { buildModuleEdgeGeometry, buildModulePlanPickGeometry } from './moduleVisualGeometry';

describe('open niche plan matches its complete cabinet', () => {
  it.each(['fwm_tall_open_end', 'fwm_catalog_base_open_end'].flatMap(type =>
    ['straight', 'chamfered', 'rounded'].flatMap(shape => ['left', 'right'].map(endingSide => ({ type, shape, endingSide })))))
  ('$type $shape $endingSide keeps its true footprint after resizing and view changes', ({ type, shape, endingSide }) => {
    for (const [width, depth] of [[300, 580], [450, 620]]) {
      const params = { ...makeDefaultFwmFurnitureParams(type), shape, endingSide, width, depth, height: 2200,
        variant: 'open_niche', cornerRadiusMm: 120, chamferMm: 120 };
      const module = buildFwmFurniture(params, getSystemSeedCatalog()), root = new THREE.Group(); root.add(module);
      const inst: LayoutInstance = { id: 'niche', params, module, root, localBox: new THREE.Box3().setFromObject(module),
        kitchenGroupId: null, kitchenPlacement: null, pick: new THREE.Mesh(), outline: new THREE.LineSegments() };
      for (const visible of [true, false, true]) {
        root.position.set(4, 0, 2); root.rotation.y = Math.PI / 2; module.visible = visible;
        const polygon = getModulePlanLocalPolygon(inst, () => new THREE.Vector3(0, 0, -depth / 2000));
        const box = new THREE.Box3().setFromPoints(polygon);
        expect(box.max.x - box.min.x).toBeCloseTo(width / 1000, 6);
        expect(box.max.z - box.min.z).toBeCloseTo(depth / 1000, 6);
        const area = Math.abs(polygon.reduce((sum, p, i) => {
          const q = polygon[(i + 1) % polygon.length]; return sum + p.x * q.z - q.x * p.z;
        }, 0)) / 2;
        expect(area).toBeGreaterThan(width * depth / 1e6 * .8);
        if (shape === 'chamfered') expect(area).toBeCloseTo((width * depth - 120 * 120 / 2) / 1e6, 6);
        if (shape === 'rounded') expect(polygon.length).toBeGreaterThan(5);
        const outline = buildModuleEdgeGeometry(inst, true, () => new THREE.Vector3(0, 0, -depth / 2000));
        outline.computeBoundingBox(); expect(outline.boundingBox!.getSize(new THREE.Vector3()).z).toBeCloseTo(depth / 1000, 6);
        const pick = buildModulePlanPickGeometry(polygon); pick.computeBoundingBox();
        expect(pick.boundingBox!.getSize(new THREE.Vector3()).x).toBeCloseTo(width / 1000, 6);
        outline.dispose(); pick.dispose();
      }
    }
  });
});
