import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { CustomFurnitureInstance, CustomFurnitureParams, BacksplashGroupSource } from "../layout/customFurnitureTypes";
import { backsplashInputFromState } from "../layout/backsplash/stateInput";
import { synchronizeBacksplash } from "../layout/backsplash/generator";
import { captureBacksplashMaterialSnapshots } from "../layout/backsplash/materialSnapshots";
import { registerDerivedLayout } from "../layout/derivedLayout";
import { openBacksplashDialog } from "./backsplashDialog";

export function createBacksplashController(args:{state:AppState;catalog:ClientCatalog;canvas:HTMLCanvasElement;getCamera:()=>THREE.Camera;
  create:(params:CustomFurnitureParams,opts?:{skipHistory?:boolean})=>CustomFurnitureInstance;rebuild:(f:CustomFurnitureInstance)=>void;edit:(id:string)=>void;
  finishKitchenEditing?:()=>void;commit:()=>void;status:(text:string)=>void;ensureLayout:()=>void}){
  const sync=()=>{
    for(const furniture of args.state.customFurniture){const source=furniture.params.backsplash;if(!source)continue;
      captureBacksplashMaterialSnapshots(furniture.params,args.catalog);
      if(synchronizeBacksplash(furniture.params,backsplashInputFromState(args.state,source.kitchenId)))args.rebuild(furniture);
      captureBacksplashMaterialSnapshots(furniture.params,args.catalog);
    }
  };
  registerDerivedLayout(args.state,sync);
  const preview=(kitchenId:string,wallId?:string,existingId?:string)=>{
    const input=backsplashInputFromState(args.state,kitchenId);if(!input){args.status("Najprv vyberte kuchyňu.");return;}
    const existing=args.state.customFurniture.find(f=>existingId?f.id===existingId:f.params.backsplash?.kitchenId===kitchenId);
    const assigned=args.state.projectMaterialAssignments.assignments.find(a=>a.category==="backsplash"&&a.assignmentId === "material-assignment:backsplash")?.snapshots.material?.definition;
    const source:BacksplashGroupSource=existing?.params.backsplash?structuredClone(existing.params.backsplash):{
      scope:wallId?"walls":"all",kitchenId,wallIds:[],materialId:assigned?.id??"",thicknessMm:assigned?.defaultThicknessMm??18,offsetMm:0,kerfMm:3,allowHalf:true,grain:"length",maxLengthMm:Number(assigned?.metadata?.supplierLengthMm)||2800,joints:{},suppressedKeys:[],orphanedWallIds:[]
    };
    if(!existingId&&!wallId)source.scope="all";
    if(!existingId)source.wallIds=[...new Set([...source.wallIds,...(wallId?[wallId]:input.walls.map(w=>w.id))])];
    const params:CustomFurnitureParams=existing?structuredClone(existing.params):{name:"Zástena",groupKind:"backsplash",baseConstraint:"absolute",baseOffsetMm:0,topConstraint:"absolute",topOffsetMm:input.fallbackTopMm,boundary:[],boards:[]};
    params.backsplash=source;
    openBacksplashDialog({catalog:args.catalog,input,params,commit:draft=>{
      if(args.state.kitchenEditMode)args.finishKitchenEditing?.();
      if(!draft.boundary.length){const points=draft.boards.flatMap(b=>b.workplane.type==="vertical"?[b.workplane.aMm,b.workplane.bMm]:[]);const xs=points.map(p=>p.x),zs=points.map(p=>p.z);const x=Math.min(...xs)-50,z=Math.min(...zs)-50,w=Math.max(...xs)+50,d=Math.max(...zs)+50;draft.boundary=[{x,z},{x:w,z},{x:w,z:d},{x,z:d}];}
      const furniture=existing??args.create(draft,{skipHistory:true});furniture.params=draft;args.rebuild(furniture);args.commit();args.edit(furniture.id);
    }});
  };
  let cancelPicking:(()=>void)|null=null;
  const open=(wallOnly=false)=>{
    cancelPicking?.();args.ensureLayout();
    const state=args.state,kitchenId=state.activeKitchenGroupId??state.selectedKitchenGroupId??state.instances.find(i=>i.id===state.selectedInstanceId)?.kitchenGroupId??(state.kitchenGroups.length===1?state.kitchenGroups[0]!.id:null);
    if(!kitchenId){args.status("Vyberte kuchyňu, do ktorej patrí zástena.");return;}
    if(!wallOnly){preview(kitchenId);return;}
    args.status("Kliknite na stenu pre zástenu. Escape výber zruší.");
    const raycaster=new THREE.Raycaster();const previous=args.canvas.style.cursor;args.canvas.style.cursor="crosshair";
    const stop=()=>{args.canvas.removeEventListener("pointerdown",pick,true);window.removeEventListener("keydown",escape,true);args.canvas.style.cursor=previous;cancelPicking=null;};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();stop();args.status("Výber steny zrušený.");}};
    const pick=(event:PointerEvent)=>{if(event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();const rect=args.canvas.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),args.getCamera());
      const hit=raycaster.intersectObjects(state.walls.map(w=>w.mesh),true)[0];const wall=state.walls.find(w=>{let node:THREE.Object3D|null=hit?.object??null;while(node){if(node===w.mesh||node===w.root)return true;node=node.parent;}return false;});if(wall){stop();preview(kitchenId,wall.id);}};
    args.canvas.addEventListener("pointerdown",pick,true);window.addEventListener("keydown",escape,true);cancelPicking=stop;
  };
  return{sync,open,editSettings:(id:string)=>{const f=args.state.customFurniture.find(f=>f.id===id);if(f?.params.backsplash)preview(f.params.backsplash.kitchenId,undefined,id);}};
}
