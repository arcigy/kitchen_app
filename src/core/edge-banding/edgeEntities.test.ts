import { describe, expect, it } from "vitest";
import { bindEdges, contourEdgeEntities, edgeGroup, orphanEdgeBindings, readEdgeBindings } from "./edgeEntities";
const rect=(width=600,height=750)=>{
  const points=[{x:0,y:0,z:0},{x:width,y:0,z:0},{x:width,y:height,z:0},{x:0,y:height,z:0}];
  return contourEdgeEntities("panel",points.map((a,i)=>({a,b:points[(i+1)%4]!})));
};
describe("edge entity identity and exclusive membership",()=>{
  it("measures four physical edges independently of triangulation",()=>{
    expect(rect().map(e=>e.lengthMm).sort((a,b)=>a-b)).toEqual([600,600,750,750]);
    expect(new Set(rect().map(e=>e.id)).size).toBe(4);
  });
  it("preserves IDs through resize and explicitly removes rather than restores a default",()=>{
    const before=rect(),after=rect(900,1200);
    expect(after.map(e=>e.id)).toEqual(before.map(e=>e.id));
    const adapter={kind:"module" as const,edges:before};
    const one=bindEdges(adapter,{},[before[0]!.id],"red");
    const two=bindEdges(adapter,one,[before[0]!.id],"blue");
    expect(Object.values(two)).toEqual(["blue"]);
    expect(edgeGroup({...after[0]!,defaultGroupId:"green"},bindEdges(adapter,two,[before[0]!.id],null))).toBeNull();
    expect(one[before[0]!.id]).toBe("red");
  });
  it("reports changed topology instead of applying a former rectangle edge to a triangle",()=>{
    const triangle=contourEdgeEntities("panel",[{a:{x:0,y:0,z:0},b:{x:300,y:0,z:0}},{a:{x:300,y:0,z:0},b:{x:0,y:400,z:0}},{a:{x:0,y:400,z:0},b:{x:0,y:0,z:0}}]);
    expect(triangle.reduce((s,e)=>s+e.lengthMm,0)).toBe(1200);
    expect(orphanEdgeBindings({kind:"module",edges:triangle},{[rect()[0]!.id]:"group"})).toHaveLength(1);
    expect(()=>bindEdges({kind:"module",edges:triangle},{},[rect()[0]!.id],"group")).toThrow();
  });
  it("rejects malformed persisted bindings and open contours",()=>{
    expect(()=>readEdgeBindings({edge:5})).toThrow();expect(()=>readEdgeBindings([])).toThrow();
    expect(()=>contourEdgeEntities("broken",[{a:{x:0,y:0,z:0},b:{x:100,y:0,z:0}}])).toThrow();
  });
});
