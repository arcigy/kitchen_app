import { parseLocalizedSupplierAmount, parseSupplierPriceBasis } from "../supplier-bridge/supplier-price";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState } from "./project-material-types";

/** Deterministic repair from the saved supplier observation, never today's catalog.
 * Only known board-unit bugs are repaired; manual prices without evidence survive. */
export function repairSupplierMaterialAssignment(input:ProjectMaterialAssignment):ProjectMaterialAssignment {
  const snapshot=input.snapshots.material;
  const raw=input.customValues.supplierBridge;
  if(!snapshot||!raw||typeof raw!=="object"||Array.isArray(raw)||snapshot.definition.materialType!=="board")return input;
  if(!["worktop","plinth"].includes(input.category))return input;
  const metadata=snapshot.definition.metadata??{};
  const width=Number(metadata.supplierWidthMm),length=Number(metadata.supplierLengthMm);
  const amount=typeof raw.rawPriceText==="string"?parseLocalizedSupplierAmount(raw.rawPriceText):null;
  const basis=typeof raw.rawUnitText==="string"?parseSupplierPriceBasis(raw.rawUnitText):"unknown";
  if(amount===null)return input;
  let price:number|null=null;
  if(basis==="m2")price=amount;
  else if((basis==="piece"||basis==="sheet")&&width>0&&length>0)price=amount/(width*length/1e6);
  if(price===null||!Number.isFinite(price))return input;
  const next=structuredClone(input);const target=next.snapshots.material!;
  target.unitPrice=price;target.definition.pricingUnit="m2";target.definition.pricingBasis="sheet_area";
  if(input.category==="worktop"&&(basis==="piece"||basis==="sheet")) {
    target.definition.metadata={...target.definition.metadata,worktopPurchaseIncrement:0.5};
  }
  next.customValues.supplierBridge={...raw,normalizedAmount:price,normalizedPriceBasis:"m2",normalizationCalculation:basis==="m2"?"Saved supplier price per m²":`${amount} / (${width} * ${length} / 1000000) = ${price}`};
  return next;
}
export function repairSupplierMaterialPricing(state:ProjectMaterialAssignmentsState):ProjectMaterialAssignmentsState {
  return {...state,assignments:state.assignments.map(repairSupplierMaterialAssignment)};
}
