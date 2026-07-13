import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { KitchenGroup, KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { exportWebsiteShowcaseSnapshot } from "./websiteShowcaseExport";

type DemoParams = ModuleParams & {
  width: number;
  drawerCount: number;
  opened: boolean;
};

const material = (name: string, color: number) => {
  const result = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.03 });
  result.name = name;
  result.userData.catalogMaterialId = `material_${name}`;
  return result;
};

const tag = (mesh: THREE.Mesh, primitiveId: string, materialGroup: string, extra: Record<string, unknown> = {}) => {
  mesh.name = primitiveId;
  mesh.userData.primitiveId = primitiveId;
  mesh.userData.boardName = primitiveId;
  mesh.userData.partName = primitiveId;
  mesh.userData.materialGroup = materialGroup;
  mesh.userData.materialSlotId = materialGroup;
  Object.assign(mesh.userData, extra);
  return mesh;
};

function buildDemoModule(raw: ModuleParams): THREE.Group {
  const params = raw as DemoParams;
  const widthM = params.width / 1000;
  const group = new THREE.Group();
  group.name = "demo_module";
  group.userData.moduleDisplayName = "Website Demo Module";
  group.userData.modulePackageBuildParameters = structuredClone(params);

  const body = tag(
    new THREE.Mesh(new THREE.BoxGeometry(widthM, 0.7, 0.5), material("corpus", 0xd6d0c4)),
    "corpus_body",
    "corpus"
  );
  body.position.y = 0.45;
  group.add(body);

  const doorPivot = new THREE.Group();
  doorPivot.name = "door_pivot";
  doorPivot.position.set(-widthM * 0.5, 0.45, 0.259);
  doorPivot.rotation.y = params.opened ? -Math.PI * 0.45 : 0;
  const door = tag(
    new THREE.Mesh(new THREE.BoxGeometry(widthM, 0.7, 0.018), material("front", 0xeeeae2)),
    "door_front",
    "front"
  );
  door.position.x = widthM * 0.5;
  doorPivot.add(door);
  group.add(doorPivot);

  const fixedRunner = tag(
    new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.8, 0.025, 0.025), material("hardware", 0x333333)),
    "drawer_runner_fixed",
    "hardware",
    { drawerMotionRole: "fixed_corpus", parentDrawerIndex: 1, submoduleKind: "drawer" }
  );
  fixedRunner.position.set(0, 0.24, 0.08);
  group.add(fixedRunner);

  if (params.drawerCount > 0) {
    const drawer = tag(
      new THREE.Mesh(new THREE.BoxGeometry(widthM * 0.82, 0.16, 0.34), material("drawer", 0xa8a29a)),
      "drawer_box_1",
      "drawer_bottom",
      { drawerMotionRole: "moving", parentDrawerIndex: 1, submoduleKind: "drawer" }
    );
    drawer.position.set(0, 0.24, params.opened ? 0.28 : 0.05);
    group.add(drawer);
  }

  return group;
}

function makeInstance(params: DemoParams): LayoutInstance {
  const module = buildDemoModule(params);
  module.updateMatrixWorld(true);
  const localBox = new THREE.Box3().setFromObject(module);
  const root = new THREE.Group();
  root.name = "module_m1";
  root.position.set(1.2, 0, -0.8);
  root.rotation.y = Math.PI / 8;
  root.add(module);
  const pick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
  pick.name = "pick_m1";
  root.add(pick);
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  outline.name = "outline_m1";
  root.add(outline);
  root.updateMatrixWorld(true);
  return {
    id: "m1",
    params,
    kitchenGroupId: "kitchen_1",
    kitchenPlacement: { worktopId: "wt1", segmentIndex: 0, offsetAlongM: 0.4 },
    root,
    module,
    localBox,
    pick,
    outline
  };
}

function makeWorktop(): KitchenWorktopInstance {
  const root = new THREE.Group();
  root.name = "kitchenWorktopRoot_wt1";
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.04, 0.62), material("worktop", 0x8e7358));
  mesh.name = "kitchenWorktopMesh_wt1";
  mesh.position.set(0.5, 0.92, 0);
  mesh.userData.kind = "kitchenWorktop";
  mesh.userData.worktopId = "wt1";
  mesh.userData.kitchenGroupId = "kitchen_1";
  mesh.userData.materialGroup = "worktop";
  mesh.userData.materialSlotId = "worktop";
  root.add(mesh);
  const outline = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  outline.name = "kitchenWorktopOutline_wt1";
  root.add(outline);
  root.updateMatrixWorld(true);
  return {
    id: "wt1",
    kitchenGroupId: "kitchen_1",
    params: {
      path: [{ x: -0.5, z: 0 }, { x: 1.5, z: 0 }],
      justification: "back",
      mirrored: false,
      depthMm: 620,
      thicknessMm: 40,
      heightMm: 920,
      overhangSideMm: 20,
      materialId: "material_worktop"
    },
    root,
    mesh,
    outline
  };
}

