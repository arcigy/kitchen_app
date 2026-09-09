import * as THREE from "three";
import { getResolvedTheme, type ResolvedTheme } from "../ui/theme/themeController";

const darkBackground = new THREE.Color("#101722");
const outputCaptures = new WeakMap<THREE.WebGLRenderer, (capture: () => void) => void>();

/**
 * Appearance exists only during the synchronous editor draw. Scene serialization,
 * preview capture and physical renderers always see the original project scene.
 * An explicit HDRI background wins over the editing background.
 */
export function withViewportAppearance<T>(scene: THREE.Scene, theme: ResolvedTheme, draw: () => T): T {
  const background = scene.background;
  const dark = theme === "dark" && background instanceof THREE.Color;
  if (dark) scene.background = darkBackground;
  try { return draw(); }
  finally {
    scene.background = background;
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
