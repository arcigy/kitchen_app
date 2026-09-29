import polygonClipping from "polygon-clipping";
import type { CustomFurnitureBoardParams, CustomFurnitureProfilePoint } from "./customFurnitureTypes";

type Point = [number, number];
/** The uncut outline remains the manufacturing blank; subtraction is shared by geometry and net quantities. */
export function customBoardProfilePolygons(board: Pick<CustomFurnitureBoardParams, "profile" | "cutouts">): CustomFurnitureProfilePoint[][][] {
  const ring = (points: CustomFurnitureProfilePoint[]): Point[] => points.map(p => [p.x, p.y]);
  if (board.profile.length < 3) return [];
  const holes = (board.cutouts ?? []).filter(cut => cut.profile.length >= 3);
  const result = holes.length ? polygonClipping.difference([ring(board.profile)], ...holes.map(cut => [ring(cut.profile)])) : [[ring(board.profile)]];
  return result.map(polygon => polygon.map(points => {
    const clean = points.map(([x, y]) => ({ x, y }));
    if (clean.length > 1 && clean[0]!.x === clean.at(-1)!.x && clean[0]!.y === clean.at(-1)!.y) clean.pop();
    return clean;
  }));
}
export function customBoardNetAreaMm2(board: Pick<CustomFurnitureBoardParams, "profile" | "cutouts">): number {
  const area = (ring: CustomFurnitureProfilePoint[]) => Math.abs(ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]!; return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
  return customBoardProfilePolygons(board).reduce((sum, rings) => sum + area(rings[0]!) - rings.slice(1).reduce((holes, ring) => holes + area(ring), 0), 0);
}
