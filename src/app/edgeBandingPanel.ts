import { edgePartLabel } from "./edgePartLabel";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { bindEdges, edgeGroup, orphanEdgeBindings, type EdgeBindingMap, type EdgeEntityAdapter } from "../core/edge-banding/edgeEntities";
import { edgeGroupColor, edgeGroupName, edgeGroups, updateEdgeGroup } from "../core/edge-banding/edgeGroups";
import type { ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";
import "./edgeBanding.css";
export type EdgePanelState = { adapter: EdgeEntityAdapter; bindings: EdgeBindingMap; groups: ProjectMaterialAssignmentsState };
export function createEdgeBandingPanel(host: HTMLElement, args: {
  catalog: ClientCatalog;
  getState: () => EdgePanelState;
  change: (bindings: EdgeBindingMap, groups: ProjectMaterialAssignmentsState) => void;
  onSelection: (ids: ReadonlySet<string>, partId: string) => void;
}) {
  host.classList.add("edge-banding-panel");
  let selected = new Set<string>(); let partId=""; let activeGroup="";
  const button=(label:string,fn:()=>void)=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",fn);return b;};
  const select=(label:string,options:Array<[string,string]>,value:string,change:(value:string)=>void)=>{
    const wrap=document.createElement("label");wrap.textContent=label;
    const input=document.createElement("select");input.setAttribute("aria-label",label);
    options.forEach(([id,text])=>input.add(new Option(text,id)));input.value=value;
    input.addEventListener("change",()=>change(input.value));wrap.append(input);return wrap;
  };
  const pick=(id:string,multiple=false)=>{
    if(!multiple) selected=new Set(selected.size===1&&selected.has(id)?[]:[id]);
    else if(selected.has(id))selected.delete(id);else selected.add(id);
    refresh();
  };
  const refresh=()=>{
    const focused = host.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const focusEdge = focused?.dataset.edgeId;
    const focusLabel = focused?.getAttribute("aria-label");
    const focusButton = focused?.tagName === "BUTTON" ? focused.textContent : null;
    const state=args.getState(); const groups=edgeGroups(state.groups);const known=new Set(state.adapter.edges.map(e=>e.id));
    selected=new Set([...selected].filter(id=>known.has(id)));
    if(!groups.some(g=>g.assignmentId===activeGroup))activeGroup=groups[0]?.assignmentId??"";
    const parts=[...new Set(state.adapter.edges.map(e=>e.partId))];if(partId&&!parts.includes(partId))partId="";
    const partName=(id:string)=>state.adapter.edges.find(e=>e.partId===id)?.partLabel??edgePartLabel(id);
    host.replaceChildren();
    const title=document.createElement("h3");title.textContent="Olepenie po hranách";
    const help=document.createElement("p");help.textContent="Kliknite na úzku bočnú plochu dosky alebo na hranu v zozname. Zvýraznenie pokrýva celú hrúbku dosky. Ctrl / Shift pridáva do výberu. Farba označuje skupinu, sivá plochu bez olepenia a oranžová výber. Viditeľné sú aj zakryté hrany; pre presný výber zvoľte jeden dielec.";
    host.append(title,help);
    host.append(select("Dielec",[["","Všetky dielce"],...parts.map((id,i):[string,string]=>[id,`${i+1}. ${partName(id)}`])],partId,value=>{partId=value;selected.clear();refresh();}));
    host.append(select("Skupina olepenia",groups.map(g=>[g.assignmentId,edgeGroupName(g)]),activeGroup,value=>{activeGroup=value;refresh();}));
    const group=groups.find(g=>g.assignmentId===activeGroup);
    if(group) {
      const name=document.createElement("input");name.type="text";name.value=edgeGroupName(group);name.maxLength=100;name.setAttribute("aria-label","Názov skupiny olepenia");
      name.addEventListener("change",()=>{
        if(!name.value.trim()){name.value=edgeGroupName(group);return;}
        args.change(state.bindings,updateEdgeGroup(state.groups,activeGroup,name.value,group.snapshots.material?.definition??null,args.catalog));
      });host.append(name);
      const materials=args.catalog.materials.filter(m=>m.isActive&&m.materialType==="edge"&&m.pricingUnit==="lm");
      if(group.snapshots.material&&!materials.some(m=>m.id===group.materialId))materials.unshift(group.snapshots.material.definition);
      host.append(select("Materiál olepenia",[["","Nevybraný materiál – cena bude neúplná"],...materials.map((m):[string,string]=>[m.id,m.displayName])],group.materialId??"",id=>{
        args.change(state.bindings,updateEdgeGroup(state.groups,activeGroup,edgeGroupName(group),materials.find(m=>m.id===id)??null,args.catalog));
      }));
      const note=document.createElement("small");note.textContent="Materiál skupiny sa mení pre všetky jej hrany v projekte, vrátane vlastných dosiek.";host.append(note);
    }
    host.append(button("Nová skupina olepenia",()=>{
      activeGroup=`material-assignment:edge-group:${crypto.randomUUID()}`;
      args.change(state.bindings,updateEdgeGroup(state.groups,activeGroup,`Olepenie ${groups.length+1}`,null,args.catalog));
    }));
    const toolbar=document.createElement("div");toolbar.className="edge-banding-actions";
    const visible=state.adapter.edges.filter(e=>!partId||e.partId===partId);
    toolbar.append(button("Vybrať hrany dielca",()=>{selected=new Set(visible.map(e=>e.id));refresh();}));
    const apply=button("Pridať do skupiny",()=>args.change(bindEdges(state.adapter,state.bindings,[...selected],activeGroup),state.groups));apply.disabled=!selected.size||!activeGroup;
    const remove=button("Odobrať olepenie",()=>args.change(bindEdges(state.adapter,state.bindings,[...selected],null),state.groups));remove.disabled=!selected.size;
    const reset=button("Obnoviť predvolené",()=>{const bindings={...state.bindings};for(const id of selected)delete bindings[id];args.change(bindings,state.groups);});reset.disabled=!selected.size;
    toolbar.append(apply,remove,reset);host.append(toolbar);
    const count=document.createElement("p");count.setAttribute("role","status");
    const total=state.adapter.edges.reduce((sum,e)=>sum+(edgeGroup(e,state.bindings)?e.lengthMm:0),0)/1000;
    count.textContent=`${selected.size} vybraných · ${total.toLocaleString("sk-SK",{maximumFractionDigits:4})} bm olepenia v tomto kuse`;host.append(count);
    const list=document.createElement("div");list.className="edge-banding-list";list.setAttribute("aria-label","Hrany dielcov");
    for(const edge of visible) {
      const groupId=edgeGroup(edge,state.bindings);const assigned=groups.find(g=>g.assignmentId===groupId);const label=groupId?(assigned?edgeGroupName(assigned):"Chýbajúca skupina"):"Bez olepenia";
      const b=button(`${partName(edge.partId)} · ${edge.label} · ${Number(edge.lengthMm.toFixed(2))} mm · ${label}`,()=>{});
      b.dataset.edgeId=edge.id;b.setAttribute("aria-pressed",String(selected.has(edge.id)));
      b.style.borderLeftColor=groupId?edgeGroupColor(groupId):"#94a3b8";
      b.addEventListener("click",event=>pick(edge.id,event.ctrlKey||event.metaKey||event.shiftKey));list.append(b);
    }
    host.append(list);
    const orphans=orphanEdgeBindings(state.adapter,state.bindings);
    if(orphans.length){const warning=document.createElement("p");warning.setAttribute("role","alert");warning.textContent=`${orphans.length} pôvodných hrán už nezodpovedá tvaru dielca. Ich olepenie sa nepresunulo na inú hranu. Pred uložením ich odstráňte a vyberte nové hrany.`;host.append(warning,button("Odstrániť neplatné priradenia",()=>{const bindings={...state.bindings};for(const id of orphans)delete bindings[id];args.change(bindings,state.groups);}));}
    args.onSelection(selected,partId);
    if (focused) {
      const replacement = [...host.querySelectorAll<HTMLElement>("button,input,select")].find(element => focusEdge ? element.dataset.edgeId === focusEdge : focusLabel ? element.getAttribute("aria-label") === focusLabel : focusButton ? element.tagName === "BUTTON" && element.textContent === focusButton : false);
      replacement?.focus({ preventScroll: true });
    }
  };
  return {refresh,pick};
}
