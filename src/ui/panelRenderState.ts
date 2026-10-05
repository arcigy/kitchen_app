/** Keep user drafts and the actual scroll owner across a server-driven render. */
export function preservePanelRenderState(container: HTMLElement, footer?: HTMLElement): () => void {
  if (typeof HTMLElement === "undefined" || !(container instanceof HTMLElement)) return () => {};
  const roots = footer ? [container, footer] : [container];
  const fields = () => roots.flatMap(root => [...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>("input,select,button")]);
  const key = (element: HTMLElement) => [element.tagName, ...[...element.attributes]
    .filter(attribute => attribute.name.startsWith("data-") && attribute.name !== "data-committed-value")
    .map(attribute => `${attribute.name}=${attribute.value}`)].join("|");
  const drafts = new Map(fields().filter(element => element instanceof HTMLInputElement
    && (element.type === "checkbox" || element.type === "radio"
      ? element.checked !== element.defaultChecked
      : element.value !== (element.dataset.committedValue ?? element.defaultValue)))
    .map(element => [key(element), { value: element.value, checked: element instanceof HTMLInputElement && element.checked }]));
  const focused = document.activeElement;
  const focusKey = focused instanceof HTMLElement && roots.some(root => root.contains(focused)) ? key(focused) : null;
  const selection = focused instanceof HTMLInputElement && focused.type === "text"
    ? { start: focused.selectionStart, end: focused.selectionEnd } : null;
  const scrollOwners = [container, ...container.querySelectorAll<HTMLElement>("[data-margin-settings-scroll],.materials-settings-scroll")];
  const scroll = scrollOwners.map(owner => owner.scrollTop);
  return () => {
    for (const element of fields()) {
      const draft = drafts.get(key(element));
      if (draft && element instanceof HTMLInputElement) { element.value = draft.value; element.checked = draft.checked; }
      if (focusKey && key(element) === focusKey && !element.disabled) {
        element.focus({ preventScroll: true });
        if (selection && element instanceof HTMLInputElement && element.type === "text") element.setSelectionRange(selection.start, selection.end);
      }
    }
    [container, ...container.querySelectorAll<HTMLElement>("[data-margin-settings-scroll],.materials-settings-scroll")]
      .forEach((owner, index) => { owner.scrollTop = scroll[index] ?? 0; });
  };
}

export type PhasePanelState = { disabled?: boolean; loadingMessage?: string | null; error?: string | null };
