export function createTextElement(text: string) {
  const element = document.createElement("div");
  element.textContent = text;
  return element;
}

type SelectOptionValue = string | number;
type InputElementType = "text" | "number";

export function createInputElement(type: InputElementType, value: string, options: { step?: string; placeholder?: string } = {}) {
  const input = document.createElement("input");
  input.type = type;
  if (options.step != null) input.step = options.step;
  if (options.placeholder != null) input.placeholder = options.placeholder;
  input.value = value;
  return input;
}

export function createCheckboxElement(checked: boolean) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  return input;
}

export function createRangeElement(value: string, options: { min: string; max: string; step: string }) {
  const input = document.createElement("input");
  input.type = "range";
  input.min = options.min;
  input.max = options.max;
  input.step = options.step;
  input.value = value;
  return input;
}

export function createSelectElement<T extends SelectOptionValue>(value: T, options: Array<{ value: T; label: string }>) {
  const select = document.createElement("select");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = String(option.value);
    item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = String(value);
  return select;
}

export function createMutedText(text: string) {
  const element = createTextElement(text);
  element.className = "muted";
  return element;
}

export function appendMutedText(parent: HTMLElement, text: string) {
  const element = createMutedText(text);
  parent.appendChild(element);
  return element;
}
