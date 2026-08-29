import { describe, expect, it } from "vitest";
import { AssistantChatThreadStore, assistantChatStorageKey } from "./chatThreadStore";

describe("assistant chat thread storage", () => {
  it("keeps independent project threads and restores safe multi-turn memory", () => {
    const storage = new Map<string, string>();
    const adapter: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key), clear: () => storage.clear(), key: () => null, get length() { return storage.size; }
    };
    const first = new AssistantChatThreadStore("project_a", "phase_1", adapter);
    const thread = first.create();
    first.append(thread.id, { role: "user", content: "Navrhni kuchyňu pri okne." });
    first.append(thread.id, { role: "assistant", content: "## Plán\n\n- Najprv prečítam scénu." });

    const restored = new AssistantChatThreadStore("project_a", "phase_1", adapter).get(thread.id);
    expect(restored?.title).toContain("Navrhni kuchyňu");
    expect(restored?.messages).toHaveLength(2);
    expect(new AssistantChatThreadStore("project_b", "phase_1", adapter).list()).toEqual([]);
    expect(assistantChatStorageKey("project_a", "phase_1")).not.toBe(assistantChatStorageKey("project_b", "phase_1"));
  });
});
