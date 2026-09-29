import polygonClipping from "polygon-clipping";
import type { BacksplashGroupSource, BacksplashAutomaticField, CustomFurnitureBoardParams, CustomFurnitureParams, CustomFurniturePlanPoint as Point } from "../customFurnitureTypes";
import type { WallParams } from "../appState";
import { offsetsM } from "../../walls2d/model";

type Interval = { start: number; end: number };
export type BacksplashInput = {
  kitchenId: string; fallbackTopMm: number;
  walls: Array<{ id: string; params: WallParams }>;
  worktops: Array<{ id: string; surfaceMm: number; polygons: Point[][] }>;
  cabinets: Array<{ id: string; role: "base" | "upper" | "tall"; footprint: Point[]; bottomMm: number; wallIds: string[] }>;
  openings: Array<{ id: string; wallId: string; centerMm: number; widthMm: number; bottomMm: number; heightMm: number }>;
};
export const automaticFields: BacksplashAutomaticField[] = ["profile", "workplane", "thicknessMm", "materialId", "cutouts", "baseOffsetMm", "topOffsetMm"];
const EPS = 0.1;
const round = (x: number) => Math.round(x * 1000) / 1000;
const rect = (x: number, y: number, width: number, height: number) => [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
function merge(intervals: Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const item of intervals.sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && item.start <= last.end + EPS) last.end = Math.max(last.end, item.end);
    else result.push({ ...item });
  }
  return result;
}
function subtract(intervals: Interval[], remove: Interval): Interval[] {
  return intervals.flatMap(item => remove.end <= item.start || remove.start >= item.end ? [item] : [
    ...(remove.start > item.start ? [{ start: item.start, end: remove.start }] : []),
    ...(remove.end < item.end ? [{ start: remove.end, end: item.end }] : [])
  ]);
}
function jointsFor(span: Interval, boundaries: number[], source: BacksplashGroupSource, key: string): number[] {
  const custom = source.joints[key];
  if (custom) return [...new Set(custom.filter(x => x > span.start && x < span.end))].sort((a,b) => a-b);
  const result: number[] = [];
  let start = span.start;
  const maximum = Math.max(100, source.maxLengthMm);
  while (span.end - start > maximum + EPS) {
    const candidates = boundaries.filter(x => x > start + maximum * 0.4 && x <= start + maximum);
    start = candidates.length ? Math.max(...candidates) : start + maximum;
    result.push(round(start));
  }
  return result;
}

