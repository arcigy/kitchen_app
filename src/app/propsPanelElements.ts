export function createTextElement(text: string) {
  const element = document.createElement("div");
  element.textContent = text;
  return element;
}

export function createSelectElement<T extends string>(value: T, options: Array<{ value: T; label: string }>) {
  const select = document.createElement("select");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = value;
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