const kitchenGroup = (): KitchenGroup => ({
  id: "kitchen_1",
  name: "Website kitchen",
  instanceIds: ["m1"],
  ctx: { heightMm: 920, moduleDepthMm: 600 } as KitchenGroup["ctx"]
});

const params = (overrides: Partial<DemoParams> = {}): DemoParams => ({
  type: "fwm_catalog_base_doors",
  width: 600,
  drawerCount: 1,
  opened: false,
  ...overrides
} as DemoParams);

describe("website showcase export", () => {
  it("exports worktop, coarse blocks, stable parts, exploded offsets, and real opened transforms", () => {
    const instance = makeInstance(params());
    const beforeParams = structuredClone(instance.params);
    const beforeChildren = instance.root.children.length;
    const payload = exportWebsiteShowcaseSnapshot({
      stage: "initial",
      exportedAt: "2026-07-11T20:00:00.000Z",
      modules: [instance],
      worktops: [makeWorktop()],
      kitchenGroups: [kitchenGroup()],
      buildModule: buildDemoModule
    });

    expect(payload.format).toBe("arcigy-website-showcase");
    expect(payload.meta.coordinateSystem).toBe("three_y_up_right_handed");
    expect(payload.meta.stage).toBe("initial");
    expect(payload.worktops[0]?.pathM).toEqual([{ x: -0.5, z: 0 }, { x: 1.5, z: 0 }]);
    expect(payload.modules[0]?.coarseBox.sizeM[0]).toBeCloseTo(0.6, 3);
    expect(payload.modules[0]?.parts.some((part) => part.name.startsWith("pick_") || part.name.startsWith("outline_"))).toBe(false);

    const door = payload.modules[0]?.parts.find((part) => part.semanticName === "door_front");
    const fixedRunner = payload.modules[0]?.parts.find((part) => part.semanticName === "drawer_runner_fixed");
    const movingDrawer = payload.modules[0]?.parts.find((part) => part.semanticName === "drawer_box_1");
    expect(door?.states.opened).toBeDefined();
    expect(door?.states.opened?.geometry).toBeUndefined();
    expect(fixedRunner?.metadata.drawerMotionRole).toBe("fixed_corpus");
    expect(fixedRunner?.states.opened).toBeUndefined();
    expect(movingDrawer?.states.opened).toBeDefined();
    expect(new Set(payload.modules[0]?.parts.map((part) => part.exploded.order)).size).toBe(payload.modules[0]?.parts.length);
    expect(payload.modules[0]?.parts.every((part) => part.exploded.offsetM.every(Number.isFinite))).toBe(true);
    expect(instance.params).toEqual(beforeParams);
    expect(instance.root.children).toHaveLength(beforeChildren);
    expect(JSON.stringify(payload)).not.toContain("uuid");
  });

  it("keeps matching part IDs/topology stable while dimensions change and new drawers appear", () => {
    const initialInstance = makeInstance(params({ width: 600, drawerCount: 0 }));
    const finalInstance = makeInstance(params({ width: 800, drawerCount: 1 }));
    const baseArgs = {
      exportedAt: "2026-07-11T20:00:00.000Z",
      worktops: [makeWorktop()],
      kitchenGroups: [kitchenGroup()],
      buildModule: buildDemoModule
    } as const;
    const initial = exportWebsiteShowcaseSnapshot({ ...baseArgs, stage: "initial", modules: [initialInstance] });
    const repeated = exportWebsiteShowcaseSnapshot({ ...baseArgs, stage: "initial", modules: [initialInstance] });
    const final = exportWebsiteShowcaseSnapshot({ ...baseArgs, stage: "final", modules: [finalInstance] });

    expect(JSON.stringify(repeated)).toBe(JSON.stringify(initial));
    const initialBody = initial.modules[0]?.parts.find((part) => part.semanticName === "corpus_body");
    const finalBody = final.modules[0]?.parts.find((part) => part.semanticName === "corpus_body");
    expect(finalBody?.id).toBe(initialBody?.id);
    expect(finalBody?.geometry.topologyKey).toBe(initialBody?.geometry.topologyKey);
    expect(final.modules[0]?.coarseBox.sizeM[0]).toBeGreaterThan(initial.modules[0]?.coarseBox.sizeM[0] ?? 0);
    expect(initial.modules[0]?.parts.some((part) => part.semanticName === "drawer_box_1")).toBe(false);
    expect(final.modules[0]?.parts.some((part) => part.semanticName === "drawer_box_1")).toBe(true);
  });
});
