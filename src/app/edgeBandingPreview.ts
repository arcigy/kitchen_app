import { Group, Mesh, Vector3 } from "three";
import type { EdgeEntity } from "../core/edge-banding/edgeEntities";
import type { FwmFurnitureParams } from "../modules/fwmFurniture/types";
import { measurePanel } from "../modules/fwmFurniture/panelMeasurement";
import { manufacturingEdges } from "../modules/fwmFurniture/manufacturingEdges";
export type PreviewEdge = EdgeEntity & {
  worldStart: Vector3;
  worldEnd: Vector3;
  /** Ordered corners of the complete narrow side face, including panel thickness. */
  worldFace: readonly [Vector3, Vector3, Vector3, Vector3];
};
export function previewEdgeFace(edge: EdgeEntity, thicknessOffset: EdgeEntity["start"], toWorld: (point: EdgeEntity["start"]) => Vector3): PreviewEdge {
  const offset = (point: EdgeEntity["start"]) => ({ x: point.x + thicknessOffset.x, y: point.y + thicknessOffset.y, z: point.z + thicknessOffset.z });
  const worldStart = toWorld(edge.start), worldEnd = toWorld(edge.end);
  return { ...edge, worldStart, worldEnd, worldFace: [worldStart, worldEnd, toWorld(offset(edge.end)), toWorld(offset(edge.start))] };
}
export function modulePreviewEdges(root: Group, params: FwmFurnitureParams): PreviewEdge[] {
  root.updateMatrixWorld(true); const edges: PreviewEdge[]=[];
  root.traverse(object=>{
    if(!(object instanceof Mesh)) return;
    const group=String(object.userData.materialGroup ?? "");
    if(!["corpus","front","back","drawer_bottom","plinth"].includes(group)) return;
    const name=String(object.userData.boardName ?? object.name);
    const role=group === "corpus" ? /shelf/.test(name) ? "shelf" : "body" : group;
    const nominal=Number(role === "front" ? params.frontThicknessMm : role === "back" ? params.backThickness : role === "drawer_bottom" ? params.drawerBottomThickness : role === "shelf" ? params.shelfThickness : params.boardThickness);
    const panel=measurePanel(object,nominal);
    for(const edge of manufacturingEdges(object,role,panel,params)) {
      const point=(p:EdgeEntity["start"])=>object.localToWorld(new Vector3(p.x,p.y,p.z).multiplyScalar(.001).divide(object.scale));
      edges.push(previewEdgeFace(edge,panel.thicknessOffset,point));
    }
  });
  return edges;
}
export type EdgePreviewState = {
  edges: readonly PreviewEdge[];
  selected: ReadonlySet<string>;
  color: (edge: EdgeEntity) => string;
  onPick: (id: string, multiple: boolean) => void;
};
type ScreenPoint = { x: number; y: number; z: number };
type ProjectedFace = { edge: PreviewEdge; points: ScreenPoint[]; depth: number };

export function projectEdgeFaces(edges: readonly PreviewEdge[], project: (point: Vector3) => ScreenPoint): ProjectedFace[] {
  return edges.flatMap(edge => {
    const points = edge.worldFace.map(project);
    if (points.some(p => ![p.x, p.y, p.z].every(Number.isFinite)) || points.every(p => p.z < -1) || points.every(p => p.z > 1)) return [];
    return [{ edge, points, depth: points.reduce((sum, p) => sum + p.z, 0) / points.length }];
  });
}

function triangleDepth(point: { x: number; y: number }, a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): number | null {
  const determinant = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(determinant) < 1e-8) return null;
  const u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / determinant;
  const v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / determinant;
  const w = 1 - u - v;
  return Math.min(u, v, w) >= -1e-8 ? u * a.z + v * b.z + w * c.z : null;
}

/** Hit the filled face first. A small border tolerance keeps edge-on faces usable. */
export function pickEdgeFace(faces: readonly ProjectedFace[], point: { x: number; y: number }): PreviewEdge | null {
  const hits = faces.flatMap(({ edge, points, depth }) => {
    const insideDepth = triangleDepth(point, points[0]!, points[1]!, points[2]!)
      ?? triangleDepth(point, points[0]!, points[2]!, points[3]!);
    if (insideDepth !== null) return [{ edge, distance: 0, depth: insideDepth }];
    const distance = Math.min(...points.map((a, i) => {
      const b = points[(i + 1) % points.length]!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
    }));
    return distance <= 4 ? [{ edge, distance, depth }] : [];
  });
  hits.sort((a, b) => a.distance - b.distance || a.depth - b.depth || a.edge.id.localeCompare(b.edge.id));
  return hits[0]?.edge ?? null;
}

export function createEdgePreviewOverlay(canvas: HTMLCanvasElement, project: (point: Vector3)=>{x:number;y:number;z:number}) {
  let state: EdgePreviewState | null=null;
  let down:{x:number;y:number}|null=null;
  const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
  const pointerCancel=()=>{down=null;};
  const pointerUp=(e:PointerEvent)=>{
    const start=down; down=null;
    if(!state || !start || Math.hypot(e.clientX-start.x,e.clientY-start.y)>5 || e.button!==0) return;
    const rect=canvas.getBoundingClientRect();
    const hit=pickEdgeFace(projectEdgeFaces(state.edges,project),{x:e.clientX-rect.left,y:e.clientY-rect.top});
    if(hit) state.onPick(hit.id,e.ctrlKey||e.metaKey||e.shiftKey);
  };
  canvas.addEventListener("pointerdown",pointerDown);canvas.addEventListener("pointerup",pointerUp);canvas.addEventListener("pointercancel",pointerCancel);
  return {
    set(next:EdgePreviewState|null){state=next;},
    active:()=>state!==null,
    draw(ctx:CanvasRenderingContext2D){
      if(!state) return;
      ctx.save();
      const faces=projectEdgeFaces(state.edges,project).sort((a,b)=>Number(state!.selected.has(a.edge.id))-Number(state!.selected.has(b.edge.id)) || b.depth-a.depth);
      for(const {edge,points} of faces) {
        ctx.beginPath();ctx.moveTo(points[0]!.x,points[0]!.y);
        for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
        ctx.closePath();
        const selected=state.selected.has(edge.id),color=selected?"#f97316":state.color(edge);
        ctx.fillStyle=color;ctx.globalAlpha=selected?.85:.55;ctx.fill();
        ctx.strokeStyle=color;ctx.globalAlpha=1;ctx.lineWidth=selected?1.75:1;ctx.stroke();
      }
      ctx.restore();
    },
    dispose(){canvas.removeEventListener("pointerdown",pointerDown);canvas.removeEventListener("pointerup",pointerUp);canvas.removeEventListener("pointercancel",pointerCancel);}
  };
}
