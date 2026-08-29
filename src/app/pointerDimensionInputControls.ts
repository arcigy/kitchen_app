export type DimensionInputElement = {
  focus: () => void;
  select: () => void;
  value: string;
  style: {
    background: string;
    border: string;
    borderRadius: string;
    caretColor: string;
    color: string;
    display: string;
    fontSize: string;
    height: string;
    left: string;
    outline: string;
    padding: string;
    pointerEvents: string;
    position: string;
    top: string;
    transform: string;
    width: string;
    zIndex: string;
  };
};

export type DimensionEditInputElement = DimensionInputElement & {
  autocomplete: string;
  blur: () => void;
  id: string;
  inputMode: string;
  name: string;
  placeholder: string;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (type: "pointerdown" | "keydown" | "blur", listener: (ev: Event | KeyboardEvent | PointerEvent) => void) => void;
  type: string;
};

export type DimensionEditInputDocument<T extends DimensionEditInputElement = DimensionEditInputElement> = {
  createElement: (tagName: "input") => T;
};

export type DimensionEditInputHost<T extends DimensionEditInputElement = DimensionEditInputElement> = {
  appendChild: (input: T) => unknown;
};

type DimensionEditInputArgs = {
  ariaLabel: string;
  id: string;
  name?: string;
  onCommit: () => void;
  onHide: () => void;
};

export function parseDimensionMillimeters(raw: string): number | null {
  const value = Number(String(raw).trim().replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function applyDimensionInputStyle(input: DimensionInputElement) {
  input.style.position = "absolute";
  input.style.display = "none";
  input.style.pointerEvents = "auto";
  input.style.zIndex = "18";
  input.style.width = "76px";
  input.style.height = "22px";
  input.style.borderRadius = "7px";
  input.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  input.style.background = "#0f1117";
  input.style.color = "#ffffff";
  input.style.caretColor = "#ffffff";
  input.style.padding = "0 6px";
  input.style.fontSize = "12px";
  input.style.outline = "none";
  input.style.transform = "translate(-50%, -50%)";
}

export function showDimensionInputAtPointer(
  input: DimensionInputElement,
  args: { clientX: number; clientY: number; hostLeft: number; hostTop: number; value: string }
) {
  input.value = args.value;
  input.style.left = `${args.clientX - args.hostLeft}px`;
  input.style.top = `${args.clientY - args.hostTop}px`;
  input.style.display = "block";
  input.focus();
  input.select();
}

export function showDimensionInputForPointerEvent(
  input: DimensionInputElement,
  args: {
    event: Pick<PointerEvent, "clientX" | "clientY">;
    host: { getBoundingClientRect: () => Pick<DOMRect, "left" | "top"> };
    value: string;
  }
) {
  const hostRect = args.host.getBoundingClientRect();
  showDimensionInputAtPointer(input, {
    clientX: args.event.clientX,
    clientY: args.event.clientY,
    hostLeft: hostRect.left,
    hostTop: hostRect.top,
    value: args.value
  });
}

export function createDimensionEditInput(
  doc: Document,
  host: HTMLElement,
  args: DimensionEditInputArgs
): HTMLInputElement;
export function createDimensionEditInput<T extends DimensionEditInputElement>(
  doc: DimensionEditInputDocument<T>,
  host: DimensionEditInputHost<T>,
  args: DimensionEditInputArgs
): T;
export function createDimensionEditInput(
  doc: Document | DimensionEditInputDocument,
  host: HTMLElement | DimensionEditInputHost,
  args: DimensionEditInputArgs
) {
  const input = doc.createElement("input") as DimensionEditInputElement;
  input.id = args.id;
  input.name = args.name ?? args.id;
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";
  input.placeholder = "mm";
  input.setAttribute("aria-label", args.ariaLabel);
  applyDimensionInputStyle(input);

  const hide = () => {
    input.style.display = "none";
    args.onHide();
  };

  input.addEventListener("pointerdown", (ev) => {
    ev.stopPropagation();
  });
  input.addEventListener("keydown", (ev) => {
    const key = (ev as KeyboardEvent).key;
    if (key === "Enter") {
      args.onCommit();
      input.blur();
      ev.preventDefault();
    } else if (key === "Escape") {
      hide();
      input.blur();
      ev.preventDefault();
    }
  });
  input.addEventListener("blur", hide);

  (host as DimensionEditInputHost<DimensionEditInputElement>).appendChild(input);
  return input;
}
