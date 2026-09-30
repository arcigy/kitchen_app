import { customBoardProfilePolygons } from "./customBoardProfile";
import { contourEdgeEntities, edgeGroup, readEdgeBindings, type EdgeEntity } from "../core/edge-banding/edgeEntities";
import type { CustomFurnitureBoardParams } from "./customFurnitureTypes";
import { sanitizeCustomFurnitureProfile } from "./customFurnitureGeometry";
export function legacyCustomEdgeGroupId(materialId:string) { return `material-assignment:edge-legacy:${encodeURIComponent(materialId)}`; }
export type CustomBoardEdge = EdgeEntity & { profileEdgeIndexes: number[]; legacyMaterialId?:string };
export function customBoardEdges(board: CustomFurnitureBoardParams): CustomBoardEdge[] {
  const profile=sanitizeCustomFurnitureProfile(board.profile);
  if(profile.length<3)return [];
  const rings = board.cutouts?.length ? customBoardProfilePolygons(board).flat() : [profile];
  const edges=contourEdgeEntities(board.id,rings.flatMap(ring=>ring.map((a,i)=>{const b=ring[(i+1)%ring.length]!;return {a:{...a,z:0},b:{...b,z:0}};})), false);
  return edges.map(edge=>{
    const dx=edge.end.x-edge.start.x,dy=edge.end.y-edge.start.y;
    const contains=(p:{x:number;y:number})=>Math.abs(dx*(p.y-edge.start.y)-dy*(p.x-edge.start.x))<.01*edge.lengthMm
      && (p.x-edge.start.x)*dx+(p.y-edge.start.y)*dy>=-.01 && (p.x-edge.end.x)*dx+(p.y-edge.end.y)*dy<=.01;
    const profileEdgeIndexes=profile.flatMap((a,i)=>contains(a)&&contains(profile[(i+1)%profile.length]!)?[i]:[]);
    const bands=board.edgeBanding.filter(b=>profileEdgeIndexes.includes(b.edgeIndex));
    const legacyMaterialId=bands[0]?.materialId;
    return {...edge,partLabel:board.name,profileEdgeIndexes,legacyMaterialId,defaultGroupId:legacyMaterialId?legacyCustomEdgeGroupId(legacyMaterialId):null};
  });
}
export function customBoardBandedIndexes(board:CustomFurnitureBoardParams):number[] {
  const bindings=readEdgeBindings(board.edgeBandingOverrides);
  return customBoardEdges(board).filter(edge=>edgeGroup(edge,bindings)).flatMap(e=>e.profileEdgeIndexes);
}
