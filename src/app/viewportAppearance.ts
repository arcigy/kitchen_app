import * as THREE from "three";
import { getResolvedTheme, type ResolvedTheme } from "../ui/theme/themeController";

const darkBackground = new THREE.Color("#101722");
const darkLine = new THREE.Color("#d4dfed");
type TechnicalMaterial = THREE.LineBasicMaterial;
const technicalMaterials = new WeakMap<THREE.Scene, Map<TechnicalMaterial, { color: THREE.Color; opacity: number }>>();
const outputCaptures = new WeakMap<THREE.WebGLRenderer, (capture: () => void) => void>();

export function registerTechnicalMaterial(scene: THREE.Scene, material: TechnicalMaterial): void {
  let materials = technicalMaterials.get(scene);
  if (!materials) technicalMaterials.set(scene, materials = new Map());
  if (!materials.has(material)) materials.set(material, { color: material.color.clone(), opacity: material.opacity });
}

export function unregisterTechnicalMaterial(scene: THREE.Scene, material: TechnicalMaterial): void {
  technicalMaterials.get(scene)?.delete(material);
}

/**
 * Appearance exists only during the synchronous editor draw. Scene serialization,
 * preview capture and physical renderers always see the original project scene.
 * An explicit HDRI background wins over the editing background.
 */
export function withViewportAppearance<T>(scene: THREE.Scene, theme: ResolvedTheme, draw: () => T): T {
  const background = scene.background;
  const dark = theme === "dark" && background instanceof THREE.Color;
  const materials = dark ? technicalMaterials.get(scene) : undefined;
  if (dark) scene.background = darkBackground;
  materials?.forEach((saved, material) => {
    saved.color.copy(material.color);
    saved.opacity = material.opacity;
    material.color.copy(darkLine);
    material.opacity = Math.max(0.8, material.opacity);
  });
  try { return draw(); }
  finally {
    scene.background = background;
    materials?.forEach((saved, material) => {
      material.color.copy(saved.color);
      material.opacity = saved.opacity;
    });
  }
}

export function renderEditorViewport(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
  const draw = () => { withViewportAppearance(scene, getResolvedTheme(), () => renderer.render(scene, camera)); };
  outputCaptures.set(renderer, (capture) => {
    try {
      renderer.render(scene, camera);
      capture();
    } finally {
      draw();
    }
  });
  draw();
}

/** Physical photo/SSGI modes already use the project presentation. */
export function useProjectViewportAppearance(renderer: THREE.WebGLRenderer): void {
  outputCaptures.delete(renderer);
}

export function captureViewportOutput(renderer: THREE.WebGLRenderer, capture: () => void): void {
  const outputCapture = outputCaptures.get(renderer);
  if (outputCapture) outputCapture(capture);
  else capture();
}

const technicalColors = {
  dark: { line: "#d4dfed", active: "#78b6ff" },
  light: { line: "#333333", active: "#1769d2" }
} as const;
export function getTechnicalColors(theme = getResolvedTheme()) { return technicalColors[theme]; }
