import { describe, expect, it, vi } from "vitest";
import { createModuleSettingsSession, replaceModuleSettings } from "./moduleSettingsSession";

describe("module settings transaction", () => {
  const setup = () => {
    const live = { height: 780, nested: { shelf: 2 }, preset: "original" };
    const prepare = vi.fn((candidate: typeof live) => {
      if (candidate.height < 100) throw new Error("invalid height");
      return candidate;
    });
    const commit = vi.fn((candidate: typeof live) => { Object.assign(live, candidate); return live; });
    return { live, prepare, commit, session: createModuleSettingsSession(live, { prepare, commit }) };
  };
  it("isolates nested edits and preset changes from live data and project history", () => {
    const { live, commit, session } = setup();
    const draft = session.current(); draft.nested.shelf = 5; draft.preset = "second";
    session.change(draft);
    expect(live).toEqual({ height: 780, nested: { shelf: 2 }, preset: "original" });
    expect(commit).not.toHaveBeenCalled(); expect(session.dirty).toBe(true);
    const snapshot = session.current(); snapshot.nested.shelf = 10;
    expect(session.current().nested.shelf).toBe(5);
  });
  it("keeps undo and redo local, and saves all edits as one command", () => {
    const { session, commit, live } = setup();
    session.change({ ...session.current(), height: 900 });
    session.change({ ...session.current(), height: 1000 });
    expect(session.undo().height).toBe(900); expect(live.height).toBe(780);
    expect(session.redo().height).toBe(1000);
    session.save(); expect(commit).toHaveBeenCalledTimes(1); expect(live.height).toBe(1000);
    expect(session.dirty).toBe(false); expect(session.canUndo).toBe(false);
    session.save(); expect(commit).toHaveBeenCalledTimes(1);
    session.change({ ...session.current(), height: 1100 }); session.undo(); expect(session.dirty).toBe(false);
  });
  it("retains the last valid preview and unsaved state after validation or commit failures", () => {
    const { session, commit } = setup();
    session.change({ ...session.current(), height: 900 });
    expect(() => session.change({ ...session.current(), height: -1 })).toThrow();
    expect(session.current().height).toBe(900);
    commit.mockImplementationOnce(() => { throw new Error("overlap"); });
    expect(() => session.save()).toThrow("overlap"); expect(session.dirty).toBe(true);
    session.save(); expect(session.dirty).toBe(false);
  });
  it("replaces nested state and removes obsolete keys without replacing the form object", () => {
    const target: Record<string, unknown> = { keep: 1, remove: 2 };
    const next = { keep: 3, nested: { a: 1 } };
    replaceModuleSettings(target, next); next.nested.a = 9;
    expect(target).toEqual({ keep: 3, nested: { a: 1 } });
  });
});
