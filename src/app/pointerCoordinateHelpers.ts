import * as THREE from "three";

export type PointerClientPointEvent = Pick<PointerEvent, "clientX" | "clientY">;
export type PointerClientRect = Pick<DOMRect, "left" | "top" | "width" | "height">;

export function pointerClientPointInRect(event: PointerClientPointEvent, rect: PointerClientRect): { x: number; y: number } {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

export function pointerNdcFromClientPoint(point: { x: number; y: number }, rect: PointerClientRect): THREE.Vector2 {
  return new THREE.Vector2((point.x / rect.width) * 2 - 1, -((point.y / rect.height) * 2 - 1));
}

export function setPointerNdcFromClientPoint(target: THREE.Vector2, point: { x: number; y: number }, rect: PointerClientRect): THREE.Vector2 {
  return target.set((point.x / rect.width) * 2 - 1, -((point.y / rect.height) * 2 - 1));
}

export function pointerNdcFromEvent(event: PointerClientPointEvent, rect: PointerClientRect): THREE.Vector2 {
  return pointerNdcFromClientPoint(pointerClientPointInRect(event, rect), rect);
}

export function setPointerNdcFromEvent(target: THREE.Vector2, event: PointerClientPointEvent, rect: PointerClientRect): THREE.Vector2 {
  return setPointerNdcFromClientPoint(target, pointerClientPointInRect(event, rect), rect);
}
