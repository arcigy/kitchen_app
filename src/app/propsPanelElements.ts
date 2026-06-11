export function createMutedText(text: string) {
  const element = document.createElement("div");
  element.className = "muted";
  element.textContent = text;
  return element;
}

export function appendMutedText(parent: HTMLElement, text: string) {
  const element = createMutedText(text);
  parent.appendChild(element);
  return element;
}
