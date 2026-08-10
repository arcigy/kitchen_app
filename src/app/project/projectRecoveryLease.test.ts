import { describe, expect, it } from "vitest";
import { createProjectRecoveryLease } from "./projectRecoveryLease";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

describe("project recovery single-writer lease", () => {
  it("keeps a second tab read-only until expiry or an explicit takeover", () => {
    const storage = memoryStorage();
    let now = 1_000;
    const scope = { clientId: "client_1", userId: "user_1", workspaceId: "project:project_1", projectId: "project_1" };
    const first = createProjectRecoveryLease({ scope, storage, now: () => now, ownerId: "tab-a" });
    const second = createProjectRecoveryLease({ scope, storage, now: () => now, ownerId: "tab-b" });

    expect(first.acquire()).toBe(true);
    expect(first.fencingToken()).toBe(1);
    expect(second.acquire()).toBe(false);
    expect(first.isOwner()).toBe(true);
    now += 6_001;
    expect(second.acquire()).toBe(true);
    expect(second.fencingToken()).toBe(2);
    expect(first.isOwner()).toBe(false);
    expect(first.acquire(true)).toBe(true);
    expect(first.fencingToken()).toBe(3);
    expect(second.isOwner()).toBe(false);
    first.release();
    expect(first.isOwner()).toBe(false);
  });
});
