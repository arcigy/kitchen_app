import * as THREE from "three";
import type { ProjectPreview } from "../../core/project/project-types";

function vectorSnapshot(value: THREE.Vector3 | undefined): { x: number; y: number; z: number } | undefined {
  if (!value) return undefined;
  return {
    x: Number(value.x.toFixed(4)),
    y: Number(value.y.toFixed(4)),
    z: Number(value.z.toFixed(4))
  };
}

export function captureProjectPreview(args: {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  target?: THREE.Vector3;
  viewMode: "2d" | "3d";
}): ProjectPreview | undefined {
  const source = args.renderer.domElement;
  if (source.width < 8 || source.height < 8) return undefined;
  let renderTarget: THREE.WebGLRenderTarget | null = null;
  const previousTarget = args.renderer.getRenderTarget();
  try {
    const maxWidth = 640;
    const maxHeight = 360;
    const scale = Math.min(maxWidth / source.width, maxHeight / source.height, 1);
    const width = Math.max(160, Math.round(source.width * scale));
    const height = Math.max(90, Math.round(source.height * scale));
    renderTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      stencilBuffer: false
    });
    args.renderer.setRenderTarget(renderTarget);
    args.renderer.clear(true, true, true);
    args.renderer.render(args.scene, args.camera);
    const pixels = new Uint8Array(width * height * 4);
    args.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
    args.renderer.setRenderTarget(previousTarget);

    const flipped = new Uint8ClampedArray(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const sourceStart = (height - 1 - y) * rowSize;
      const targetStart = y * rowSize;
      flipped.set(pixels.subarray(sourceStart, sourceStart + rowSize), targetStart);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.putImageData(new ImageData(flipped, width, height), 0, 0);
    return {
      imageDataUrl: canvas.toDataURL("image/jpeg", 0.76),
      capturedAt: new Date().toISOString(),
      viewMode: args.viewMode,
      camera: {
        type: args.camera.type,
        position: vectorSnapshot(args.camera.position),
        target: vectorSnapshot(args.target)
      }
    };
  } catch {
    return undefined;
  } finally {
    args.renderer.setRenderTarget(previousTarget);
    renderTarget?.dispose();
  }
}
