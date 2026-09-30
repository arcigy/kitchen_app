import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";
import { edgeGroupName, updateEdgeGroup } from "../core/edge-banding/edgeGroups";
import "./edgeBanding.css";
export function openEdgeGroupDialog(state:ProjectMaterialAssignmentsState,catalog:ClientCatalog,groupId?:string):Promise<ProjectMaterialAssignment|null> {
  return new Promise(resolve=>{
    const current=state.assignments.find(g=>g.assignmentId===groupId);
    const dialog=document.createElement("dialog");dialog.className="edge-banding-panel";dialog.setAttribute("aria-label","Skupina olepenia");dialog.style.width="min(520px,90vw)";
    const title=document.createElement("h2");title.textContent=current?"Upraviť skupinu olepenia":"Nová skupina olepenia";
    const name=document.createElement("input");name.setAttribute("aria-label","Názov skupiny olepenia");name.value=current?edgeGroupName(current):"Nové olepenie";name.maxLength=100;
    const materials=catalog.materials.filter(m=>m.materialType==="edge"&&m.isActive&&m.pricingUnit==="lm");
    if(current?.snapshots.material&&!materials.some(m=>m.id===current.materialId))materials.unshift(current.snapshots.material.definition);
    const material=document.createElement("select");material.setAttribute("aria-label","Materiál olepenia");material.add(new Option("Bez materiálu – cena bude neúplná",""));for(const m of materials)material.add(new Option(m.displayName,m.id));material.value=current?.materialId??"";
    const help=document.createElement("p");help.textContent="Materiál sa použije na všetkých hranách tejto skupiny. Hrany pridávajte a odoberajte v rozšírených nastaveniach modulov a vlastných dosiek.";
    const error=document.createElement("p");error.setAttribute("role","alert");
    const close=(value:ProjectMaterialAssignment|null)=>{dialog.close();dialog.remove();resolve(value);};
    const save=document.createElement("button");save.type="button";save.textContent="Uložiť skupinu";save.addEventListener("click",()=>{
      try{const id=groupId??`material-assignment:edge-group:${crypto.randomUUID()}`;const next=updateEdgeGroup(state,id,name.value,materials.find(m=>m.id===material.value)??null,catalog);close(next.assignments.find(g=>g.assignmentId===id)!);}catch(e){error.textContent=e instanceof Error?e.message:String(e);}
    });
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Zrušiť";cancel.addEventListener("click",()=>close(null));
    dialog.append(title,name,material,help,error,cancel,save);dialog.addEventListener("cancel",e=>{e.preventDefault();close(null);});dialog.addEventListener("keydown",e=>e.stopPropagation());document.body.append(dialog);dialog.showModal();name.focus();
  });
}
