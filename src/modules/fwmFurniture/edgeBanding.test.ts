import { describe,expect,it } from "vitest";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { getManufacturingAssembly } from "./manufacturingParts";
import { makeDefaultFwmFurnitureParams } from "./types";
import { calculateFwmFurnitureBOM } from "./calculation";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { BODY_EDGE_GROUP, FRONT_EDGE_GROUP, bindEdges, edgeGroup } from "../../core/edge-banding/edgeEntities";
import { ensureEdgeGroups, setRuntimeEdgeGroups, updateEdgeGroup } from "../../core/edge-banding/edgeGroups";
import { FWM_FURNITURE_SPECS } from "./definitions";
import { buildFwmFurniture } from "./geometry";
import { modulePreviewEdges } from "../../app/edgeBandingPreview";
import { ownModulePreviewResources } from "../../app/moduleSettingsResources";
const base=()=>({...makeDefaultFwmFurnitureParams("fwm_catalog_wall_cabinet"),width:600,height:750,depth:400,plinthHeight:0,requiresWorktop:false,worktopThicknessMm:0,shelfCount:2,doorCount:1,frontGap:2,sideGap:2});
describe("physical edge assignment through module pricing",()=>{
  it("moves one 746 mm door edge into the body group exactly once, removes another and adds a hidden 564 mm shelf edge",()=>{
    const catalog=getSystemSeedCatalog();const params=base();const {edges}=getManufacturingAssembly(params,catalog);
    const front=edges.filter(e=>e.defaultGroupId===FRONT_EDGE_GROUP&&Math.abs(e.lengthMm-746)<.01);
    const hiddenShelf=edges.find(e=>e.partId.includes("shelf")&&!e.defaultGroupId&&Math.abs(e.lengthMm-564)<.01)!;
    expect(front).toHaveLength(2);expect(hiddenShelf).toBeDefined();
    const adapter={kind:"module" as const,edges};
    const bindings=bindEdges(adapter,bindEdges(adapter,{},[front[0]!.id,hiddenShelf.id],BODY_EDGE_GROUP),[front[1]!.id],null);
    const result=calculateFwmFurnitureBOM({...params,edgeBandingOverrides:bindings},makeDefaultKitchenContext(catalog),catalog);
    const sum=(id:string)=>result.quoteBom.items.filter(i=>i.edgeGroupId===id).reduce((s,i)=>s+i.pricingQuantity,0);
    expect(sum(FRONT_EDGE_GROUP)).toBeCloseTo(1.192,4);
    expect(sum(BODY_EDGE_GROUP)).toBeCloseTo(3.756+.746+.564,4);
    expect(new Set(result.quoteBom.items.map(i=>i.id)).size).toBe(result.quoteBom.items.length);
  });
  it("prices a named group with its own material, including repeated module copies",()=>{
    const catalog=structuredClone(getSystemSeedCatalog());const material={...catalog.materials[0]!,id:"test.edge",materialType:"edge" as const,pricingUnit:"lm" as const,pricingBasis:"linear_length" as const,edgeFamily:"body" as const};catalog.materials.push(material);catalog.priceList.prices[material.id]=7;
    const id="material-assignment:edge-group:accent";
    const groups=updateEdgeGroup(ensureEdgeGroups(undefined,catalog),id,"Accent",material,catalog);setRuntimeEdgeGroups(catalog,groups);
    const params=base(),edges=getManufacturingAssembly(params,catalog).edges;
    const door=edges.filter(e=>e.defaultGroupId===FRONT_EDGE_GROUP);
    const bindings=bindEdges({kind:"module",edges},{},door.map(e=>e.id),id);
    const result=calculateFwmFurnitureBOM({...params,quantity:3,edgeBandingOverrides:bindings},makeDefaultKitchenContext(catalog),catalog);
    const rows=result.pricing.items.filter(i=>i.edgeGroupId===id);
    expect(rows.reduce((s,i)=>s+i.pricingQuantity,0)).toBeCloseTo(2.684*3,4);
    expect(rows.reduce((s,i)=>s+(i.itemCost??0),0)).toBeCloseTo(56.36,2);
    expect(rows.flatMap(i=>i.validationErrors??[])).toEqual([]);
  });
  it("does not charge a missing named group using an unrelated default edge price",()=>{
    const catalog=structuredClone(getSystemSeedCatalog()),params=base();
    const material={...catalog.materials[0]!,id:"test.default.edge",materialType:"edge" as const,pricingUnit:"lm" as const,pricingBasis:"linear_length" as const,edgeFamily:"front" as const};
    catalog.materials.push(material);catalog.priceList.prices[material.id]=99;
    const edge=getManufacturingAssembly(params,catalog).edges.find(e=>e.defaultGroupId===FRONT_EDGE_GROUP)!;
    const result=calculateFwmFurnitureBOM({...params,frontEdgeMaterialId:material.id,edgeBandingOverrides:{[edge.id]:"missing-accent"}},makeDefaultKitchenContext(catalog),catalog);
    const row=result.pricing.items.find(i=>i.edgeGroupId==="missing-accent")!;
    expect(row.itemCost).toBeNull();expect(row.validationErrors?.join(" ")).toContain("Chýba skupina");
  });
  it("prices a linear plinth by its 600 mm length while retaining physical area",()=>{
    const catalog=structuredClone(getSystemSeedCatalog());
    const material={...catalog.materials[0]!,id:"test.linear.plinth",materialType:"board" as const,boardFamily:"body" as const,pricingUnit:"lm" as const,pricingBasis:"linear_length" as const};
    catalog.materials.push(material);catalog.priceList.prices[material.id]=20;
    const params={...makeDefaultFwmFurnitureParams("fwm_catalog_base_doors"),requiresWorktop:false,worktopThicknessMm:0,width:600,plinthHeight:100,plinthMaterialId:material.id};
    const row=calculateFwmFurnitureBOM(params,makeDefaultKitchenContext(catalog),catalog).pricing.items.find(i=>i.itemType==="board"&&i.materialGroup==="plinth")!;
    expect(row.pricingUnit).toBe("lm");expect(row.pricingQuantity).toBe(.6);expect(row.itemCost).toBe(12);expect(row.metrics?.areaM2).toBe(.06);
    expect(row.validationErrors).toEqual([]);
  });
  it.each(FWM_FURNITURE_SPECS.map(spec=>[spec.moduleType] as const))("%s exposes unique selectable edges for the physical manufacturing assembly",type=>{
    const catalog=getSystemSeedCatalog();const params={...makeDefaultFwmFurnitureParams(type),requiresWorktop:false,worktopThicknessMm:0};
    const assembly=getManufacturingAssembly(params,catalog);
    expect(assembly.edges.length).toBeGreaterThan(0);expect(new Set(assembly.edges.map(e=>e.id)).size).toBe(assembly.edges.length);
    const root=buildFwmFurniture(params,catalog);const dispose=ownModulePreviewResources(root);
    try{const preview=modulePreviewEdges(root,params);expect(new Set(preview.map(e=>e.id))).toEqual(new Set(assembly.edges.map(e=>e.id)));
      for(const edge of preview)expect(edge.worldStart.distanceTo(edge.worldEnd)*1000).toBeCloseTo(edge.lengthMm,3);
    }finally{dispose();}
    const disabled=Object.fromEntries(assembly.edges.map(e=>[e.id,null]));
    expect(calculateFwmFurnitureBOM({...params,edgeBandingOverrides:disabled},makeDefaultKitchenContext(catalog),catalog).quoteBom.items.filter(i=>i.itemType==="edge_band")).toEqual([]);
    expect(assembly.edges.every(e=>edgeGroup(e,disabled)===null)).toBe(true);
  });
  it("plinth selection changes physical board and clip quantities while retaining legs",()=>{
    const catalog=getSystemSeedCatalog();const params={...makeDefaultFwmFurnitureParams("fwm_catalog_base_doors"),requiresWorktop:false,worktopThicknessMm:0,width:600,depth:560,height:800,plinthHeight:100,kitchenEndClosureLeft:false};
    const closed=getManufacturingAssembly(params,catalog),side=getManufacturingAssembly({...params,plinthFrontEnabled:false,plinthLeftEnabled:true},catalog);
    expect(closed.parts.filter(p=>p.role==="plinth").map(p=>p.id)).toEqual(["plinth-front-board"]);
    expect(side.parts.filter(p=>p.role==="plinth").map(p=>p.id)).toEqual(["plinth-side-return-boards"]);
    expect(side.parts.find(p=>p.role==="plinth")?.areaM2).toBeCloseTo((560-19-60)*100/1_000_000,4);
    expect(side.hardware.leg).toBe(closed.hardware.leg);expect(side.hardware.plinth_clip).toBe(2);
  });
});
