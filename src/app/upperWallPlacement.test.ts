import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createKitchenPlacementController, type KitchenPlacementControllerContext } from './kitchenPlacementController';
import { makeDefaultKitchenContext } from '../layout/kitchenContext';
import type { LayoutInstance, WallInstance } from './localTypes';
import { solveWallNetwork } from '../walls2d/solver';
import { makeDefaultFwmFurnitureParams } from '../modules/fwmFurniture/types';
import { buildFwmFurniture } from '../modules/fwmFurniture/geometry';
import { getSystemSeedCatalog } from '../core/catalog/catalog-repository';
import { extendedFurnitureModulePackages } from '../system/module-packages/extendedFurniture';

function wall(id: string, ax: number, az: number, bx: number, bz: number, heightMm = 2600): WallInstance {
  return { id, params: { aMm: { x: ax, z: az }, bMm: { x: bx, z: bz }, thicknessMm: 100,
    heightMm, justification: 'center', materialId: 'wall' }, heightMm, root: new THREE.Group() } as WallInstance;
}

function upper(corner = false): LayoutInstance {
  const root = new THREE.Group(), module = new THREE.Group();
  root.add(module);
  const box = corner
    ? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(.7, .72, .7))
    : new THREE.Box3(new THREE.Vector3(-.3, 0, -.16), new THREE.Vector3(.3, .72, .16));
  return { id: 'upper', root, module, localBox: box, params: {
    type: corner ? 'fwm_catalog_wall_corner' : 'fwm_catalog_wall_cabinet', kitchenModuleRole: 'top',
    width: corner ? 700 : 600, height: 720, depth: 320, isCorner: corner
  }, kitchenGroupId: 'kg', kitchenPlacement: null, pick: new THREE.Mesh(), outline: new THREE.LineSegments() } as LayoutInstance;
}

function fixture(walls = [wall('back', 0, -50, 5000, -50)]) {
  const kitchenCtx = makeDefaultKitchenContext();
  const ctx = { S: { kitchenEditMode: true, activeKitchenGroupId: 'kg', kitchenCtx,
    kitchenGroups: [{ id: 'kg', name: 'Kitchen', ctx: kitchenCtx, instanceIds: [] }] }, walls, instances: [],
    floors: [], kitchenWorktops: [{ id: 'wt', kitchenGroupId: 'kg', params: {
      path: [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 2000 }], depthMm: 600,
      justification: 'back', mirrored: false, thicknessMm: 38, heightMm: 900, overhangSideMm: 0, materialId: ''
    } }], wallSolvedOutlines: new Map(),
    getKitchenWorktopBackGuidePath: () => [new THREE.Vector3(), new THREE.Vector3(2, 0, 0), new THREE.Vector3(2, 0, 2)],
    rebuildInstance: vi.fn(() => true), rebuildKitchenWorktop: vi.fn(), rebuildKitchenGroupWorktops: vi.fn(),
    updateLayoutPanel: vi.fn(), getWallSolvedJoinPolys: () => [], getWallUnionPolys: () => null,
    getLayoutTool: () => 'select', getWallChainStart: () => null, commitHistory: vi.fn(), catalog: {}
  } as unknown as KitchenPlacementControllerContext;
  return { ctx, controller: createKitchenPlacementController(ctx) };
}

function accept(inst: LayoutInstance, result: ReturnType<ReturnType<typeof createKitchenPlacementController>['getKitchenPlacementConstraint']>) {
  expect(result?.valid).toBe(true);
  inst.root.position.copy(result!.position); inst.root.rotation.y = result!.rotationY;
  inst.kitchenPlacement = result!.kitchenPlacement; inst.root.updateMatrixWorld(true);
}

