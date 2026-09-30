import * as THREE from "three";
import type { AppState } from "../appState";
import { getKitchenModuleRole } from "../kitchenModuleRules";
import { getKitchenWorktopSegmentPolygon } from "../worktopGeometry";
import type { BacksplashInput } from "./generator";

export function backsplashInputFromState(state: AppState, kitchenId: string): BacksplashInput | null {
  const kitchen=state.kitchenGroups.find(group=>group.id===kitchenId);
  if(!kitchen && state.activeKitchenGroupId!==kitchenId)return null;
  const context=state.activeKitchenGroupId===kitchenId&&state.kitchenEditMode?state.kitchenCtx:kitchen?.ctx??state.kitchenCtx;
  const openings=state.openingHistory?.capture();
  return {
    kitchenId,fallbackTopMm:context.upperStartHeightMm,
    walls:state.walls.map(wall=>({id:wall.id,params:structuredClone(wall.params)})),
    worktops:state.kitchenWorktops.filter(w=>w.kitchenGroupId===kitchenId).map(w=>({id:w.id,surfaceMm:w.params.heightMm,
      polygons:w.params.path.slice(1).map((_,i)=>getKitchenWorktopSegmentPolygon(w.params,i).map(p=>({x:p.x*1000,z:p.z*1000}))) })),
    cabinets:state.instances.filter(instance=>instance.kitchenGroupId===kitchenId).map(instance=>{
      instance.root.updateWorldMatrix(true,false);
      const box=instance.localBox;
      const width=Number(instance.params.width)||600, depth=Number(instance.params.depth)||600;
      const min=box&&!box.isEmpty()?box.min:new THREE.Vector3(-width/2000,0,-depth/2000);
      const max=box&&!box.isEmpty()?box.max:new THREE.Vector3(width/2000,0,depth/2000);
      return {id:instance.id,role:getKitchenModuleRole(instance.params),
        footprint:[[min.x,min.z],[max.x,min.z],[max.x,max.z],[min.x,max.z]].map(([x,z])=>{
          const point=new THREE.Vector3(x!,0,z!).applyMatrix4(instance.root.matrixWorld);return{x:point.x*1000,z:point.z*1000};
        }),bottomMm:new THREE.Vector3(0,min.y,0).applyMatrix4(instance.root.matrixWorld).y*1000,
        wallIds:[instance.kitchenPlacement?.wallId,instance.kitchenPlacement?.secondWallId].filter((id):id is string=>!!id)};
    }),
    openings:[...(openings?.windows??[]).map(item=>({id:item.id,wallId:item.params.wallId??item.params.wall,centerMm:item.params.centerMm,widthMm:item.params.widthMm,bottomMm:item.params.sillHeightMm,heightMm:item.params.heightMm})),
      ...(openings?.doors??[]).map(item=>({id:item.id,wallId:item.params.wallId??item.params.wall,centerMm:item.params.centerMm,widthMm:item.params.widthMm,bottomMm:0,heightMm:item.params.heightMm}))]
  };
}
