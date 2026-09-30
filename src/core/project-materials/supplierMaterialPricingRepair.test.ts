import {describe,it,expect} from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import type { ProjectMaterialAssignment } from "./project-material-types";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import { repairSupplierMaterialAssignment } from "./supplierMaterialPricingRepair";
import { worktopPurchase } from "../../layout/bom/worktopPurchase";
const board=createSystemCatalogSeed().materials.find(m=>m.materialType==="board")!;
function assignment(category:"worktop"|"plinth",price:string,length:number,width:number):ProjectMaterialAssignment {
  return {assignmentId:`material-assignment:${category}`,category,kind:"material",materialId:board.id,source:"user",updatedAt:"2026-09-23T00:00:00Z",
    snapshots:{material:{definition:{...board,pricingUnit:category==="plinth"?"lm":"m2",pricingBasis:category==="plinth"?"linear_length":"sheet_area",metadata:{supplierLengthMm:length,supplierWidthMm:width}},unitPrice:category==="plinth"?null:2/(length*width/1e6),currency:"CZK",priceListId:null,capturedAt:"2026-09-23T00:00:00Z"}},
    customValues:{supplierBridge:{rawPriceText:price,rawUnitText:"ks",normalizedPriceBasis:"m2"}}};
}
const item=(length:number,width=600):PortableQuoteBomItem=>({id:"worktop",itemType:"board",category:"worktop",materialGroup:"worktop",name:"Top",description:"Top",pricingBasis:"sheet_area",pricingUnit:"m2",quantity:1,pricingQuantity:length*width/1e6,dimensionsMm:{length,width,thickness:38},metrics:{areaM2:length*width/1e6}});
describe("saved supplier pricing evidence",()=>{
  it("repairs a truncated thousands price and bills a half stock piece at CZK 1049.50",()=>{
    const source=assignment("worktop","2 099 Kč",4100,635);const repaired=repairSupplierMaterialAssignment(source);
    expect(repaired.snapshots.material!.unitPrice).toBeCloseTo(2099/2.6035,10);
    const purchase=worktopPurchase(item(1850),repaired.snapshots.material!.definition)!;
    expect(purchase.pieces).toBe(.5);expect(purchase.areaM2).toBe(1.30175);
    expect(purchase.areaM2*repaired.snapshots.material!.unitPrice!).toBeCloseTo(1049.50,8);
    expect(source.snapshots.material!.unitPrice).toBeCloseTo(2/2.6035,8);
    expect(repairSupplierMaterialAssignment(repaired)).toEqual(repaired);
  });
  it.each([[2050,.5],[2050.1,1],[4100,1]] as const)("%d mm consumes %d stock pieces",(length,pieces)=>{
    const material=repairSupplierMaterialAssignment(assignment("worktop","2 099 Kč",4100,635)).snapshots.material!.definition;
    expect(worktopPurchase(item(length),material)?.pieces).toBe(pieces);
  });
  it("does not pool offcuts across runs or invent a joint for an oversize run",()=>{
    const material=repairSupplierMaterialAssignment(assignment("worktop","2 099 Kč",4100,635)).snapshots.material!.definition;
    const run=item(1000);run.worktopCutsMm=[{length:2100,width:600},{length:2100,width:600}];
    expect(worktopPurchase(run,material)?.pieces).toBe(2);
    expect(worktopPurchase(item(4101),material)?.error).toBeTruthy();expect(worktopPurchase(item(1800,636),material)?.error).toBeTruthy();
  });
  it("recovers a plinth board's area price, never multiplies it by running metres",()=>{
    const fixed=repairSupplierMaterialAssignment(assignment("plinth","1 115,88 Kč",2800,2070));
    expect(fixed.snapshots.material?.definition.pricingUnit).toBe("m2");
    expect(fixed.snapshots.material!.unitPrice! * (.6*.1)).toBeCloseTo(11.5515528,6);
  });
  it("retains manual snapshots without supplier evidence and refuses conversion without stock dimensions",()=>{
    const manual=assignment("worktop","2 099 Kč",4100,635);manual.customValues={};manual.snapshots.material!.unitPrice=123;
    expect(repairSupplierMaterialAssignment(manual)).toEqual(manual);
    const unknown=assignment("plinth","1 115,88 Kč",0,0);expect(repairSupplierMaterialAssignment(unknown).snapshots.material!.unitPrice).toBeNull();
  });
});
