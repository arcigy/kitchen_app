import * as THREE from "three";

export type VisibilityTarget = {
  key: string;
  root: THREE.Object3D | THREE.Object3D[];
};

export type VisibilitySaveState = {
  hiddenKeys: string[];
  showHidden: boolean;
};

type MaterialState = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  color?: THREE.Color;
};

const HIDDEN_PREVIEW_OPACITY = 0.22;
const HIDDEN_PREVIEW_COLOR = 0xff00c8;

function eachMaterial(material: THREE.Material | THREE.Material[] | undefined, fn: (material: THREE.Material) => void) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const item of material) fn(item);
    return;
  }
  fn(material);
}

function hasColor(material: THREE.Material): material is THREE.Material & { color: THREE.Color } {
  return "color" in material && (material as { color?: unknown }).color instanceof THREE.Color;
}

export function createVisibilityController(args: {
  getAllTargets: () => VisibilityTarget[];
  getSelectedTargetKeys: () => string[];
  onChanged: () => void;
  recordActivity?: (label: string) => void;
}) {
  const hiddenKeys = new Set<string>();
  const materialStates = new WeakMap<THREE.Material, MaterialState>();
  let showHidden = false;

  const restoreMaterial = (material: THREE.Material) => {
    const state = materialStates.get(material);
    if (!state) return;
    material.transparent = state.transparent;
    material.opacity = state.opacity;
    material.depthWrite = state.depthWrite;
    if (state.color && hasColor(material)) material.color.copy(state.color);
    material.needsUpdate = true;
  };

  const applyHiddenPreviewMaterial = (material: THREE.Material) => {
    if (!materialStates.has(material)) {
      materialStates.set(material, {
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        color: hasColor(material) ? material.color.clone() : undefined
      });
    }
    if (material.opacity <= 0) return;
    material.transparent = true;
    material.opacity = Math.min(material.opacity, HIDDEN_PREVIEW_OPACITY);
    material.depthWrite = false;
    if (hasColor(material)) material.color.setHex(HIDDEN_PREVIEW_COLOR);
    material.needsUpdate = true;
  };

  const forTargetRoot = (target: VisibilityTarget, fn: (root: THREE.Object3D) => void) => {
    const roots = Array.isArray(target.root) ? target.root : [target.root];
    for (const root of roots) fn(root);
  };

  const applyTargetPreview = (target: VisibilityTarget, hidden: boolean) => {
    forTargetRoot(target, (root) => {
      root.traverse((object) => {
        object.userData.visibilityTargetKey = target.key;
        object.userData.visibilityHidden = hidden;
        object.userData.visibilityHiddenPreview = hidden && showHidden;
        const material = (object as THREE.Mesh | THREE.Line | THREE.Points).material;
        eachMaterial(material, hidden && showHidden ? applyHiddenPreviewMaterial : restoreMaterial);
      });
    });
  };

  const sync = () => {
    const targets = args.getAllTargets();
    const existing = new Set(targets.map((target) => target.key));
    for (const key of Array.from(hiddenKeys)) {
      if (!existing.has(key)) hiddenKeys.delete(key);
    }

    for (const target of targets) {
      const hidden = hiddenKeys.has(target.key);
      forTargetRoot(target, (root) => {
        root.visible = !hidden || showHidden;
      });
      applyTargetPreview(target, hidden);
    }
  };

  const getSelectedKeys = () => args.getSelectedTargetKeys().filter((key) => args.getAllTargets().some((target) => target.key === key));
  const selectedHasHidden = () => getSelectedKeys().some((key) => hiddenKeys.has(key));
  const isKeyPickable = (key: string | null | undefined) => !key || !hiddenKeys.has(key) || showHidden;
  const isObjectPickable = (object: THREE.Object3D | null | undefined) => {
    let current: THREE.Object3D | null | undefined = object;
    while (current) {
      const key = current.userData?.visibilityTargetKey as string | undefined;
      if (key) return isKeyPickable(key);
      current = current.parent;
    }
    return true;
  };

  const notify = (label?: string) => {
    sync();
    args.onChanged();
    if (label) args.recordActivity?.(label);
  };

  return {
    get showHidden() {
      return showHidden;
    },
    get hiddenCount() {
      return hiddenKeys.size;
    },
    hasHiddenObjects: () => hiddenKeys.size > 0,
    hasSelection: () => getSelectedKeys().length > 0,
    selectedHasHidden,
    isKeyPickable,
    isObjectPickable,
    setShowHidden(next: boolean) {
      showHidden = next;
      notify(showHidden ? "Hidden objects shown" : "Hidden objects hidden");
    },
    toggleShowHidden() {
      showHidden = !showHidden;
      notify(showHidden ? "Hidden objects shown" : "Hidden objects hidden");
    },
    hideSelected() {
      const keys = getSelectedKeys();
      for (const key of keys) hiddenKeys.add(key);
      notify(keys.length > 1 ? `${keys.length} objects hidden` : "Object hidden");
    },
    unhideSelected() {
      const keys = getSelectedKeys();
      for (const key of keys) hiddenKeys.delete(key);
      notify(keys.length > 1 ? `${keys.length} objects shown` : "Object shown");
    },
    isolateSelected() {
      const selected = new Set(getSelectedKeys());
      if (selected.size === 0) return;
      for (const target of args.getAllTargets()) {
        if (selected.has(target.key)) hiddenKeys.delete(target.key);
        else hiddenKeys.add(target.key);
      }
      notify(selected.size > 1 ? `${selected.size} objects isolated` : "Object isolated");
    },
    unhideAll() {
      hiddenKeys.clear();
      showHidden = false;
      notify("All objects shown");
    },
    sync,
    getSaveState(): VisibilitySaveState {
      return {
        hiddenKeys: Array.from(hiddenKeys),
        showHidden
      };
    },
    restoreSaveState(state: unknown) {
      const saved = state as Partial<VisibilitySaveState> | null | undefined;
      hiddenKeys.clear();
      if (Array.isArray(saved?.hiddenKeys)) {
        for (const key of saved.hiddenKeys) {
          if (typeof key === "string" && key.trim()) hiddenKeys.add(key);
        }
      }
      showHidden = saved?.showHidden === true;
      sync();
      args.onChanged();
    }
  };
}
