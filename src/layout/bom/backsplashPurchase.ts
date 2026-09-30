import { createPricingCatalog } from "../../core/catalog/pricing-catalog";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { calculateCommercialPricingFromQuoteBom, type PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import { layoutBacksplashCuts, type BacksplashCutSheet } from "./backsplashCutLayout";
import type { ProjectPricingView } from "./projectPricing";

import type { BacksplashPurchaseInfo } from "../../core/project-materials/backsplash-purchase-types";
export type { BacksplashPurchaseInfo } from "../../core/project-materials/backsplash-purchase-types";
/** All groups share the same stock only when material, thickness and price snapshot agree. */
export function applyBacksplashPurchases(entries:ProjectPricingView[],catalog:ClientCatalog):ProjectPricingView[]{
  if (!entries.some(entry => entry.result.quoteBom.items.some(item => item.backsplashCut))) return entries;
  const pricing=createPricingCatalog(catalog), groups=new Map<string,PortableQuoteBomItem[]>();
  const next=entries.map(entry=>entry.result.quoteBom.items.some(item=>item.backsplashCut)?{...entry,result:{...entry.result,quoteBom:structuredClone(entry.result.quoteBom)}}:entry);
  for(const entry of next) for(const item of entry.result.quoteBom.items){
    if(!item.backsplashCut)continue;
    const material=item.material;
    const unitPrice=item.unitPriceOverrideSource ? item.unitPriceOverride : material?pricing.getUnitPriceForCatalogId(material.catalogId):null;
    const key=JSON.stringify([material?.catalogId,item.dimensionsMm?.thickness,item.priceSnapshotKey??unitPrice,material?.metadata,item.backsplashCut.kerfMm,item.backsplashCut.allowHalf,item.backsplashCut.stockLengthMm,item.backsplashCut.stockWidthMm]);
    const rows=groups.get(key)??[]; rows.push(item);groups.set(key,rows);
  }
  for(const [key,items] of groups){
    items.sort((a,b)=>a.id.localeCompare(b.id));
    const leader=items[0]!, meta=leader.material?.metadata??{}, length=Number(leader.backsplashCut!.stockLengthMm || meta.supplierLengthMm),width=Number(leader.backsplashCut!.stockWidthMm || meta.supplierWidthMm);
    const layout=layoutBacksplashCuts(items.map(item=>({id:item.id,lengthMm:item.dimensionsMm?.length??0,widthMm:item.dimensionsMm?.width??0,grain:item.backsplashCut!.grain})),
      {lengthMm:length,widthMm:width,allowHalf:leader.backsplashCut!.allowHalf,kerfMm:leader.backsplashCut!.kerfMm});
    const price=leader.unitPriceOverrideSource?leader.unitPriceOverride:leader.material?pricing.getUnitPriceForCatalogId(leader.material.catalogId):null;
    const groupId=`backsplash-stock:${items.map(item=>item.id).join("|")}`;
    const info:BacksplashPurchaseInfo={groupId,materialLabel:leader.material?.displayName??"Nepriradená zástena",stockLengthMm:length||0,stockWidthMm:width||0,
      purchasedPieces:layout.purchasedPieces,purchasedAreaM2:layout.purchasedAreaM2,netAreaM2:items.reduce((sum,item)=>sum+(item.metrics?.areaM2??0),0),
      cost:price==null?null:Math.round(layout.purchasedAreaM2*price*100)/100,currency:catalog.priceList.currency,sheets:layout.sheets};
    if(layout.errors.length) info.error=layout.errors.map(error=>error.message).join(" ");
    // Stock is charged once on the stable first row; all rows retain their own net area and blank.
    for(const [index,item] of items.entries()){
      item.backsplashPurchase={...info};
      item.pricingQuantity=index===0?layout.purchasedAreaM2:0;
      item.purchasedStockPieces=index===0?layout.purchasedPieces:0;
      item.metrics={...item.metrics,billableAreaM2:item.pricingQuantity,wasteMultiplier:1};
      item.notes=[...(item.notes??[]).filter(note=>!note.startsWith("Spoločný nákup:")),`Spoločný nákup: ${layout.purchasedPieces} dosiek ${length} × ${width} mm. Cena je započítaná raz za celú skupinu.`];
    }
    void key;
  }
  return next.map(entry=>entry.result.quoteBom.items.some(item=>item.backsplashCut)?{...entry,result:{...entry.result,pricing:calculateCommercialPricingFromQuoteBom({quoteBom:entry.result.quoteBom,catalog,boardWasteMultiplier:1,laborCostFixed:entry.result.pricing.laborCostFixed,preassembly:entry.result.pricing.preassembly})}}:entry);
}
