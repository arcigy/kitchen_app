import { describe, expect, it } from "vitest";
import type { ProjectMetadata } from "./project-types";
import {
  assertProjectOperationReplay,
  attachProjectOperationReceipt,
  deterministicProjectId,
  readProjectOperationReceipt,
  stripProjectOperationReceipt,
  type ProjectOperationReceipt
} from "./project-operation-idempotency";
import { ProjectIdempotencyConflictError } from "./project-write-consistency";

const metadata = { projectId: "project-1", name: "Private" } as ProjectMetadata;
const receipt: ProjectOperationReceipt = {
  operation: "import",
  keyHash: "a".repeat(64),
  requestHash: "b".repeat(64)
};

describe("project operation idempotency", () => {
  it("keeps receipts internal while allowing exact replay", () => {
    const stored = attachProjectOperationReceipt(metadata, receipt);
    expect(readProjectOperationReceipt(stored)).toEqual(receipt);
    expect(assertProjectOperationReplay(stored, receipt)).toEqual(metadata);
    expect(stripProjectOperationReceipt(stored)).toEqual(metadata);
    expect(JSON.stringify(stripProjectOperationReceipt(stored))).not.toContain("arcigyOperationReceipt");
  });

  it("rejects key reuse with a different request hash", () => {
    const stored = attachProjectOperationReceipt(metadata, receipt);
    expect(() => assertProjectOperationReplay(stored, { ...receipt, requestHash: "c".repeat(64) }))
      .toThrow(ProjectIdempotencyConflictError);
  });

  it("derives a tenant-scoped safe project id from the already-scoped key hash", () => {
    expect(deterministicProjectId("import", receipt)).toBe(`import_${"a".repeat(32)}`);
  });
});
