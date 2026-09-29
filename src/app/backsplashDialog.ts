import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { CustomFurnitureParams, BacksplashGroupSource } from "../layout/customFurnitureTypes";
import type { BacksplashInput } from "../layout/backsplash/generator";
import { synchronizeBacksplash } from "../layout/backsplash/generator";
import { customBoardProfilePolygons } from "../layout/customBoardProfile";
import { polygonBoundsMm } from "../layout/customFurnitureGeometry";
import { captureBacksplashMaterialSnapshots } from "../layout/backsplash/materialSnapshots";

export function openBacksplashDialog(args:{catalog:ClientCatalog;input:BacksplashInput;params:CustomFurnitureParams;commit:(params:CustomFurnitureParams)=>void}) {
  const draft=structuredClone(args.params),source=draft.backsplash!;
  const dialog=document.createElement("dialog");dialog.setAttribute("aria-label","Návrh zásteny");dialog.style.cssText="width:min(850px,calc(100vw - 40px));max-height:90vh;overflow:auto;padding:24px;border:1px solid #ccc;border-radius:12px";
  const title=document.createElement("h2");title.textContent="Zástena · návrh dielcov a spojov";
  const form=document.createElement("form");form.style.cssText="display:grid;gap:12px";form.append(title);
  const fields=document.createElement("div");fields.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px";form.append(fields);
  const row=(label:string,input:HTMLElement)=>{const node=document.createElement("label");node.textContent=label;node.style.cssText="display:grid;gap:4px";input.setAttribute("aria-label",label);node.append(input);fields.append(node);};
  const material=document.createElement("select");material.add(new Option("Vybrať materiál",""));
  args.catalog.materials.filter(m=>m.materialType==="board"&&m.isActive).forEach(m=>material.add(new Option(m.displayName,m.id)));
  material.value=source.materialId;row("Materiál zásteny",material);
  const numeric=(key:"thicknessMm"|"offsetMm"|"maxLengthMm"|"kerfMm"|"stockLengthMm"|"stockWidthMm",label:string,min:number)=>{
    const input=document.createElement("input");input.type="number";input.min=String(min);input.step="1";input.value=String(source[key]??0);row(label,input);
    input.addEventListener("input",()=>{if(input.value!==""&&input.validity.valid){source[key]=Number(input.value);if(key==="thicknessMm")source.thicknessOverride=true;render();}});
  };
  numeric("thicknessMm","Hrúbka (mm)",1);numeric("offsetMm","Odsadenie od steny (mm)",0);numeric("maxLengthMm","Najväčšia dĺžka dielca (mm)",100);
  numeric("stockLengthMm","Nákupná dĺžka (mm; 0 = materiál)",0);numeric("stockWidthMm","Nákupná šírka (mm; 0 = materiál)",0);numeric("kerfMm","Šírka rezu (mm)",0);
  const half=document.createElement("input");half.type="checkbox";half.checked=source.allowHalf;row("Povoliť polovičnú dĺžku formátu",half);half.addEventListener("change",()=>{source.allowHalf=half.checked;render();});
  const grain=document.createElement("select");for(const [value,text]of [["length","Pozdĺž dĺžky dosky"],["width","Naprieč doskou"],["free","Bez smeru dekoru"]])grain.add(new Option(text!,value));grain.value=source.grain;row("Smer dekoru",grain);grain.addEventListener("change",()=>{source.grain=grain.value as BacksplashGroupSource["grain"];render();});
  material.addEventListener("change",()=>{source.materialId=material.value;source.materialOverride=true;render();});
  const joins=document.createElement("div"),preview=document.createElement("div"),message=document.createElement("p");message.setAttribute("role","status");
  const note=document.createElement("p");note.textContent="Spoje možno posunúť pred potvrdením. Polovičný formát má polovicu dĺžky a celú šírku. Ručné výnimky a vymazané dielce zostanú zachované.";
  form.append(note,joins,preview,message);
  const jointFields=new Map<string,HTMLInputElement>();
  const render=()=>{
    synchronizeBacksplash(draft,args.input);
    captureBacksplashMaterialSnapshots(draft,args.catalog);
    preview.replaceChildren();
    for(const board of draft.boards){
      const bounds=polygonBoundsMm(board.profile);if(!bounds.widthMm||!bounds.heightMm)continue;
      const section=document.createElement("section");const label=document.createElement("p");label.textContent=`${board.name} · ${Math.round(bounds.widthMm)} × ${Math.round(bounds.heightMm)} × ${board.thicknessMm} mm`;
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox",`${bounds.minX-10} ${bounds.minY-10} ${bounds.widthMm+20} ${bounds.heightMm+20}`);svg.style.cssText="width:100%;height:110px;background:#f7f8fa";svg.setAttribute("aria-label",label.textContent);
      const path=document.createElementNS(svg.namespaceURI,"path");path.setAttribute("d",customBoardProfilePolygons(board).flatMap(p=>p.map(r=>`M ${r.map(p=>`${p.x},${p.y}`).join(" L ")} Z`)).join(" "));path.setAttribute("fill-rule","evenodd");path.setAttribute("fill","#b5d9cf");path.setAttribute("stroke","#357566");path.setAttribute("stroke-width","2");path.setAttribute("transform",`translate(0 ${bounds.minY+bounds.maxY}) scale(1 -1)`);svg.append(path);section.append(label,svg);preview.append(section);
      const key=board.backsplashSource?.key.split(":").slice(0,-4).join(":");
      // Wall IDs may contain colons; use the explicit wall source and orientation.
      const wallKey=board.backsplashSource?`${board.backsplashSource.wallId}:${board.workplane.type==="vertical"&&board.workplane.mirrored?-1:1}`:key;
      if(wallKey&&!jointFields.has(wallKey)){
        const input=document.createElement("input");input.type="text";input.placeholder="Automatický návrh";input.value=(source.joints[wallKey]??[]).join(", ");
        const label=document.createElement("label");label.textContent=`Spoje na stene ${jointFields.size+1} (mm od začiatku steny, oddelené čiarkou)`;label.style.cssText="display:grid;gap:4px;margin:8px 0";input.setAttribute("aria-label",label.textContent);label.append(input);joins.append(label);jointFields.set(wallKey,input);
        input.addEventListener("change",()=>{const values=input.value.trim()?input.value.split(/[,;\s]+/).map(Number):undefined;if(values?.some(v=>!Number.isFinite(v)||v<0)){input.setCustomValidity("Zadajte nezáporné polohy spojov v mm.");input.reportValidity();return;}input.setCustomValidity("");if(values)source.joints[wallKey]=values;else delete source.joints[wallKey];render();});
      }
    }
    message.textContent=draft.boards.length?`${draft.boards.length} dielcov. Nákupný rozpis a cenu nájdete v Materiáloch → Zástena.`:"Na vybraných stenách nie je súvislá pracovná doska podopretá kuchynskými modulmi.";
  };
  const actions=document.createElement("div");actions.style.cssText="display:flex;gap:10px";
  const save=document.createElement("button");save.type="submit";save.textContent="Potvrdiť zástenu";save.dataset.confirmBacksplash="true";
  const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Zrušiť";actions.append(save,cancel);form.append(actions);dialog.append(form);document.body.append(dialog);
  const close=()=>{dialog.close();dialog.remove();};cancel.addEventListener("click",close);dialog.addEventListener("cancel",()=>dialog.remove());
  form.addEventListener("submit",event=>{event.preventDefault();render();if(!draft.boards.length)return;args.commit(draft);close();});
  render();dialog.showModal();
}
