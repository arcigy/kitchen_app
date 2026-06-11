import { vi } from "vitest";

type FakeListener = (event: Record<string, unknown>) => void;

export class FakeElement {
  accept = "";
  attributes = new Map<string, string>();
  checked = false;
  children: FakeElement[] = [];
  className = "";
  disabled = false;
  id = "";
  innerHTML = "";
  inputMode = "";
  isConnected = true;
  listeners = new Map<string, FakeListener[]>();
  max = "";
  min = "";
  name = "";
  placeholder = "";
  required = false;
  step = "";
  style: Record<string, string> = {};
  textContent = "";
  title = "";
  type = "";
  value = "";
  autocomplete = "";

  addEventListener(type: string, listener: FakeListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children: FakeElement[]) {
    this.children.push(...children);
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus() {
    // No-op for lightweight DOM tests.
  }

  remove() {
    this.isConnected = false;
  }

  querySelectorAll<T = FakeElement>(_selector: string): T[] {
    return [];
  }

  select() {
    // No-op for lightweight DOM tests.
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

export function installFakeDocument() {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      const element = new FakeElement();
      if (tagName === "input") element.type = "text";
      return element;
    },
    createTextNode: (text: string) => {
      const node = new FakeElement();
      node.textContent = text;
      return node;
    }
  });
}

export function makePropertiesPanelHarness() {
  const rows: Array<{ label: string; control: FakeElement }> = [];
  const section = new FakeElement() as FakeElement & HTMLElement;
  const props = {
    setTitle: vi.fn(),
    section: () => section,
    row: (_section: HTMLElement, label: string, control: HTMLElement) => {
      rows.push({ label, control: control as unknown as FakeElement });
      return new FakeElement() as FakeElement & HTMLElement;
    }
  };
  return { props, rows, section };
}
