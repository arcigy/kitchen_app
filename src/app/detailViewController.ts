import * as THREE from "three";
import { disposeObject3D } from "../core/dispose";
import {
  buildPlaneSliceStripGeometry,
  computeElevationViewConfig,
  computeSectionViewConfig
} from "./sectionViews";
import type {
  FloorInstance,
  KitchenWorktopInstance,
  LayoutInstance,
  SectionElevationKey,
  SectionInstance,
  WallInstance,
  WindowInstance
} from "./localTypes";

type ViewNavigationApi = {
  captureFloorplanView: () => void;
  restoreFloorplanView: () => void;
  detailViewPanOffset: THREE.Vector3;
};

type DetailViewControllerContext = {
  renderer: THREE.WebGLRenderer;
  getCamera: () => THREE.Camera;
  getControls: () => { target: THREE.Vector3; update: () => void };
  view2d: HTMLInputElement;
  setView2d: (enabled: boolean) => void;
  setExtraTabs: (tabs: Array<{ key: string; label: string; onClick: () => void }>) => void;
  syncViewerTabs: (activeKey: string) => void;
  viewNavigation: ViewNavigationApi;
  detailSliceGroup: THREE.Group;
  walls: WallInstance[];
  floors: FloorInstance[];
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  sections: SectionInstance[];
  getCabinetGroup: () => THREE.Group | null;
  getWindowInst: () => WindowInstance | null;
  getMode: () => "build" | "layout";
  getViewMode: () => "2d" | "3d";
  getActiveViewerTab: () => string;
  setActiveViewerTab: (next: string) => void;
};

