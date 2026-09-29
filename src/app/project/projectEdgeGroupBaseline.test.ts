import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { ensureEdgeGroups, updateEdgeGroup } from "../../core/edge-banding/edgeGroups";
import { confirmProjectEdgeGroups, pendingProjectEdgeGroups } from "./projectEdgeGroupBaseline";
describe("confirmed edge group save baseline",()=>{
  it("tracks new edits, acknowledged saves and global undo without touching another project",()=>{
    const catalog={clientId:"edge-test",...createSystemCatalogSeed()},base=ensureEdgeGroups(undefined,catalog);
    const next=updateEdgeGroup(base,"edge-new","Accent",null,catalog);
    confirmProjectEdgeGroups("project-a",base);
    expect(pendingProjectEdgeGroups("project-a",next)).toHaveLength(1);
    confirmProjectEdgeGroups("project-a",next);
    expect(pendingProjectEdgeGroups("project-a",next)).toEqual([]);
    expect(pendingProjectEdgeGroups("project-a",base)).toEqual([{before:next.assignments.find(a=>a.assignmentId==="edge-new"),after:null}]);
    expect(pendingProjectEdgeGroups("project-b",next)).toHaveLength(1);
  });
});
