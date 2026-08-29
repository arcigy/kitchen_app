import { describe, expect, it } from "vitest";
import {
  clearLastWorkspacePointer,
  readLastWorkspacePointer,
  recoveryEnvelopeMatchesWriter,
  writeLastWorkspacePointer
} from "./projectRecoveryStore";
import type { ProjectRecoveryEnvelopeV1 } from "./projectRecoveryTypes";

function storage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

describe("last recovery workspace pointer", () => {
  it("is scoped to the authenticated tenant and user and clears synchronously", () => {
    const target = storage();
    const pointer = {
      version: 1,
      clientId: "client_1",
      userId: "user_1",
      workspaceId: "project:project_1",
      projectId: "project_1",
      updatedAt: "2026-08-10T10:00:00.000Z"
    } as const;

    writeLastWorkspacePointer(pointer, target);
    expect(readLastWorkspacePointer("client_1", "user_1", target)).toEqual(pointer);
    expect(readLastWorkspacePointer("client_2", "user_1", target)).toBeNull();
    expect(readLastWorkspacePointer("client_1", "user_2", target)).toBeNull();
    clearLastWorkspacePointer(target);
    expect(readLastWorkspacePointer("client_1", "user_1", target)).toBeNull();
  });

  it("matches conflict archival only to the exact lease owner and fencing token", () => {
    const envelope = {
      writer: { ownerId: "writer-new", fencingToken: 8 }
    } as ProjectRecoveryEnvelopeV1;

    expect(recoveryEnvelopeMatchesWriter(envelope, { ownerId: "writer-new", fencingToken: 8 })).toBe(true);
    expect(recoveryEnvelopeMatchesWriter(envelope, { ownerId: "writer-old", fencingToken: 8 })).toBe(false);
    expect(recoveryEnvelopeMatchesWriter(envelope, { ownerId: "writer-new", fencingToken: 7 })).toBe(false);
  });
});
