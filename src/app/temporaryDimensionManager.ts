import * as THREE from "three";
import {
  DimensionOverlay,
  type DimensionOffsetDirection,
  type DimensionPoint
} from "./dimensionOverlay";

export type TemporaryDimensionOverlayPort = Pick<
  DimensionOverlay,
  | "addDimension"
  | "addPlacedDimension"
  | "clearDimensions"
  | "setSize"
  | "setVisible"
  | "syncCamera"
  | "updateLines"
> & {
  unitScale: number;
};

export class TemporaryDimensionManager<Overlay extends TemporaryDimensionOverlayPort = TemporaryDimensionOverlayPort> {
  constructor(readonly overlay: Overlay) {}

  setUnitScale(unitScale: number) {
    this.overlay.unitScale = unitScale;
  }

  setSize(width: number, height: number) {
    this.overlay.setSize(width, height);
  }

  setVisible(visible: boolean) {
    this.overlay.setVisible(visible);
  }

  syncCamera(zoom: number, offsetX: number, offsetY: number) {
    this.overlay.syncCamera(zoom, offsetX, offsetY);
  }

  addOffsetDimension(start: DimensionPoint, end: DimensionPoint, offsetDirection: DimensionOffsetDirection) {
    this.overlay.addDimension(start, end, offsetDirection);
  }

  addPlacedDimension(
    start: DimensionPoint,
    end: DimensionPoint,
    extensionStart = start,
    extensionEnd = end
  ) {
    this.overlay.addPlacedDimension(start, end, extensionStart, extensionEnd);
  }

  clear() {
    this.overlay.clearDimensions();
  }

  render() {
    this.overlay.updateLines();
  }
}

export type TemporaryDimensionManagerPort = Pick<
  TemporaryDimensionManager,
  | "addOffsetDimension"
  | "addPlacedDimension"
  | "clear"
  | "render"
  | "setSize"
  | "setUnitScale"
  | "setVisible"
  | "syncCamera"
>;

export function createTemporaryDimensionManager(renderer: THREE.WebGLRenderer, camera?: THREE.Camera) {
  return new TemporaryDimensionManager(new DimensionOverlay(renderer, camera));
}
