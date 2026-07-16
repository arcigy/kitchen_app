import { describe, expect, it } from "vitest";
import type { ProjectSaveFile } from "../project-save/project-save-types";
import {
  createProjectWriteIdempotency,
  prepareProjectSaveWrite,
  ProjectIdempotencyConflictError,
  ProjectSaveRevisionConflictError,
  readIdempotencyKey
} from "./project-write-consistency";

function save(revision?: number, lastWrite?: { keyHash: string; requestHash: string }): ProjectSaveFile {
  return {
    integrity: {
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      savedAt: "2026-07-15T00:00:00.000Z",
      ...(revision === undefined ? {} : { saveRevision: revision }),
      ...(lastWrite ? { lastWrite } : {})
    }
  } as ProjectSaveFile;
}

describe("project write consistency", () => {
  it("canonicalizes request fields and scopes keys by tenant and route", () => {
    const first = createProjectWriteIdempotency({
      clientId: "client-a",
      scope: "save:project-1",
      key: "request-12345678",
      request: { b: 2, a: { d: 4, c: 3 } }
    });
    const reordered = createProjectWriteIdempotency({
      clientId: "client-a",
      scope: "save:project-1",
      key: "request-12345678",
      request: { a: { c: 3, d: 4 }, b: 2 }
    });
    const otherTenant = createProjectWriteIdempotency({
      clientId: "client-b",
      scope: "save:project-1",
      key: "request-12345678",
      request: { a: { c: 3, d: 4 }, b: 2 }
    });

    expect(reordered).toEqual(first);
    expect(otherTenant.keyHash).not.toBe(first.keyHash);
    expect(otherTenant.requestHash).toBe(first.requestHash);
  });

  it("validates public idempotency keys", () => {
    expect(readIdempotencyKey({ "idempotency-key": "save-request_1234" })).toBe("save-request_1234");
    expect(readIdempotencyKey({})).toBeNull();
    expect(() => readIdempotencyKey({ "idempotency-key": "short" })).toThrow("Idempotency-Key is invalid.");
  });

  it("increments the durable revision for a matching expected revision", () => {
    const result = prepareProjectSaveWrite({
      stored: save(3),
      incoming: save(),
      options: { expectedRevision: 3 }
    });

    expect(result.replayed).toBe(false);
    expect(result.save.integrity.saveRevision).toBe(4);
  });

  it("returns the stored result for an exact retry", () => {
    const idempotency = createProjectWriteIdempotency({
      clientId: "client-a",
      scope: "save:project-1",
      key: "request-12345678",
      request: { state: 1 }
    });
    const stored = save(2, idempotency);
    const result = prepareProjectSaveWrite({
      stored,
      incoming: save(),
      options: { expectedRevision: 1, idempotency }
    });

    expect(result).toEqual({ save: stored, replayed: true });
  });

  it("rejects stale writes and key reuse with a different payload", () => {
    expect(() => prepareProjectSaveWrite({
      stored: save(4),
      incoming: save(),
      options: { expectedRevision: 3 }
    })).toThrow(ProjectSaveRevisionConflictError);

    const idempotency = createProjectWriteIdempotency({
      clientId: "client-a",
      scope: "save:project-1",
      key: "request-12345678",
      request: { state: 1 }
    });
    expect(() => prepareProjectSaveWrite({
      stored: save(2, idempotency),
      incoming: save(),
      options: { idempotency: { ...idempotency, requestHash: "a".repeat(64) } }
    })).toThrow(ProjectIdempotencyConflictError);
  });
});
