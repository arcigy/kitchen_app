import type { ModuleParams } from "../model/cabinetTypes";
/** Additive runtime controls also work with already installed module packages. */
export function mountModulePlinthControls(host:HTMLElement,getParams:()=>ModuleParams,change:(params:ModuleParams,key:string)=>boolean) {
  const section=document.createElement("fieldset");const title=document.createElement("legend");title.textContent="Sokel – predná a bočné strany";section.append(title);
  const controls:Array<{key:string;select:HTMLSelectElement}>=[];
  for(const [key,label] of [["plinthFrontEnabled","Predný sokel"],["plinthLeftEnabled","Ľavý bočný sokel"],["plinthRightEnabled","Pravý bočný sokel"]]) {
    const wrap=document.createElement("label");wrap.textContent=label!;const select=document.createElement("select");select.setAttribute("aria-label",label!);
    select.add(new Option("Podľa konštrukcie","auto"));select.add(new Option("Áno","true"));select.add(new Option("Nie","false"));
    select.addEventListener("change",()=>{const params={...getParams()};if(select.value==="auto")delete params[key!];else params[key!]=select.value==="true";change(params,key!);});wrap.append(select);section.append(wrap);controls.push({key:key!,select});
  }
  host.append(section);
  return {sync(){const params=getParams();section.hidden=Number(params.plinthHeight)<=0||!["fwm_catalog_base_doors","fwm_catalog_base_drawers","fwm_catalog_tall_cabinet","base_bottle_pullout"].includes(params.type);for(const {key,select}of controls)select.value=typeof params[key]==="boolean"?String(params[key]):"auto";}};
}