/** Pure wall-local construction. Only contiguous worktop coverage supported by base cabinets is eligible. */
export function generateBacksplash(input: BacksplashInput, source: BacksplashGroupSource, thicknessOverrides: ReadonlyMap<string, number> = new Map()): CustomFurnitureBoardParams[] {
  const boards: CustomFurnitureBoardParams[] = [];
  for (const [wallIndex, wall] of [...input.walls].sort((a,b) => a.id.localeCompare(b.id)).entries()) {
    if (!source.wallIds.includes(wall.id)) continue;
    const { aMm: a, bMm: b } = wall.params;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1) continue;
    const dir = { x: (b.x-a.x)/length, z: (b.z-a.z)/length };
    const normal = { x: -dir.z, z: dir.x };
    const project = (p: Point): [number, number] => [(p.x-a.x)*dir.x+(p.z-a.z)*dir.z, (p.x-a.x)*normal.x+(p.z-a.z)*normal.z];
    const offsets = offsetsM({ thicknessM: wall.params.thicknessMm, justification: wall.params.justification ?? "center", exteriorSign: wall.params.exteriorSign ?? 1 });
    for (const side of [1, -1] as const) {
      const faceOffset = side === 1 ? offsets.left : offsets.right;
      const key = `${wall.id}:${side}`;
      const cabinets = input.cabinets.flatMap(cabinet => {
        const points = cabinet.footprint.map(project);
        const normals = points.map(p => (p[1]-faceOffset)*side);
        if (!points.length || Math.max(...normals) < 1 || Math.min(...normals) > 100 || Math.min(...normals) < -150) return [];
        return [{ ...cabinet, start: Math.max(0, Math.min(...points.map(p=>p[0]))), end: Math.min(length, Math.max(...points.map(p=>p[0]))) }];
      });
      for (const worktop of [...input.worktops].sort((a,b) => a.id.localeCompare(b.id))) {
        const intervals: Interval[] = [];
        for (const polygon of worktop.polygons) {
          const points = polygon.map(project);
          const y = faceOffset + side * 75;
          const clipped = polygonClipping.intersection([points], [[[0, Math.min(faceOffset, y)], [length, Math.min(faceOffset,y)], [length, Math.max(faceOffset,y)], [0, Math.max(faceOffset,y)]]]);
          for (const rings of clipped) {
            const xs = rings[0]!.map(p=>p[0]);
            if (xs.length) intervals.push({ start: Math.max(0,Math.min(...xs)), end: Math.min(length, Math.max(...xs)) });
          }
        }
        let spans = merge(intervals).filter(span => cabinets.some(c => c.role === "base" && c.start < span.end-EPS && c.end > span.start+EPS));
        for (const cabinet of cabinets.filter(c=>c.role === "tall")) spans = subtract(spans, cabinet);
        spans = spans.filter(span => cabinets.some(c => c.role === "base" && c.start < span.end-EPS && c.end > span.start+EPS));
        for (const [spanIndex, span] of spans.entries()) {
          const joints = jointsFor(span, cabinets.flatMap(c=>[c.start,c.end]), source, key);
          const cuts = [span.start, ...joints, span.end];
          for (let i=0; i<cuts.length-1; i++) {
            const start=cuts[i]!, end=cuts[i+1]!;
            if (end-start < 1) continue;
            const upper = cabinets.filter(c=>c.role === "upper" && c.start < end && c.end > start);
            const steps=[...new Set([start,end,...upper.flatMap(c=>[Math.max(start,c.start),Math.min(end,c.end)])])].sort((a,b)=>a-b);
            const topPoints: Array<{x:number;y:number}> = [];
            for (let k=0;k<steps.length-1;k++) {
              const x=steps[k]!, next=steps[k+1]!, middle=(x+next)/2;
              const covering=upper.filter(c=>c.start<=middle&&c.end>=middle);
              const top=covering.length ? Math.min(...covering.map(c=>c.bottomMm)) : input.fallbackTopMm;
              if (top <= worktop.surfaceMm) continue;
              topPoints.push({x:next,y:top},{x,y:top});
            }
            if (!topPoints.length) continue;
            // Union height rectangles permits a step and disconnected spans when an upper reaches the worktop.
            const polygons = topPoints.reduce<Array<Array<Array<[number,number]>>>>((result, _, k) => {
              if(k%2) return result;
              const right=topPoints[k]!, left=topPoints[k+1]!;
              return polygonClipping.union(result, [rect(left.x, worktop.surfaceMm, right.x-left.x, left.y-worktop.surfaceMm).map(p=>[p.x,p.y] as [number,number])]);
            }, []);
            for (const [pieceIndex, polygon] of polygons.entries()) {
              const sourceKey=`${key}:${worktop.id}:${spanIndex}:${i}:${pieceIndex}`;
              const profile=polygon[0]!.slice(0,-1).map(([x,y])=>({x:Math.round(x),y:Math.round(y)}));
              const offset=faceOffset+side*source.offsetMm;
              const cutouts=input.openings.filter(o=>o.wallId===wall.id && o.centerMm+o.widthMm/2>start && o.centerMm-o.widthMm/2<end && o.bottomMm<Math.max(...profile.map(p=>p.y)) && o.bottomMm+o.heightMm>worktop.surfaceMm).map(o=>({ id:`opening:${o.id}`, sourceOpeningId:o.id, profile:rect(o.centerMm-o.widthMm/2,o.bottomMm,o.widthMm,o.heightMm) }));
              boards.push({ id:`backsplash:${sourceKey}`, name:`Zástena · stena ${wallIndex+1} · dielec ${spanIndex+1}.${i+1}${pieceIndex ? `.${pieceIndex+1}` : ""}`, kind:"vertical",
                workplane:{type:"vertical",aMm:{x:round(a.x+normal.x*offset),z:round(a.z+normal.z*offset)},bMm:{x:round(b.x+normal.x*offset),z:round(b.z+normal.z*offset)},mirrored:side<0},
                profile,cutouts,materialId:source.materialId,thicknessMm:source.thicknessMm,baseConstraint:"absolute",baseOffsetMm:worktop.surfaceMm,
                topConstraint:"absolute",topOffsetMm:Math.max(...profile.map(p=>p.y)),justification:"positive",edgeBanding:[],
                backsplashSource:{key:sourceKey,wallId:wall.id,worktopId:worktop.id,automatic:{},overrides:[]} });
            }
          }
        }
      }
    }
  }
  applyButtCorners(boards, thicknessOverrides);
  for(const board of boards) for(const field of automaticFields) Object.assign(board.backsplashSource!.automatic,{[field]:structuredClone(board[field])});
  return boards;
}

