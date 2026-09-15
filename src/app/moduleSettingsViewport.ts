import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { drawProjectedTechnicalDimension, TECHNICAL_DIMENSION_STYLE } from "./dimensionOverlay";
import type { ModuleParameterDimension } from "../modules/runtime/parameterDimensions";
import { t, translateParamLabel } from "../i18n";
import { placeModuleDimensionLabel, type ModuleDimensionLabelBox } from "./moduleSettingsLabelLayout";
import { projectModuleSettingsPoint } from "./moduleSettingsProjection";

export function createModuleSettingsViewport(host: HTMLElement, args: {
  onFocus: (key: string) => void;
  onEdit: (key: string, value: number) => boolean;
  labelFor: (key: string) => string;
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f5f6");
  scene.add(new THREE.HemisphereLight(0xffffff, 0x747e8b, 2.4));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(-3, 5, 4); scene.add(keyLight);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.dataset.moduleSettingsCanvas = "true";
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minZoom = 0.15; controls.maxZoom = 15;
  const canvas = document.createElement("canvas");
  canvas.className = "module-settings-dimensions";
  const context = canvas.getContext("2d");
  if (!context) { controls.dispose(); renderer.dispose(); throw new Error(t("3D preview could not be created.")); }
  const labels = document.createElement("div");
  labels.className = "module-settings-dimension-labels";
  host.append(renderer.domElement, canvas, labels);
  let root: THREE.Group | null = null;
  let dimensions: ModuleParameterDimension[] = [];
  let activeKey = "";
  let baseHeight = 2;
  let disposed = false;
  let frame = 0;
  const buttons = new Map<string, HTMLButtonElement>();
  let editor: { input: HTMLInputElement; dimension: ModuleParameterDimension } | null = null;
  const box = new THREE.Box3();

  const cancelEdit = (focus = false) => {
    if (!editor) return;
    const button = buttons.get(editor.dimension.id);
    const input = editor.input; editor = null; input.remove();
    if (button) { button.style.visibility = ""; if (focus) button.focus(); }
  };
  const commitEdit = () => {
    if (!editor) return true;
    const { input, dimension } = editor;
    const raw = input.value.trim().replace(",", ".");
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value) && args.onEdit(dimension.parameterKey, dimension.toParameterValue(value))) {
      cancelEdit(); buttons.get(dimension.id)?.focus(); return true;
    }
    input.setAttribute("aria-invalid", "true"); input.focus(); input.select(); return false;
  };

  const project = (point: THREE.Vector3, localReference = false) => projectModuleSettingsPoint(point, camera,
    { width: host.clientWidth, height: host.clientHeight }, localReference ? root : null);
  const render = () => {
    frame = 0;
    if (disposed || host.clientWidth < 1 || host.clientHeight < 1) return;
    renderer.render(scene, camera);
    const w = host.clientWidth; const h = host.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, w, h);
    const modelBounds = new THREE.Box2();
    if (root) {
      const bounds = new THREE.Box3().setFromObject(root);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const screen = project(new THREE.Vector3(x, y, z)); modelBounds.expandByPoint(new THREE.Vector2(screen.x, screen.y));
      }
    }
    const placed: ModuleDimensionLabelBox[] = [];
    dimensions.forEach((dimension, index) => {
      const button = buttons.get(dimension.id);
      if (!button) return;
      const a = project(new THREE.Vector3(...dimension.start), true);
      const b = project(new THREE.Vector3(...dimension.end), true);
      button.hidden = a.z < -1 || a.z > 1 || b.z < -1 || b.z > 1;
      if (button.hidden) return;
      const midpoint = new THREE.Vector3(...dimension.start).add(new THREE.Vector3(...dimension.end)).multiplyScalar(0.5);
      const offset = project(midpoint.clone().add(new THREE.Vector3(...dimension.offsetDirection).multiplyScalar(0.1)), true);
      const middle = project(midpoint, true);
      let dx = offset.x - middle.x; let dy = offset.y - middle.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) { dx = 0; dy = -1; } else { dx /= distance; dy /= distance; }
      const spacing = 30 + (index % 3) * 22;
      const start = { x: a.x + dx * spacing, y: a.y + dy * spacing };
      const end = { x: b.x + dx * spacing, y: b.y + dy * spacing };
      const width = Math.min(w - 12, Math.max(125, button.offsetWidth || 180));
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const desiredX = horizontal && !modelBounds.isEmpty() ? (dx < 0 ? modelBounds.min.x - width / 2 - 16 : modelBounds.max.x + width / 2 + 16) : (start.x + end.x) / 2;
      const desiredY = !horizontal && !modelBounds.isEmpty() ? (dy < 0 ? modelBounds.min.y - 24 : modelBounds.max.y + 24) : (start.y + end.y) / 2;
      const { x, y } = placeModuleDimensionLabel({ preferred: { x: desiredX, y: desiredY }, width,
        viewport: { width: w, height: h }, model: modelBounds.isEmpty() ? undefined : modelBounds, occupied: placed });
      placed.push({ x, y, width });
      button.style.left = `${x}px`; button.style.top = `${y}px`;
      if (editor?.dimension.id === dimension.id) {
        editor.input.style.left = `${x}px`; editor.input.style.top = `${y}px`;
      }
      button.style.maxWidth = `${w - 12}px`;
      button.classList.toggle("is-active", dimension.parameterKey === activeKey);
      drawProjectedTechnicalDimension(context, {
        start, end, extensionStart: a, extensionEnd: b, label: button.textContent ?? "",
        labelPosition: { x, y }, scale: 17 / TECHNICAL_DIMENSION_STYLE.font,
        selected: dimension.parameterKey === activeKey
      });
    });
  };
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(render); };
  const resize = () => {
    const w = Math.max(1, host.clientWidth); const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.left = -baseHeight * w / h / 2; camera.right = -camera.left;
    camera.top = baseHeight / 2; camera.bottom = -camera.top;
    camera.updateProjectionMatrix(); schedule();
  };
  const reset = () => {
    if (!root) return;
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3()).length();
    baseHeight = Math.max(0.3, extent * 1.35);
    camera.zoom = 1;
    const direction = new THREE.Vector3(root.userData.groundTruthPackageId ? -1 : 1, 0.8, 1.6).normalize();
    camera.position.copy(center).addScaledVector(direction, Math.max(2, extent * 2));
    controls.target.copy(center); controls.update(); resize();
  };
  const refreshLabels = () => {
    const restoreFocus = labels.contains(document.activeElement);
    cancelEdit();
    labels.replaceChildren(); buttons.clear();
    for (const dimension of dimensions) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "module-settings-dimension";
      button.dataset.dimensionParameter = dimension.parameterKey;
      const label = (args.labelFor(dimension.parameterKey) || translateParamLabel(dimension.parameterKey)).replace(/\s*\(mm\)\s*$/, "");
      const text = `${label} = ${Number(dimension.valueMm.toFixed(1))} mm`;
      button.textContent = text;
      button.title = dimension.reference ? t(dimension.reference) : t("Click to edit this dimension.");
      button.addEventListener("focus", () => { activeKey = dimension.parameterKey; args.onFocus(activeKey); schedule(); });
      button.addEventListener("click", () => {
        if (editor?.dimension.id === dimension.id) return;
        if (!commitEdit()) return;
        activeKey = dimension.parameterKey; args.onFocus(activeKey);
        const input = document.createElement("input");
        input.type = "text"; input.inputMode = "decimal"; input.value = String(Number(dimension.valueMm.toFixed(3)));
        input.setAttribute("aria-label", `${label} (mm)`);
        input.className = "module-settings-dimension-input";
        editor = { input, dimension }; labels.append(input); button.style.visibility = "hidden";
        input.addEventListener("keydown", (event) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelEdit(true); schedule(); }
          if (event.key === "Enter") {
            event.preventDefault(); event.stopPropagation();
            commitEdit();
          }
        });
        input.focus(); input.select(); schedule();
      });
      buttons.set(dimension.id, button); labels.appendChild(button);
    }
    if (restoreFocus) [...buttons.values()].find((button) => button.dataset.dimensionParameter === activeKey)?.focus();
  };
  controls.addEventListener("change", schedule);
  const observer = new ResizeObserver(resize); observer.observe(host);
  resize();
  return {
    reset,
    commitEdit,
    hasPendingEdit: () => editor !== null,
    setModel(next: THREE.Group, nextDimensions: ModuleParameterDimension[]) {
      if (root) root.removeFromParent();
      const first = !root;
      root = next; dimensions = nextDimensions; scene.add(root);
      refreshLabels(); if (first) reset(); else schedule();
    },
    setActiveParameter(key: string) { activeKey = key; schedule(); },
    dispose() {
      cancelEdit();
      disposed = true; if (frame) cancelAnimationFrame(frame);
      observer.disconnect(); controls.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.remove(); labels.remove(); renderer.domElement.remove();
      root?.removeFromParent();
    }
  };
}
