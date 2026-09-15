/** A module edit is private until its existing layout command accepts it. */
export function createModuleSettingsSession<P extends Record<string, unknown>>(initial: P, options: {
  prepare: (candidate: P, sourceKey?: string) => P;
  commit: (candidate: P, baseline: P) => P;
}) {
  let baseline = structuredClone(initial);
  let states = [structuredClone(initial)];
  let index = 0;
  const equal = (a: P, b: P) => JSON.stringify(a) === JSON.stringify(b);
  const current = () => structuredClone(states[index]!);
  return {
    current,
    get dirty() { return !equal(states[index]!, baseline); },
    get canUndo() { return index > 0; },
    get canRedo() { return index < states.length - 1; },
    change(candidate: P, sourceKey?: string) {
      const next = options.prepare(structuredClone(candidate), sourceKey);
      if (!equal(next, states[index]!)) {
        states = [...states.slice(0, index + 1), structuredClone(next)];
        index += 1;
      }
      return current();
    },
    undo() { if (index > 0) index -= 1; return current(); },
    redo() { if (index < states.length - 1) index += 1; return current(); },
    save() {
      if (equal(states[index]!, baseline)) return current();
      // Do not advance the baseline when validation/build/layout commit throws.
      const accepted = options.commit(current(), structuredClone(baseline));
      baseline = structuredClone(accepted);
      states = [structuredClone(accepted)];
      index = 0;
      return current();
    }
  };
}

/** Keep the object identity held by existing module controls, including removed keys. */
export function replaceModuleSettings<P extends Record<string, unknown>>(target: P, value: P): void {
  for (const key of Object.keys(target)) if (!(key in value)) delete target[key];
  Object.assign(target, structuredClone(value));
}
