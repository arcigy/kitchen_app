import { customBoardProfilePolygons } from "../layout/customBoardProfile";
import { mergeEdgeGroupChanges } from "../core/edge-banding/edgeGroupTransaction";
import { ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Path, Shape, Vector3 } from "three";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { edgeGroup, readEdgeBindings, orphanEdgeBindings } from "../core/edge-banding/edgeEntities";
import { edgeGroupColor, ensureEdgeGroups, updateEdgeGroup } from "../core/edge-banding/edgeGroups";
import { customBoardEdges, legacyCustomEdgeGroupId } from "../layout/customFurnitureEdges";
import type { AppState } from "../layout/appState";
import type { CustomFurnitureBoardParams, CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import { createEdgeBandingPanel } from "./edgeBandingPanel";
import { previewEdgeFace } from "./edgeBandingPreview";
import { createModuleSettingsSession } from "./moduleSettingsSession";
import { createModuleSettingsViewport } from "./moduleSettingsViewport";
import { publishProjectEdgeMaterials } from "./projectEdgeMaterials";
import "./moduleSettings.css";

export function openCustomBoardEdgeSettings(args:{state:AppState;furniture:CustomFurnitureInstance;board:CustomFurnitureBoardParams;catalog:ClientCatalog;rebuildFurniture:(f:CustomFurnitureInstance)=>void;commitHistory:()=>void;onClose:()=>void}) {
  if(document.querySelector("dialog[data-board-edge-settings]")) return;
  const baselineBoard=structuredClone(args.board);const baselineMaterials=structuredClone(args.state.projectMaterialAssignments);
  const baseGroups=ensureEdgeGroups(baselineMaterials,args.catalog);
  let groups=structuredClone(baseGroups);
  for(const materialId of new Set(args.board.edgeBanding.map(e=>e.materialId))) {
    const id=legacyCustomEdgeGroupId(materialId);
    if(!groups.assignments.some(g=>g.assignmentId===id)) {
      const material=args.catalog.materials.find(m=>m.id===materialId&&m.materialType==="edge")??null;
      groups=updateEdgeGroup(groups,id,material?.displayName??"Pôvodné olepenie dosky",material,args.catalog);
    }
  }
  const edges=customBoardEdges(args.board);const previousFocus=document.activeElement;
  const dialog=document.createElement("dialog");dialog.className="module-settings";dialog.dataset.boardEdgeSettings="true";dialog.setAttribute("aria-label",`Olepenie · ${args.board.name}`);
  const shell=document.createElement("div");shell.className="module-settings-shell";
  const header=document.createElement("header");header.className="module-settings-header";
  const title=document.createElement("h2");title.textContent=`Olepenie · ${args.board.name}`;
  const help=document.createElement("p");help.textContent="Výrobný pohľad na rozvinutý dielec. Zmeny sa do projektu zapíšu po uložení.";header.append(title,help);
  const body=document.createElement("div");body.className="module-settings-body";
  const preview=document.createElement("div");preview.className="module-settings-preview";
  const viewer=document.createElement("div");viewer.className="module-settings-viewport";preview.append(viewer);
  const side=document.createElement("div");side.className="module-settings-side";
  const footer=document.createElement("footer");footer.className="module-settings-footer";
  const error=document.createElement("p");error.setAttribute("role","alert");footer.append(error);
  body.append(preview,side);shell.append(header,body,footer);dialog.append(shell);document.body.append(dialog);dialog.showModal();
  const viewport=createModuleSettingsViewport(viewer,{onFocus:()=>{},onEdit:()=>false,labelFor:key=>key});
  const shapes=customBoardProfilePolygons(args.board).map(rings=>{const shape=new Shape();rings.forEach((ring,k)=>{const path=k?new Path():shape;ring.forEach((p,i)=>i?path.lineTo(p.x/1000,p.y/1000):path.moveTo(p.x/1000,p.y/1000));path.closePath();if(k)shape.holes.push(path);});return shape;});
  const geometry=new ExtrudeGeometry(shapes,{depth:args.board.thicknessMm/1000,bevelEnabled:false});
  const material=new MeshStandardMaterial({color:"#d5c8b3",roughness:.8});const root=new Group();root.add(new Mesh(geometry,material));viewport.setModel(root,[]);
  const previewEdges=edges.map(edge=>previewEdgeFace(edge,{x:0,y:0,z:args.board.thicknessMm},point=>new Vector3(point.x,point.y,point.z).multiplyScalar(.001)));
  const session=createModuleSettingsSession({bindings:readEdgeBindings(args.board.edgeBandingOverrides),groups},{prepare:next=>next,commit:next=>{
    if(JSON.stringify(args.board)!==JSON.stringify(baselineBoard))throw new Error("Doska alebo materiály sa medzitým zmenili. Znova otvorte olepenie.");
    if(orphanEdgeBindings({kind:"custom-board",edges},next.bindings).length)throw new Error("Odstráňte neplatné priradenia hrán.");
    const materialsBeforeCommit = structuredClone(args.state.projectMaterialAssignments);
    try {
      args.board.edgeBandingOverrides=structuredClone(next.bindings);args.state.projectMaterialAssignments=mergeEdgeGroupChanges(args.state.projectMaterialAssignments,baseGroups,next.groups);
      args.rebuildFurniture(args.furniture);publishProjectEdgeMaterials(args.state);args.commitHistory();
    }catch(failure){Object.assign(args.board,structuredClone(baselineBoard));if(!baselineBoard.edgeBandingOverrides)delete args.board.edgeBandingOverrides;args.state.projectMaterialAssignments=materialsBeforeCommit;args.rebuildFurniture(args.furniture);publishProjectEdgeMaterials(args.state);throw failure;}
    return next;
  }});
  const panel=createEdgeBandingPanel(side,{catalog:args.catalog,getState:()=>({adapter:{kind:"custom-board",edges},...session.current()}),change:(bindings,nextGroups)=>{session.change({bindings,groups:nextGroups});refresh();},onSelection:(selected)=>{
    const bindings=session.current().bindings;viewport.setEdges({edges:previewEdges,selected,color:edge=>{const id=edgeGroup(edge,bindings);return id?edgeGroupColor(id):"#94a3b8";},onPick:(id,multiple)=>panel.pick(id,multiple)});
  }});
  const button=(label:string,action:()=>void)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",action);footer.append(b);return b;};
  const undo=button("Späť",()=>{session.undo();refresh();});const redo=button("Znova",()=>{session.redo();refresh();});
  const refresh=()=>{panel.refresh();undo.disabled=!session.canUndo;redo.disabled=!session.canRedo;};
  let confirmation:HTMLDialogElement|null=null;
  const close=()=>{window.removeEventListener("beforeunload",unload);confirmation?.close();confirmation?.remove();viewport.dispose();geometry.dispose();material.dispose();dialog.close();dialog.remove();args.onClose();if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus();};
  const save=()=>{try{session.save();close();}catch(failure){error.textContent=failure instanceof Error?failure.message:String(failure);}};
  const requestClose=()=>{
    if(!session.dirty){close();return;}if(confirmation)return;
    confirmation=document.createElement("dialog");confirmation.className="module-settings-confirm";confirmation.setAttribute("aria-label","Neuložené olepenie");
    const text=document.createElement("p");text.textContent="Uložiť zmeny olepenia pred zatvorením?";confirmation.append(text);
    for(const [label,action] of [["Pokračovať v úpravách",()=>{confirmation?.close();confirmation?.remove();confirmation=null;}],["Zahodiť zmeny",close],["Uložiť a zavrieť",save]] as const){const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",action);confirmation.append(b);}
    confirmation.addEventListener("cancel",e=>{e.preventDefault();confirmation?.close();confirmation?.remove();confirmation=null;});
    confirmation.addEventListener("keydown",e=>e.stopPropagation());dialog.append(confirmation);confirmation.showModal();
  };
  const unload=(e:BeforeUnloadEvent)=>{if(session.dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",unload);
  button("Zrušiť",requestClose);button("Uložiť a zavrieť",save);
  dialog.addEventListener("cancel",e=>{e.preventDefault();requestClose();});
  dialog.addEventListener("keydown",e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&["z","y"].includes(e.key.toLowerCase())){e.preventDefault();session[e.shiftKey||e.key.toLowerCase()==="y"?"redo":"undo"]();refresh();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();save();}});
  for(const name of ["pointerdown","pointerup","click","dblclick","wheel"])dialog.addEventListener(name,e=>e.stopPropagation());
  refresh();
}