export function createDetailViewController(ctx: DetailViewControllerContext) {
  let activeDetailClipPlanes: THREE.Plane[] = [];

  const getNavigationSceneBounds = () => {
    const box = new THREE.Box3();
    if (ctx.getMode() !== "layout") {
      const cabinetGroup = ctx.getCabinetGroup();
      if (cabinetGroup) box.expandByObject(cabinetGroup);
      if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2, 1));
      return box.expandByScalar(0.08);
    }
    for (const wall of ctx.walls) box.expandByObject(wall.root);
    for (const floor of ctx.floors) box.expandByObject(floor.root);
    for (const inst of ctx.instances) box.expandByObject(inst.root);
    for (const worktop of ctx.kitchenWorktops) box.expandByObject(worktop.root);
    const windowInst = ctx.getWindowInst();
    if (windowInst) box.expandByObject(windowInst.root);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2.6, 1));
    return box.expandByScalar(0.05);
  };

  const applyMaterialClippingPlanes = (material: THREE.Material | THREE.Material[] | undefined, planes: THREE.Plane[]) => {
    const nextPlanes = planes.map((plane) => plane.clone());
    const applyOne = (mat: THREE.Material) => {
      (mat as THREE.Material & { clippingPlanes?: THREE.Plane[] }).clippingPlanes = nextPlanes;
      mat.needsUpdate = true;
    };
    if (Array.isArray(material)) {
      for (const mat of material) applyOne(mat);
      return;
    }
    if (material) applyOne(material);
  };

  const applyMaterialOpacityMode = (
    material: THREE.Material | THREE.Material[] | undefined,
    transparent: boolean,
    opacity: number,
    depthWrite: boolean
  ) => {
    const applyOne = (mat: THREE.Material) => {
      if (!("opacity" in mat)) return;
      mat.transparent = transparent;
      mat.opacity = opacity;
      mat.depthWrite = depthWrite;
      mat.needsUpdate = true;
    };
    if (Array.isArray(material)) {
      for (const mat of material) applyOne(mat);
      return;
    }
    if (material) applyOne(material);
  };

  const syncDetailClippingAndMaterials = () => {
    const viewMode = ctx.getViewMode();
    const activeViewerTab = ctx.getActiveViewerTab();
    const detailPlanes = viewMode === "2d" && activeViewerTab !== "floorplan" ? activeDetailClipPlanes : [];
    const isSectionDetailView = viewMode === "2d" && activeViewerTab.startsWith("section:");
    ctx.renderer.clippingPlanes = [];

    for (const wall of ctx.walls) {
      applyMaterialClippingPlanes(wall.mesh.material, detailPlanes);
      applyMaterialOpacityMode(
        wall.mesh.material,
        viewMode === "2d",
        viewMode === "2d" ? (activeViewerTab === "floorplan" ? 1 : isSectionDetailView ? 0.07 : 0.16) : 1,
        viewMode !== "2d"
      );
    }

    for (const floor of ctx.floors) {
      applyMaterialClippingPlanes(floor.mesh.material, detailPlanes);
      applyMaterialOpacityMode(floor.mesh.material, false, 1, true);
    }

    for (const worktop of ctx.kitchenWorktops) {
      applyMaterialClippingPlanes(worktop.mesh.material, detailPlanes);
      applyMaterialOpacityMode(
        worktop.mesh.material,
        viewMode === "2d",
        viewMode === "2d" ? (activeViewerTab === "floorplan" ? 0.35 : 0.16) : 1,
        viewMode !== "2d"
      );
    }

    for (const inst of ctx.instances) {
      inst.module.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        applyMaterialClippingPlanes(mesh.material as THREE.Material | THREE.Material[], detailPlanes);
        applyMaterialOpacityMode(
          mesh.material as THREE.Material | THREE.Material[],
          viewMode === "2d" && activeViewerTab !== "floorplan",
          viewMode === "2d" && activeViewerTab !== "floorplan" ? (isSectionDetailView ? 0.1 : 0.18) : 1,
          viewMode !== "2d"
        );
      });
    }
  };

  const fitOrthoConfigToViewport = (
    config: ReturnType<typeof computeElevationViewConfig> | ReturnType<typeof computeSectionViewConfig>
  ) => {
    if (!config) return null;
    const canvas = ctx.renderer.domElement;
    const aspect = Math.max(0.0001, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    const width = Math.max(0.0001, config.right - config.left);
    const height = Math.max(0.0001, config.top - config.bottom);
    const frustumAspect = width / height;
    const centerU = (config.left + config.right) / 2;
    const centerV = (config.top + config.bottom) / 2;

    if (frustumAspect < aspect) {
      const nextWidth = height * aspect;
      return {
        ...config,
        left: centerU - nextWidth / 2,
        right: centerU + nextWidth / 2
      };
    }

    const nextHeight = width / aspect;
    return {
      ...config,
      top: centerV + nextHeight / 2,
      bottom: centerV - nextHeight / 2
    };
  };

  const applyOrthoViewConfig = (config: ReturnType<typeof computeElevationViewConfig> | ReturnType<typeof computeSectionViewConfig>) => {
    const activeCam = ctx.getCamera();
    const fittedConfig = fitOrthoConfigToViewport(config);
    if (!(activeCam instanceof THREE.OrthographicCamera) || !fittedConfig) return;
    activeDetailClipPlanes = [fittedConfig.clipPlane.clone()];
    syncDetailClippingAndMaterials();
    activeCam.position.copy(fittedConfig.position).add(ctx.viewNavigation.detailViewPanOffset);
    activeCam.up.copy(fittedConfig.up);
    activeCam.left = fittedConfig.left;
    activeCam.right = fittedConfig.right;
    activeCam.top = fittedConfig.top;
    activeCam.bottom = fittedConfig.bottom;
    activeCam.near = fittedConfig.near;
    activeCam.far = fittedConfig.far;
    const nextTarget = fittedConfig.target.clone().add(ctx.viewNavigation.detailViewPanOffset);
    activeCam.lookAt(nextTarget);
    activeCam.updateProjectionMatrix();
    const controls = ctx.getControls();
    controls.target.copy(nextTarget);
    controls.update();
  };

  const updateDetailSliceOverlay = () => {
    for (const child of [...ctx.detailSliceGroup.children]) {
      ctx.detailSliceGroup.remove(child);
      disposeObject3D(child);
    }
    const activeViewerTab = ctx.getActiveViewerTab();
    const isSectionView = ctx.getViewMode() === "2d" && activeViewerTab.startsWith("section:") && activeDetailClipPlanes.length > 0;
    ctx.detailSliceGroup.visible = isSectionView;
    if (!isSectionView) return;
    const plane = activeDetailClipPlanes[0]?.clone();
    if (!plane) return;
    const addSliceMesh = (targets: THREE.Object3D[], thicknessM: number, color: number) => {
      const sliceGeometry = buildPlaneSliceStripGeometry(targets, plane, thicknessM);
      if (!sliceGeometry.getAttribute("position")?.count) return;
      const mesh = new THREE.Mesh(
        sliceGeometry,
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, depthWrite: false })
      );
      mesh.renderOrder = 75;
      mesh.frustumCulled = false;
      ctx.detailSliceGroup.add(mesh);
    };

    addSliceMesh(ctx.walls.map((wall) => wall.mesh), 0.09, 0x0b0f14);
    addSliceMesh(ctx.instances.map((inst) => inst.module), 0.055, 0x1c2430);
    addSliceMesh(ctx.kitchenWorktops.map((worktop) => worktop.mesh), 0.045, 0x202a37);
  };

  const viewerElevations: Array<{ key: `elevation:${SectionElevationKey}`; label: string; direction: SectionElevationKey }> = [
    { key: "elevation:north", label: "North", direction: "north" },
    { key: "elevation:east", label: "East", direction: "east" },
    { key: "elevation:south", label: "South", direction: "south" },
    { key: "elevation:west", label: "West", direction: "west" }
  ];

  const activateViewerTab = (key: string) => {
    if (ctx.getActiveViewerTab() === "floorplan" && key !== "floorplan" && ctx.getViewMode() === "2d") {
      ctx.viewNavigation.captureFloorplanView();
    }
    if (key === "3d") {
      ctx.setActiveViewerTab("3d");
      ctx.viewNavigation.detailViewPanOffset.set(0, 0, 0);
      activeDetailClipPlanes = [];
      ctx.view2d.checked = false;
      ctx.setView2d(false);
      ctx.syncViewerTabs(ctx.getActiveViewerTab());
      return;
    }

    ctx.setActiveViewerTab(key);
    ctx.view2d.checked = true;
    ctx.setView2d(true);
    if (key === "floorplan") {
      ctx.viewNavigation.detailViewPanOffset.set(0, 0, 0);
      activeDetailClipPlanes = [];
      syncDetailClippingAndMaterials();
      ctx.viewNavigation.restoreFloorplanView();
      updateDetailSliceOverlay();
      ctx.syncViewerTabs(ctx.getActiveViewerTab());
      return;
    }

    const bounds = getNavigationSceneBounds();
    ctx.viewNavigation.detailViewPanOffset.set(0, 0, 0);
    if (key.startsWith("section:")) {
      const sectionId = key.slice("section:".length);
      const section = ctx.sections.find((item) => item.id === sectionId) ?? null;
      if (section) applyOrthoViewConfig(computeSectionViewConfig(section.params, bounds));
    } else if (key.startsWith("elevation:")) {
      const direction = key.slice("elevation:".length) as SectionElevationKey;
      applyOrthoViewConfig(computeElevationViewConfig(direction, bounds));
    }
    updateDetailSliceOverlay();
    ctx.syncViewerTabs(ctx.getActiveViewerTab());
  };

  const refreshViewerTabs = () => {
    const sectionTabs = ctx.sections.map((section) => ({
      key: `section:${section.id}`,
      label: section.params.name,
      onClick: () => activateViewerTab(`section:${section.id}`)
    }));
    const elevationTabs = viewerElevations.map((item) => ({
      key: item.key,
      label: item.label,
      onClick: () => activateViewerTab(item.key)
    }));
    ctx.setExtraTabs([...sectionTabs, ...elevationTabs]);
    ctx.syncViewerTabs(ctx.getActiveViewerTab());
  };

  const isCustomOrthoView = () => ctx.getViewMode() === "2d" && ctx.getActiveViewerTab() !== "floorplan";

  const ensureFloorplanViewerTab = () => {
    if (ctx.getActiveViewerTab() !== "floorplan" || ctx.getViewMode() !== "2d") {
      activateViewerTab("floorplan");
    } else {
      ctx.view2d.checked = true;
      ctx.setView2d(true);
    }
  };

  const updateDetailViewCamera = () => {
    if (!isCustomOrthoView()) return;
    const bounds = getNavigationSceneBounds();
    const activeViewerTab = ctx.getActiveViewerTab();
    if (activeViewerTab.startsWith("section:")) {
      const sectionId = activeViewerTab.slice("section:".length);
      const section = ctx.sections.find((item) => item.id === sectionId) ?? null;
      if (section) applyOrthoViewConfig(computeSectionViewConfig(section.params, bounds));
      updateDetailSliceOverlay();
      return;
    }
    if (activeViewerTab.startsWith("elevation:")) {
      const direction = activeViewerTab.slice("elevation:".length) as SectionElevationKey;
      applyOrthoViewConfig(computeElevationViewConfig(direction, bounds));
    }
    updateDetailSliceOverlay();
  };

  return {
    get activeDetailClipPlanes() {
      return activeDetailClipPlanes;
    },
    set activeDetailClipPlanes(next: THREE.Plane[]) {
      activeDetailClipPlanes = next;
    },
    getNavigationSceneBounds,
    syncDetailClippingAndMaterials,
    updateDetailSliceOverlay,
    refreshViewerTabs,
    isCustomOrthoView,
    ensureFloorplanViewerTab,
    activateViewerTab,
    updateDetailViewCamera
  };
}