describe('joined wall corners and zero clearance regressions', () => {
  function joined(rotation: number, reversed: boolean) {
    const turn = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    const walls = [[0, 0, 4000, 0], [0, 0, 0, 3000]].map(([ax, az, bx, bz], i) => {
      const a = turn(ax, az), b = turn(bx, bz);
      return reversed ? wall(String(i), b.x, b.z, a.x, a.z) : wall(String(i), a.x, a.z, b.x, b.z);
    });
    const result = fixture(walls);
    const solved = solveWallNetwork(walls.map(w => ({ id: w.id, a: { x: w.params.aMm.x / 1000, z: w.params.aMm.z / 1000 },
      b: { x: w.params.bMm.x / 1000, z: w.params.bMm.z / 1000 }, thicknessM: .1, justification: 'center', exteriorSign: 1 })));
    for (const w of solved.walls) result.ctx.wallSolvedOutlines.set(w.id, w.outline);
    return { ...result, turn };
  }
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2].flatMap(rotation => [false, true].flatMap(reversed =>
    ['corner_90', 'corner_chamfered', 'corner_open_chamfered'].map(variant => ({ rotation, reversed, variant })))))
  ('mounts real $variant at joined walls rotation=$rotation reversed=$reversed', ({ rotation, reversed, variant }) => {
    const { ctx, controller, turn } = joined(rotation, reversed);
    ctx.modulePackages = extendedFurnitureModulePackages.filter(p => p.module.moduleType === 'fwm_catalog_wall_cabinet' && p.module.modulePackageId !== 'wall_corner_90');
    const inst = upper(true);
    inst.params = { ...makeDefaultFwmFurnitureParams('fwm_catalog_wall_cabinet'), variant, width: 700, depth: 320, height: 720 };
    inst.root.remove(inst.module);
    inst.module = buildFwmFurniture(inst.params, getSystemSeedCatalog());
    inst.root.add(inst.module); inst.localBox.setFromObject(inst.module);
    ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, turn(.2, .2)));
    expect(inst.kitchenPlacement?.kind).toBe('wall-corner');
    expect(controller.hasRequiredKitchenWallSupport(inst)).toBe(true);
    const projected = new THREE.Box3().setFromObject(inst.module).getSize(new THREE.Vector3());
    expect(projected.x).toBeGreaterThan(.3); expect(projected.z).toBeGreaterThan(.3);
  });
  it.each([false, true])('zero gap touches the room-facing side of the cross wall, reversed=%s', reversed => {
    const { ctx, controller } = joined(0, reversed); const inst = upper(); ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(1, 0, .2)));
    const source = controller.getKitchenRunDimensionSources('kg', 'upper').find(s => s.wallId === '0')!;
    const edge = reversed ? source.end : source.start;
    expect(edge.x).toBeCloseTo(.05, 6);
    expect(controller.moveKitchenRunModuleByGap(inst.id, reversed ? 'after' : 'before', 0).ok).toBe(true);
    expect(inst.root.position.x - .3).toBeCloseTo(.05, 6);
    expect(controller.hasRequiredKitchenWallSupport(inst)).toBe(true);
  });
  it('keeps runs on opposite sides of a partition independent when editing zero clearance', () => {
    const { ctx, controller } = fixture([wall('back', 0, -50, 5000, -50), wall('partition', 2500, -50, 2500, 3000)]);
    const left = upper(), right = upper(); right.id = 'right'; ctx.instances.push(left, right);
    accept(left, controller.getKitchenPlacementConstraint(left, new THREE.Vector3(1, 0, .2)));
    accept(right, controller.getKitchenPlacementConstraint(right, new THREE.Vector3(4, 0, .2)));
    const runs = controller.getKitchenRunDimensionSources('kg', 'upper').filter(s => s.wallId === 'back');
    expect(runs).toHaveLength(2);
    const previous = left.root.position.clone();
    expect(controller.moveKitchenRunModuleByGap(right.id, 'before', 0).ok).toBe(true);
    expect(right.root.position.x - .3).toBeCloseTo(2.55, 6);
    expect(left.root.position.equals(previous)).toBe(true);
  });
});

