import type { CustomFurnitureBoardParams, CustomFurnitureInstance, BacksplashAutomaticField } from "../layout/customFurnitureTypes";
import type { CustomFurnitureSelectedPropsApi } from "./customFurnitureSelectedPropsPanel";
import { resetBacksplashBoard } from "../layout/backsplash/generator";
import { polygonBoundsMm } from "../layout/customFurnitureGeometry";
import { numberInput } from "./customFurnitureUiControls";

type PropsArgs={props:CustomFurnitureSelectedPropsApi;furniture:CustomFurnitureInstance;rebuildFurniture:(f:CustomFurnitureInstance)=>void;commitHistory:()=>void;refreshProps:()=>void};
function button(parent:HTMLElement,label:string,click:()=>void){const b=document.createElement("button");b.type="button";b.textContent=label;b.addEventListener("click",click);parent.append(b);return b;}
export function mountBacksplashGroupProps(args:PropsArgs&{onBacksplashSettings?:()=>void}){
  const section=args.props.section(),source=args.furniture.params.backsplash!;
  const status=document.createElement("p");status.textContent=source.detached||source.orphanedWallIds.length?"Zástena je odpojená od odstráneného zdroja. Dosky zostávajú na poslednej platnej pozícii.":"Zástena sleduje kuchyňu. Ručne zmenené parametre zostanú zachované.";section.append(status);
  if(args.onBacksplashSettings)button(section,"Materiál, spoje a nákupné formáty",args.onBacksplashSettings);
  if(source.suppressedKeys.length)button(section,`Obnoviť vymazané dielce (${source.suppressedKeys.length})`,()=>{source.suppressedKeys=[];args.commitHistory();args.refreshProps();});
}
export function mountBacksplashBoardProps(args:PropsArgs&{board:CustomFurnitureBoardParams}){
  const {board,furniture}=args;const section=args.props.section();
  const commit=()=>{args.rebuildFurniture(furniture);args.commitHistory();args.refreshProps();};
  const bounds=polygonBoundsMm(board.profile);
  if(board.backsplashSource){
    const labels:Record<BacksplashAutomaticField,string>={profile:"Rozmery a tvar",workplane:"Poloha a odsadenie",thicknessMm:"Hrúbka",materialId:"Materiál",cutouts:"Výrezy",baseOffsetMm:"Spodná výška",topOffsetMm:"Horná výška"};
    const source=board.backsplashSource;
    const fields=Object.keys(labels) as BacksplashAutomaticField[];
    const overrides=fields.filter(field=>source.overrides.includes(field)||JSON.stringify(board[field])!==JSON.stringify(source.automatic[field]));
    const note=document.createElement("p");note.textContent=overrides.length?`Vlastná hodnota: ${overrides.map(key=>labels[key]).join(", ")}`:"Automatické rozmery podľa kuchyne";section.append(note);
    for(const field of overrides)button(section,`Obnoviť automatiku · ${labels[field]}`,()=>{resetBacksplashBoard(board,field);commit();});
    args.props.row(section,"Dĺžka dielca (mm)",numberInput(bounds.widthMm,value=>{if(!(value>0))return;board.profile=board.profile.map(p=>({...p,x:bounds.minX+(p.x-bounds.minX)*value/bounds.widthMm}));commit();}));
    args.props.row(section,"Výška dielca (mm)",numberInput(bounds.heightMm,value=>{if(!(value>0))return;board.profile=board.profile.map(p=>({...p,y:bounds.minY+(p.y-bounds.minY)*value/bounds.heightMm}));commit();}));
    if(board.workplane.type==="vertical"){
      const plane=board.workplane,dx=plane.bMm.x-plane.aMm.x,dz=plane.bMm.z-plane.aMm.z,length=Math.hypot(dx,dz);
      const move=(along:number,normal:number)=>{for(const p of[plane.aMm,plane.bMm]){p.x+=(dx*along-dz*normal)/length;p.z+=(dz*along+dx*normal)/length;}commit();};
      args.props.row(section,"Posun pozdĺž steny (mm)",numberInput(0,value=>move(value,0)));
      args.props.row(section,"Posun od steny (mm)",numberInput(0,value=>move(0,value*(plane.mirrored?-1:1))));
    }
  }
  // Actual cutouts are available to ordinary custom boards as well as backsplash boards.
  const heading=document.createElement("strong");heading.textContent="Výrezy";section.append(heading);
  for(const cut of board.cutouts??[]){
    const row=document.createElement("div");row.textContent=cut.sourceOpeningId?"Otvor zo steny":"Vlastný výrez";
    button(row,"Odstrániť výrez",()=>{board.cutouts=board.cutouts?.filter(item=>item.id!==cut.id);commit();});section.append(row);
  }
  button(section,"Pridať obdĺžnikový výrez",()=>{
    const form=document.createElement("form");form.style.cssText="display:grid;gap:8px";
    const values:{[key:string]:HTMLInputElement}={};
    for(const [key,label,value]of [["x","Od ľavého okraja (mm)",100],["y","Od spodného okraja (mm)",100],["width","Šírka výrezu (mm)",100],["height","Výška výrezu (mm)",100]] as const){const input=document.createElement("input");input.type="number";input.step="any";input.value=String(value);input.required=true;if(key==="width"||key==="height")input.min="1";input.setAttribute("aria-label",label);const row=document.createElement("label");row.textContent=label;row.append(input);form.append(row);values[key]=input;}
    const save=document.createElement("button");save.type="submit";save.textContent="Vložiť výrez";form.append(save);button(form,"Zrušiť",()=>form.remove());section.append(form);
    form.addEventListener("submit",event=>{event.preventDefault();const x=bounds.minX+Number(values.x!.value),y=bounds.minY+Number(values.y!.value),w=Number(values.width!.value),h=Number(values.height!.value);if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;board.cutouts=[...(board.cutouts??[]),{id:crypto.randomUUID(),profile:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]}];commit();});
  });
}
