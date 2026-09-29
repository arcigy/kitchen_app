import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import { ensureEdgeGroups, updateEdgeGroup } from "./edgeGroups";
import { applyEdgeGroupChanges, edgeGroupChangesBetween, mergeEdgeGroupChanges, parseEdgeGroupChanges } from "./edgeGroupTransaction";
import { assertFullSaveMaterialAssignmentsAllowed } from "../project-materials/project-material-save-authority";
const catalog = {clientId:"edge-test",...createSystemCatalogSeed()};
const base = () => ensureEdgeGroups(undefined, catalog);
describe("atomic edge group transactions", () => {
  it("merges only the edited group and retains concurrent corpus and other group choices", () => {
    const before=base(), draft=updateEdgeGroup(before,"edge-new","Accent",null,catalog);
    const concurrent=updateEdgeGroup(before,"edge-other","Other",null,catalog);
    concurrent.assignments.find(a=>a.category==="corpus")!.customValues.note="Preserve";
    const result=mergeEdgeGroupChanges(concurrent,before,draft);
    expect(result.assignments.find(a=>a.assignmentId==="edge-new")?.customValues.edgeGroupName).toBe("Accent");
    expect(result.assignments.find(a=>a.assignmentId==="edge-other")?.customValues.edgeGroupName).toBe("Other");
    expect(result.assignments.find(a=>a.category==="corpus")?.customValues.note).toBe("Preserve");
    expect(result.revision).toBe(concurrent.revision+1);
  });
  it("rejects changes to the same group, preserving both inputs", () => {
    const before=base(), id="material-assignment:edge_other";
    const draft=updateEdgeGroup(before,id,"Draft",null,catalog), concurrent=updateEdgeGroup(before,id,"Other window",null,catalog);
    const copy=structuredClone(concurrent);
    expect(()=>mergeEdgeGroupChanges(concurrent,before,draft)).toThrow(/medzitým/);
    expect(concurrent).toEqual(copy);
  });
  it("allows idempotent acknowledgement and the inverse edit after project undo", () => {
    const before=base(), draft=updateEdgeGroup(before,"edge-new","Accent",null,catalog);
    const changes=edgeGroupChangesBetween(before,draft), saved=applyEdgeGroupChanges(before,changes);
    expect(applyEdgeGroupChanges(saved,changes)).toEqual(saved);
    const undone=applyEdgeGroupChanges(saved,edgeGroupChangesBetween(saved,before));
    expect(undone.assignments).toEqual(before.assignments);
    expect(undone.revision).toBe(saved.revision+1);
  });
  it("does not permit general materials through an edge request or an obsolete repository revision", () => {
    const before=base(), draft=updateEdgeGroup(before,"edge-new","Accent",null,catalog);
    const corpus=before.assignments.find(a=>a.category==="corpus")!;
    expect(()=>parseEdgeGroupChanges([{before:null,after:corpus}])).toThrow(/Only edge/);
    const changes=parseEdgeGroupChanges(edgeGroupChangesBetween(before,draft));
    const next=applyEdgeGroupChanges(before,changes);
    expect(()=>assertFullSaveMaterialAssignmentsAllowed(before,next,"edge-groups",before.revision)).not.toThrow();
    expect(()=>assertFullSaveMaterialAssignmentsAllowed(before,next,"edge-groups",before.revision+1)).toThrow();
    next.assignments.find(a=>a.category==="corpus")!.customValues.forged=true;
    expect(()=>assertFullSaveMaterialAssignmentsAllowed(before,next,"edge-groups",before.revision)).toThrow();
  });
});
