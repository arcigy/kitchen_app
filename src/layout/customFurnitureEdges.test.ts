import { describe, expect, it } from "vitest";
import { Group,Line } from "three";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { bindEdges } from "../core/edge-banding/edgeEntities";
import { ensureEdgeGroups,updateEdgeGroup,setRuntimeEdgeGroups } from "../core/edge-banding/edgeGroups";
import { customBoardEdges } from "./customFurnitureEdges";
import { createCustomFurnitureBOM } from "./bom/customFurniturePricing";
import { duplicateAttachedCustomFurnitureParams } from "./customFurnitureAttachments";
import type { CustomFurnitureBoardParams,CustomFurnitureInstance } from "./customFurnitureTypes";
const board=():CustomFurnitureBoardParams=>({id:"triangle",name:"Triangle",kind:"custom",workplane:{type:"horizontal",elevationMm:1000},profile:[{x:0,y:0},{x:300,y:0},{x:0,y:400}],thicknessMm:18,materialId:"board",baseConstraint:"projectBase",baseOffsetMm:0,topConstraint:"absolute",topOffsetMm:0,justification:"positive",edgeBanding:[]});
describe("custom boards share edge groups with modules",()=>{
  it("bills a 300/400/500 triangle perimeter exactly once, without filling a missing price from an unrelated material",()=>{
    const catalog={clientId:"edge-test",...createSystemCatalogSeed()};
    const material={...catalog.materials[0]!,id:"test.edge",materialType:"edge" as const,pricingBasis:"linear_length" as const,pricingUnit:"lm" as const,edgeFamily:"body" as const};
    catalog.materials.push(material);catalog.priceList.prices[material.id]=10;
    const id="material-assignment:edge-group:shared";const state=updateEdgeGroup(ensureEdgeGroups(undefined,catalog),id,"Shared",material,catalog);setRuntimeEdgeGroups(catalog,state);
    const panel=board(),edges=customBoardEdges(panel);panel.edgeBandingOverrides=bindEdges({kind:"custom-board",edges},{},edges.map(e=>e.id),id);
    const furniture:CustomFurnitureInstance={id:"custom",params:{name:"Custom",baseConstraint:"projectBase",baseOffsetMm:0,topConstraint:"absolute",topOffsetMm:1000,boundary:[{x:0,z:0},{x:300,z:0},{x:0,z:400}],boards:[panel]},root:new Group(),boardsRoot:new Group(),boundaryLine:new Line(),boardObjects:[]};
    let bom=createCustomFurnitureBOM(furniture,catalog);
    expect(bom.pricing.items.filter(i=>i.edgeGroupId===id).map(i=>i.itemCost).sort((a,b)=>a!-b!)).toEqual([3,4,5]);
    const hypotenuse=edges.find(e=>e.lengthMm===500)!;panel.edgeBandingOverrides[hypotenuse.id]=null;
    bom=createCustomFurnitureBOM(furniture,catalog);expect(bom.pricing.items.filter(i=>i.itemType==="edge_band").reduce((s,i)=>s+i.pricingQuantity,0)).toBe(.7);
    panel.edgeBandingOverrides=bindEdges({kind:"custom-board",edges},{},[hypotenuse.id],"missing-group");
    expect(createCustomFurnitureBOM(furniture,catalog).pricing.items.find(i=>i.edgeGroupId==="missing-group")?.itemCost).toBeNull();
  });
  it("keeps independent collinear profile edges and remaps copied board IDs without changing groups",()=>{
    const panel=board();panel.profile=[{x:0,y:0},{x:100,y:0},{x:300,y:0},{x:300,y:400},{x:0,y:400}];panel.edgeBanding=[{edgeIndex:0,materialId:"red"},{edgeIndex:1,materialId:"blue"}];
    const edges=customBoardEdges(panel);expect(edges).toHaveLength(5);expect(new Set(edges.filter(e=>e.defaultGroupId).map(e=>e.defaultGroupId)).size).toBe(2);
    panel.edgeBandingOverrides={[edges[0]!.id]:"shared"};panel.cabinetAttachment={cabinetId:"m1",side:"left",offsetMm:0,startOverhangMm:0,endOverhangMm:0,followDimensions:[]};
    const params={name:"Attached",baseConstraint:"projectBase" as const,baseOffsetMm:0,topConstraint:"absolute" as const,topOffsetMm:1000,boundary:[{x:0,z:0},{x:300,z:0},{x:0,z:400}],boards:[panel]};
    const copied=duplicateAttachedCustomFurnitureParams([{id:"custom",params}],"m1","m2",{x:1500,z:100})[0]!.boards[0]!;
    expect(Object.values(copied.edgeBandingOverrides!)).toEqual(["shared"]);
    expect(customBoardEdges(copied).some(e=>Object.hasOwn(copied.edgeBandingOverrides!,e.id))).toBe(true);
    expect(panel.cabinetAttachment.cabinetId).toBe("m1");
  });
});
