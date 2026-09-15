import { describe, expect, it, vi } from "vitest";
import { createEditorCommandRegistry } from "./editorCommandRegistry";

describe("editor command registry", () => {
  it("executes one shared command handler and reports state", async () => {
    const execute = vi.fn();
    const registry = createEditorCommandRegistry([
      { id: "move", group: "modify", label: "Move", execute, getState: () => ({ active: true }) }
    ]);

    expect(registry.getState("move")).toEqual({ active: true, available: true });
    expect(await registry.execute("move")).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not execute unavailable commands", async () => {
    const execute = vi.fn();
    const registry = createEditorCommandRegistry([
      { id: "delete", group: "modify", label: "Delete", execute, getState: () => ({ available: false }) }
    ]);

    expect(await registry.execute("delete")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("searches labels, groups, ids and keywords", () => {
    const registry = createEditorCommandRegistry([
      { id: "wall", group: "architecture", label: "Wall", keywords: ["partition"], execute: vi.fn() },
      { id: "bom", group: "file", label: "BOM", keywords: ["pricing"], execute: vi.fn() }
    ]);

    expect(registry.search("partition").map((item) => item.id)).toEqual(["wall"]);
    expect(registry.search("pricing").map((item) => item.id)).toEqual(["bom"]);
  });

  it("rejects duplicate command ids", () => {
    expect(() => createEditorCommandRegistry([
      { id: "select", group: "modify", label: "Select", execute: vi.fn() },
      { id: "select", group: "modify", label: "Select again", execute: vi.fn() }
    ])).toThrow("Duplicate editor command");
  });
});
