import { applyMaterialAssignmentChanges, clearMaterialAssignment, copyMaterialToTarget, resolveMaterialEditTarget, type MaterialAssignmentChange, type MaterialEditTarget } from "../core/project-materials/project-material-edits";
import type { ProjectMaterialAssignment, ProjectMaterialsView } from "../core/project-materials/project-material-types";

export type MaterialEditCommand = "copy" | "cut" | "paste" | "delete" | "undo" | "redo";
type Args = {
  getView: () => ProjectMaterialsView;
  commit: (changes: MaterialAssignmentChange[]) => Promise<void>;
  notify: (message: string, tone: "success" | "error" | "info") => void;
  now: () => string;
};

/** Materials is a focused editing scope. All its keyboard mutations share this
 * transaction owner and the existing project-material persistence boundary. */
export function createMaterialAssignmentEditor(args: Args) {
  let clipboard: ProjectMaterialAssignment | null = null;
  const undo: MaterialAssignmentChange[] = [];
  const redo: MaterialAssignmentChange[] = [];
  let pending = Promise.resolve();
  let generation = 0;

  async function execute(command: MaterialEditCommand, target: MaterialEditTarget | null) {
    const currentGeneration = generation;
    if (command === "undo" || command === "redo") {
      const stack = command === "undo" ? undo : redo;
      const previous = stack.at(-1);
      if (!previous) { args.notify("Žiadna zmena materiálu na vrátenie.", "info"); return; }
      const change = command === "undo" ? { ...previous, before: previous.after, after: previous.before } : previous;
      await args.commit([change]);
      if (currentGeneration !== generation) return;
      stack.pop(); (command === "undo" ? redo : undo).push(previous);
      args.notify(command === "undo" ? "Zmena materiálu bola vrátená." : "Zmena materiálu bola obnovená.", "success");
      return;
    }
    if (!target) return;
    const view = args.getView();
    const resolved = resolveMaterialEditTarget(view, target);
    if (command === "copy" || command === "cut") {
      if (!resolved.assignment?.materialId && !resolved.assignment?.componentId) throw new Error("Vybraná položka nemá priradený materiál.");
      clipboard = structuredClone(resolved.assignment);
      if (command === "copy") { args.notify("Materiál je skopírovaný.", "success"); return; }
    }
    if (command === "paste" && !clipboard) throw new Error("Najprv skopírujte materiál pomocou Ctrl+C alebo Command+C.");
    if ((command === "delete" || command === "cut") && !resolved.assignment?.materialId && !resolved.assignment?.componentId) return;
    const after = command === "paste" && clipboard
      ? copyMaterialToTarget(clipboard, resolved.template, args.now())
      : clearMaterialAssignment(resolved.template, args.now());
    const before = view.assignments.assignments.find(item => item.assignmentId === resolved.assignmentId) ?? null;
    const change = { assignmentId: resolved.assignmentId, before: structuredClone(before), after };
    // Check locally before requesting a server transaction. No optimistic UI or
    // history entry can survive a failed request.
    applyMaterialAssignmentChanges(view.assignments, [change], view.assignments.revision, args.now());
    await args.commit([change]);
    if (currentGeneration !== generation) return;
    undo.push({ ...change, after: args.getView().assignments.assignments.find(item => item.assignmentId === change.assignmentId) ?? null });
    redo.length = 0;
    args.notify(command === "paste" ? "Materiál bol vložený." : command === "cut" ? "Materiál je vystrihnutý." : "Priradenie materiálu bolo vymazané.", "success");
  }

  return {
    execute(command: MaterialEditCommand, target: MaterialEditTarget | null): Promise<void> {
      const currentGeneration = generation;
      pending = pending.then(() => currentGeneration === generation ? execute(command, target) : undefined).catch(error => {
        if (currentGeneration === generation) args.notify(error instanceof Error ? error.message : "Zmenu materiálu sa nepodarilo uložiť.", "error");
      });
      return pending;
    },
    reset() { generation += 1; clipboard = null; undo.length = 0; redo.length = 0; }
  };
}
