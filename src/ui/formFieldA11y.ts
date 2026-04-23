let fieldCounter = 0;

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "field"
  );
}

function findFormControl(root: HTMLElement): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  if (root instanceof HTMLInputElement || root instanceof HTMLSelectElement || root instanceof HTMLTextAreaElement) {
    return root;
  }
  return root.querySelector("input, select, textarea");
}

export function bindLabelToControl(labelEl: HTMLLabelElement, fieldEl: HTMLElement, baseLabel: string) {
  const control = findFormControl(fieldEl);
  if (!control) return null;

  const base = `${slugify(baseLabel)}-${++fieldCounter}`;
  if (!control.id) control.id = `field-${base}`;
  if (!control.getAttribute("name")) control.setAttribute("name", `field-${base}`);
  if (!labelEl.htmlFor && !labelEl.contains(control)) labelEl.htmlFor = control.id;
  return control;
}