function applyButtCorners(boards: CustomFurnitureBoardParams[], thicknessOverrides: ReadonlyMap<string, number>) {
  for(let i=0;i<boards.length;i++) for(let j=i+1;j<boards.length;j++) {
    const a=boards[i]!,b=boards[j]!, aw=a.workplane,bw=b.workplane;
    if(aw.type!=="vertical"||bw.type!=="vertical"||a.backsplashSource!.wallId===b.backsplashSource!.wallId)continue;
    const direction=(w:typeof aw)=>{const l=Math.hypot(w.bMm.x-w.aMm.x,w.bMm.z-w.aMm.z);return{x:(w.bMm.x-w.aMm.x)/l,z:(w.bMm.z-w.aMm.z)/l};};
    const u=direction(aw),v=direction(bw),cross=u.x*v.z-u.z*v.x;
    if(Math.abs(cross)<0.01)continue;
    const delta={x:bw.aMm.x-aw.aMm.x,z:bw.aMm.z-aw.aMm.z};
    const ta=(delta.x*v.z-delta.z*v.x)/cross,tb=(delta.x*u.z-delta.z*u.x)/cross;
    const near=(board:CustomFurnitureBoardParams,t:number)=>Math.min(Math.abs(Math.min(...board.profile.map(p=>p.x))-t),Math.abs(Math.max(...board.profile.map(p=>p.x))-t))<120;
    if(!near(a,ta)||!near(b,tb))continue;
    // First wall continues to the intersection; the following wall butts against its front face.
    const thickness = thicknessOverrides.get(a.backsplashSource!.key) ?? a.thicknessMm;
    for(const [board,t,trim] of [[a,ta,0],[b,tb,thickness/Math.abs(cross)]] as const) {
      const xs=board.profile.map(p=>p.x),min=Math.min(...xs),max=Math.max(...xs),start=Math.abs(min-t)<Math.abs(max-t);
      const old=start?min:max, next=t+(start?trim:-trim);
      if(next>max-1&&start||next<min+1&&!start)continue;
      board.profile=board.profile.map(p=>Math.abs(p.x-old)<EPS?{...p,x:Math.round(next)}:p);
    }
  }
}

export function synchronizeBacksplash(params: CustomFurnitureParams, input: BacksplashInput | null): boolean {
  const source=params.backsplash;
  if(!source)return false;
  const before=JSON.stringify(params);
  if(!input){source.detached=true;return before!==JSON.stringify(params);}
  source.detached=false;
  if(source.scope==="all") source.wallIds=[...new Set([...source.wallIds,...input.walls.map(w=>w.id)])];
  source.orphanedWallIds=source.wallIds.filter(id=>!input.walls.some(w=>w.id===id));
  const thicknessOverrides = new Map(params.boards.filter(b=>b.backsplashSource && (b.backsplashSource.overrides.includes("thicknessMm") || b.thicknessMm !== b.backsplashSource.automatic.thicknessMm)).map(b=>[b.backsplashSource!.key,b.thicknessMm]));
  const generated=generateBacksplash(input,source,thicknessOverrides), old=new Map(params.boards.filter(b=>b.backsplashSource).map(b=>[b.backsplashSource!.key,b]));
  const next:CustomFurnitureBoardParams[]=[];
  for(const automatic of generated){
    const key=automatic.backsplashSource!.key;
    if(source.suppressedKeys.includes(key))continue;
    const current=old.get(key); old.delete(key);
    if(!current){next.push(automatic);continue;}
    const previous=current.backsplashSource!;
    const oldCuts=previous.automatic.cutouts??[], currentCuts=current.cutouts??[];
    const suppressed=new Set(previous.suppressedOpeningIds??[]);
    for(const cut of oldCuts)if(cut.sourceOpeningId&&!currentCuts.some(c=>c.sourceOpeningId===cut.sourceOpeningId))suppressed.add(cut.sourceOpeningId);
    previous.suppressedOpeningIds=[...suppressed];
    current.cutouts=[...(automatic.cutouts??[]).filter(c=>!suppressed.has(c.sourceOpeningId!)).map(c=>{
      const old=oldCuts.find(p=>p.sourceOpeningId===c.sourceOpeningId),custom=currentCuts.find(p=>p.sourceOpeningId===c.sourceOpeningId);
      return old&&custom&&JSON.stringify(old)!==JSON.stringify(custom)?custom:c;
    }),...currentCuts.filter(c=>!c.sourceOpeningId)];
    if((suppressed.size||currentCuts.some(c=>!c.sourceOpeningId))&&!previous.overrides.includes("cutouts"))previous.overrides.push("cutouts");
    for(const field of automaticFields){
      if(field==="cutouts")continue;
      if(JSON.stringify(current[field])!==JSON.stringify(previous.automatic[field])&&!previous.overrides.includes(field))previous.overrides.push(field);
      if(!previous.overrides.includes(field))Object.assign(current,{[field]:structuredClone(automatic[field])});
    }
    previous.automatic=automatic.backsplashSource!.automatic;
    next.push(current);
  }
  for(const current of old.values()) {
    const sourceMissing=source.orphanedWallIds.includes(current.backsplashSource!.wallId)||!input.worktops.some(w=>w.id===current.backsplashSource!.worktopId);
    if(sourceMissing) source.detached=true;
    if(sourceMissing||current.backsplashSource!.overrides.length)next.push(current);
  }
  params.boards=[...next,...params.boards.filter(b=>!b.backsplashSource)];
  return before!==JSON.stringify(params);
}
export function resetBacksplashBoard(board:CustomFurnitureBoardParams, field?:BacksplashAutomaticField) {
  const source=board.backsplashSource;if(!source)return;
  for(const key of field?[field]:automaticFields)Object.assign(board,{[key]:structuredClone(source.automatic[key])});
  if(!field||field==="cutouts")source.suppressedOpeningIds=[];
  source.overrides=field?source.overrides.filter(key=>key!==field):[];
}
