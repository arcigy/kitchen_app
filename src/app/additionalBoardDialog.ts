import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { CustomFurnitureBoardParams, CustomFurnitureParams } from "../layout/customFurnitureTypes";

export type AdditionalBoardInput = { name: string; lengthMm: number; widthMm: number; thicknessMm: number; elevationMm: number; orientation: "horizontal" | "vertical"; materialId: string; edgeMaterialId: string; edges: boolean[] };

export function additionalBoardParams(input: AdditionalBoardInput): CustomFurnitureParams {
  for (const value of [input.lengthMm, input.widthMm, input.thicknessMm]) if (!Number.isFinite(value) || value <= 0 || value > 20_000) throw new Error("Rozmery musia byť od 1 do 20 000 mm.");
  if (!Number.isFinite(input.elevationMm) || !input.materialId || !input.name.trim()) throw new Error("Vyplňte názov, výšku a materiál dielca.");
  const board: CustomFurnitureBoardParams = {
    id: "board1", name: input.name.trim(), kind: input.orientation, additionKind: "custom", materialOverride: true,
    profile: [{x:0,y:0},{x:input.lengthMm,y:0},{x:input.lengthMm,y:input.widthMm},{x:0,y:input.widthMm}],
    workplane: input.orientation === "horizontal" ? {type:"horizontal",elevationMm:input.elevationMm} : {type:"vertical",aMm:{x:0,z:0},bMm:{x:input.lengthMm,z:0},mirrored:false},
    thicknessMm: input.thicknessMm, materialId: input.materialId,
    baseConstraint:"absolute",baseOffsetMm:input.elevationMm,topConstraint:"absolute",topOffsetMm:input.elevationMm+input.widthMm,
    justification:"positive",edgeBanding: input.edges.flatMap((selected,edgeIndex)=>selected && input.edgeMaterialId ? [{edgeIndex,materialId:input.edgeMaterialId}] : [])
  };
  return { name: board.name, baseConstraint:"absolute",baseOffsetMm:input.elevationMm,topConstraint:"absolute",topOffsetMm:board.topOffsetMm,
    boundary:[{x:0,z:0},{x:input.lengthMm,z:0},{x:input.lengthMm,z:input.orientation === "horizontal" ? input.widthMm : input.thicknessMm},{x:0,z:input.orientation === "horizontal" ? input.widthMm : input.thicknessMm}],boards:[board] };
}

export function openAdditionalBoardDialog(catalog: ClientCatalog, commit: (params: CustomFurnitureParams) => Promise<void>): Promise<void> {
  return new Promise(resolve => {
    const dialog=document.createElement("dialog"); dialog.className="project-component-dialog"; dialog.style.cssText="width:min(540px,calc(100vw - 32px));padding:24px;border:1px solid #d1d5db;border-radius:12px";
    const form=document.createElement("form"); form.style.cssText="display:grid;gap:10px";
    const title=document.createElement("h2");title.id="additional-board-title";title.textContent="Pridať doskový dielec";dialog.setAttribute("aria-labelledby",title.id);form.append(title);
    const row=(label:string,input:HTMLElement)=>{const el=document.createElement("label");el.style.cssText="display:grid;gap:4px";el.textContent=label;input.setAttribute("aria-label",label);el.append(input);form.append(el);return input;};
    const number=(label:string,value:number,min:number)=>{const input=document.createElement("input");input.type="number";input.required=true;input.min=String(min);input.max="20000";input.step="any";input.value=String(value);row(label,input);return input;};
    const name=document.createElement("input");name.required=true;name.value="Doplnkový dielec";row("Názov dielca",name);
    const orientation=document.createElement("select");orientation.add(new Option("Vodorovná doska","horizontal"));orientation.add(new Option("Zvislá doska","vertical"));row("Orientácia",orientation);
    const length=number("Dĺžka (mm)",600,1),width=number("Šírka / výška dielca (mm)",400,1),thickness=number("Hrúbka (mm)",18,1),elevation=number("Výška spodnej hrany nad podlahou (mm)",0,-20000);
    const material=document.createElement("select");material.required=true;
    for(const item of catalog.materials.filter(item=>item.isActive&&item.materialType==="board"&&item.pricingUnit==="m2"))material.add(new Option(item.displayName,item.id));
    if (catalog.kitchenDefaults.carcassMaterialId) material.value=catalog.kitchenDefaults.carcassMaterialId;row("Materiál dielca",material);
    material.addEventListener("change",()=>{const item=catalog.materials.find(item=>item.id===material.value);if(item)thickness.value=String(item.defaultThicknessMm);});
    const edge=document.createElement("select");edge.add(new Option("Bez olepenia",""));for(const item of catalog.materials.filter(item=>item.isActive&&item.materialType==="edge"))edge.add(new Option(item.displayName,item.id));row("Materiál hrán",edge);
    const edges=["Spodná / predná hrana","Pravá hrana","Horná / zadná hrana","Ľavá hrana"].map(label=>{const input=document.createElement("input");input.type="checkbox";input.checked=true;row(label,input);return input;});
    const note=document.createElement("p");note.textContent="Dielec sa pridá do nákresu a kusovníka. Polohu, tvar a jednotlivé hrany môžete upraviť v editore dielca.";form.append(note);
    const error=document.createElement("p");error.setAttribute("role","alert");form.append(error);
    const save=document.createElement("button");save.type="submit";save.textContent="Pridať dielec";const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Zrušiť";form.append(save,cancel);
    const close=()=>{dialog.close();dialog.remove();resolve();};cancel.addEventListener("click",close);dialog.addEventListener("cancel",()=>{dialog.remove();resolve();});
    form.addEventListener("submit",event=>{event.preventDefault();save.disabled=true;void(async()=>{try{await commit(additionalBoardParams({name:name.value,lengthMm:Number(length.value),widthMm:Number(width.value),thicknessMm:Number(thickness.value),elevationMm:Number(elevation.value),orientation:orientation.value==="vertical"?"vertical":"horizontal",materialId:material.value,edgeMaterialId:edge.value,edges:edges.map(input=>input.checked)}));close();}catch(failure){error.textContent=failure instanceof Error?failure.message:"Pridanie zlyhalo.";}finally{save.disabled=false;}})();});
    dialog.append(form);document.body.append(dialog);dialog.showModal();
  });
}
