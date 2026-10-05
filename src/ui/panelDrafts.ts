/** Retain edits across tabs and filters until their value is acknowledged by the server. */
export function createPanelDrafts(container: HTMLElement) {
  const drafts = new Map<string, { value: string; checked: boolean }>();
  const key = (input: HTMLInputElement) => input.id || [...input.attributes]
    .filter(attribute => attribute.name.startsWith("data-") && attribute.name !== "data-committed-value")
    .map(attribute => `${attribute.name}=${attribute.value}`).join("|");
  const fields = () => [...container.querySelectorAll<HTMLInputElement>("input:not([data-margin-search])")];
  return {
    capture() {
      for (const input of fields()) {
        const id = key(input);
        if (!id) continue;
        const dirty = input.type === "checkbox" ? input.checked !== input.defaultChecked
          : input.value !== (input.dataset.committedValue ?? input.defaultValue);
        if (dirty) drafts.set(id, { value: input.value, checked: input.checked });
        else drafts.delete(id);
      }
    },
    restore() {
      for (const input of fields()) {
        const id = key(input), draft = drafts.get(id);
        if (!draft) continue;
        const acknowledged = input.type === "checkbox" ? draft.checked === input.defaultChecked
          : draft.value === (input.dataset.committedValue ?? input.defaultValue);
        if (acknowledged) drafts.delete(id);
        else { input.value = draft.value; input.checked = draft.checked; }
      }
    }
  };
}
