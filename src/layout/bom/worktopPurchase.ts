import type { MaterialDefinition } from "../../core/catalog/catalog-types";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
export type WorktopPurchase = { pieces:number; areaM2:number; stockLengthMm:number; stockWidthMm:number; increment:number; error?:string };
/** Each independently cut run consumes whole/half supplier stock. Offcuts are
 * intentionally not credited to another run; no implicit joint is invented. */
export function worktopPurchase(item:PortableQuoteBomItem,material:MaterialDefinition):WorktopPurchase|null {
  if(item.itemType!=="board"||item.materialGroup!=="worktop")return null;
  const meta=material.metadata??{};
  const increment=Number(meta.worktopPurchaseIncrement);
  if(increment!==.5&&increment!==1)return null;
  const length=Number(meta.supplierLengthMm),width=Number(meta.supplierWidthMm);
  const empty={pieces:0,areaM2:0,stockLengthMm:length,stockWidthMm:width,increment};
  if(!(length>0&&width>0))return {...empty,error:"Chýba rozmer nákupnej pracovnej dosky."};
  const cuts=item.worktopCutsMm??(item.dimensionsMm?[{length:item.dimensionsMm.length,width:item.dimensionsMm.width}]:[]);
  if(!cuts.length)return {...empty,error:"Chýbajú rezné rozmery pracovnej dosky."};
  let pieces=0;
  for(const cut of cuts) {
    if(!Number.isFinite(cut.length)||!Number.isFinite(cut.width)||cut.length<=0||cut.width<=0||cut.width>width+.01||cut.length>length+.01)return {...empty,error:"Pracovná doska presahuje nákupný formát. Rozdeľte ju na vyrobiteľné dielce."};
    pieces+=Math.ceil((cut.length-.00001)/(length*increment))*increment;
  }
  pieces*=item.quantity;
  return {...empty,pieces,areaM2:pieces*length*width/1e6};
}