describe('upper cabinets require physical wall support, independent of worktop', () => {
  it('rolls back the entire group when a placement-only height change loses support', () => {
    const { ctx, controller } = fixture(); const inst = upper(); ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    const previous = structuredClone(ctx.S.kitchenGroups[0].ctx);
    const next = { ...previous, upperStartHeightMm: 2400 };
    const binding = structuredClone(inst.kitchenPlacement);
    const pose = inst.root.position.clone();
    ctx.S.kitchenGroups[0].ctx = next; ctx.S.kitchenCtx = next;
    expect(controller.rebuildKitchenGroupLayout('kg', next, previous)).toBe(false);
    expect(ctx.S.kitchenGroups[0].ctx).toEqual(previous);
    expect(inst.root.position.equals(pose)).toBe(true);
    expect(inst.kitchenPlacement).toEqual(binding);
  });
  it('applies a valid mounting-height change even when depth is unchanged', () => {
    const { ctx, controller } = fixture(); const inst = upper(); ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    const anchor = controller.getModuleWorldKitchenAnchor(inst);
    ctx.S.kitchenGroups[0].ctx.upperStartHeightMm = 1600;
    controller.preserveWorldKitchenAnchor(inst, anchor);
    expect(inst.root.position.y).toBeCloseTo(1.6, 8);
    expect(controller.hasRequiredKitchenWallSupport(inst)).toBe(true);
    expect(inst.root.position.x).toBeCloseTo(4, 8);
    expect(inst.root.position.z - .16).toBeCloseTo(0, 8);
  });
  it.each([0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2])('follows the true wall plane at rotation %s', rotation => {
    const rotate = (x: number, z: number) => ({ x: x * Math.cos(rotation) + z * Math.sin(rotation), z: -x * Math.sin(rotation) + z * Math.cos(rotation) });
    const a = rotate(0, -50), b = rotate(5000, -50), cursor = rotate(2000, 200), expected = rotate(2000, 0);
    const { controller } = fixture([wall('rotated', a.x, a.z, b.x, b.z)]); const inst = upper();
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(cursor.x / 1000, 0, cursor.z / 1000)));
    const back = new THREE.Vector3(0, 0, -.16).applyMatrix4(inst.root.matrixWorld);
    expect(back.x * 1000).toBeCloseTo(expected.x, 6); expect(back.z * 1000).toBeCloseTo(expected.z, 6);
  });

  it.each([
    ['center', 1, 50], ['interior', 1, 100], ['exterior', 1, 0],
    ['center', -1, 50], ['interior', -1, 0], ['exterior', -1, 100]
  ] as const)('respects %s wall justification and exterior sign %s', (justification, exteriorSign, faceZ) => {
    const host = wall('back', 0, 0, 5000, 0); Object.assign(host.params, { justification, exteriorSign });
    const { controller } = fixture([host]); const inst = upper();
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(2, 0, .3)));
    expect((inst.root.position.z - .16) * 1000).toBeCloseTo(faceZ, 6);
  });

  it('does not mount through a window, but permits mounting above a lower opening', () => {
    const { ctx, controller } = fixture();
    const opening = { params: { wallId: 'back', centerMm: 2000, widthMm: 1500, sillHeightMm: 800, heightMm: 1600 } };
    ctx.getWindows = () => [opening] as ReturnType<NonNullable<typeof ctx.getWindows>>;
    expect(controller.getKitchenPlacementConstraint(upper(), new THREE.Vector3(2, 0, .2))?.valid).toBe(false);
    opening.params.heightMm = 500;
    expect(controller.getKitchenPlacementConstraint(upper(), new THREE.Vector3(2, 0, .2))?.valid).toBe(true);
  });

  it('reconciles a wall move and rejects shortening with exact pose rollback', () => {
    const { ctx, controller } = fixture(); const inst = upper(); ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    ctx.walls[0].params.aMm.z += 300; ctx.walls[0].params.bMm.z += 300;
    expect(controller.reconcileMountedModules()).toBe(true);
    expect(inst.root.position.z - .16).toBeCloseTo(.3, 8);
    const pose = inst.root.position.clone();
    ctx.walls[0].params.bMm.x = 3000;
    expect(controller.reconcileMountedModules()).toBe(false);
    expect(inst.root.position.equals(pose)).toBe(true);
  });
  it('blocks both upper kinds without drawn walls even if a worktop corner exists', () => {
    const { controller } = fixture([]);
    for (const corner of [false, true]) expect(controller.getKitchenPlacementConstraint(upper(corner), new THREE.Vector3(2, 0, 0))?.valid).toBe(false);
  });

  it('places a normal upper past the worktop end on a real wall', () => {
    const { controller } = fixture(); const inst = upper();
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    expect(inst.root.position.x).toBeCloseTo(4, 8);
    expect(inst.root.position.z - .16).toBeCloseTo(0, 8);
    expect(inst.root.position.y).toBeCloseTo(1.4, 8);
    expect(inst.kitchenPlacement).toMatchObject({ wallId: 'back' });
  });

  it('allows a normal upper at a worktop corner without reserving it for a corner cabinet', () => {
    const { controller } = fixture(); const inst = upper();
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(2, 0, .2)));
    expect(inst.root.position.x).toBeCloseTo(2, 8);
    expect(inst.root.rotation.y).toBeCloseTo(0, 8);
  });

  it('uses a real wall even when the kitchen has no worktop', () => {
    const { ctx, controller } = fixture(); ctx.kitchenWorktops.length = 0;
    expect(controller.getKitchenPlacementConstraint(upper(), new THREE.Vector3(3, 0, .2))?.valid).toBe(true);
  });

  it('does not let an island or distant wall impersonate support', () => {
    const { controller } = fixture([wall('far', 0, -4050, 5000, -4050)]);
    expect(controller.getKitchenPlacementConstraint(upper(), new THREE.Vector3(1, 0, .2))?.valid).toBe(false);
  });

  it.each([['too short', wall('back', 0, -50, 500, -50)], ['too low', wall('back', 0, -50, 5000, -50, 2000)]])(
    'rejects a wall that is %s for the actual cabinet', (_, host) => {
      const { controller } = fixture([host]);
      expect(controller.getKitchenPlacementConstraint(upper(), new THREE.Vector3(.3, 0, .2))?.valid).toBe(false);
    });

  it('allows a corner upper in a two-wall corner outside the worktop', () => {
    const { controller } = fixture([wall('back', 0, -50, 5000, -50), wall('left', -50, 0, -50, 3000)]);
    const inst = upper(true);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(.1, 0, .1)));
    expect(inst.root.position.x).toBeCloseTo(0, 8); expect(inst.root.position.z).toBeCloseTo(0, 8);
    expect(inst.kitchenPlacement).toMatchObject({ kind: 'wall-corner' });
  });

  it('rejects a corner upper on a straight wall and at an unsupported worktop corner', () => {
    const { controller } = fixture();
    for (const x of [1, 2, 4]) expect(controller.getKitchenPlacementConstraint(upper(true), new THREE.Vector3(x, 0, .2))?.valid).toBe(false);
  });

  it('keeps wall anchoring through depth/width changes, context edits, and JSON restoration', () => {
    const { ctx, controller } = fixture(); const inst = upper(); ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    const binding = JSON.parse(JSON.stringify(inst.kitchenPlacement));
    for (const depth of [.25, .42, .32]) {
      inst.localBox.min.z = -depth / 2; inst.localBox.max.z = depth / 2;
      inst.localBox.min.x = -.4; inst.localBox.max.x = .4;
      expect(controller.applyKitchenPlacementBinding(inst, binding, 125)).toBe(true);
      expect(inst.root.position.x).toBeCloseTo(4, 8); expect(inst.root.position.z - depth / 2).toBeCloseTo(0, 8);
      inst.root.position.set(123, 0, 456); controller.restoreKitchenModulePlacements();
      expect(inst.root.position.x).toBeCloseTo(4, 8); expect(inst.root.position.z - depth / 2).toBeCloseTo(0, 8);
    }
  });

  it('refuses to reapply an attachment if its wall disappears', () => {
    const { ctx, controller } = fixture(); const inst = upper();
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    ctx.walls.length = 0;
    expect(controller.applyKitchenPlacementBinding(inst, inst.kitchenPlacement!, 20)).toBe(false);
  });

  it('keeps adaptive width dimensions editable for an upper outside the worktop', () => {
    const { ctx, controller } = fixture(); const inst = upper(); ctx.instances.push(inst);
    accept(inst, controller.getKitchenPlacementConstraint(inst, new THREE.Vector3(4, 0, .2)));
    ctx.rebuildInstance = () => true;
    const run = controller.getKitchenRunDimensionSources('kg', 'upper').find(run => run.modules.some(m => m.id === inst.id));
    expect(run?.modules[0].widthMm).toBe(600);
    expect(controller.moveKitchenRunModuleByGap(inst.id, 'before', 3200).ok).toBe(true);
    expect(inst.root.position.x).toBeCloseTo(3.5, 8);
    expect(inst.kitchenPlacement).toMatchObject({ wallId: 'back' });
  });
});
