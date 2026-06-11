export function createTextElement(text: string) {
  const element = document.createElement("div");
  element.textContent = text;
  return element;
}

export function createButtonElement(text: string, options: { type?: "button" | "submit" } = {}) {
  const button = document.createElement("button");
  button.type = options.type ?? "button";
  button.textContent = text;
  return button;
}

type SelectOptionValue = string | number;
type InputElementType = "text" | "number" | "password";

export function createInputElement(
  type: InputElementType,
  value: string,
  options: {
    autocomplete?: HTMLInputElement["autocomplete"];
    min?: string;
    max?: string;
    name?: string;
    placeholder?: string;
    required?: boolean;
    step?: string;
  } = {}
) {
  const input = document.createElement("input");
  input.type = type;
  if (options.autocomplete != null) input.autocomplete = options.autocomplete;
  if (options.min != null) input.min = options.min;
  if (options.max != null) input.max = options.max;
  if (options.name != null) input.name = options.name;
  if (options.step != null) input.step = options.step;
  if (options.placeholder != null) input.placeholder = options.placeholder;
  if (options.required != null) input.required = options.required;
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

export function createFileInputElement(accept: string) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
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
