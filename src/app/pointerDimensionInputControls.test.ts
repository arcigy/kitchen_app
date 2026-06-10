import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import {
  applyDimensionInputStyle,
  createDimensionEditInput,
  parseDimensionMillimeters,
  showDimensionInputAtPointer,
  showDimensionInputForPointerEvent
} from "./pointerDimensionInputControls";

describe("pointer dimension input controls", () => {
  function makeInput() {
    let focused = false;
    let selected = false;
    return {
      focus: () => {
        focused = true;
      },
      isFocused: () => focused,
      isSelected: () => selected,
      select: () => {
        selected = true;
      },
      value: "",
      style: {
        background: "",
        border: "",
        borderRadius: "",
        caretColor: "",
        color: "",
        display: "",
        fontSize: "",
        height: "",
        left: "",
        outline: "",
        padding: "",
        pointerEvents: "",
        position: "",
        top: "",
        transform: "",
        width: "",
        zIndex: ""
      }
    };
  }

  function makeEditInput() {
    const listeners = new Map<string, Array<(ev: Event | KeyboardEvent | PointerEvent) => void>>();
    const attributes = new Map<string, string>();
    const input = {
      ...makeInput(),
      autocomplete: "",
      blur: vi.fn(() => {
        for (const listener of listeners.get("blur") ?? []) listener({} as Event);
      }),
      dispatch: (type: string, ev: Event | KeyboardEvent | PointerEvent) => {
        for (const listener of listeners.get(type) ?? []) listener(ev);
      },
      getAttributeValue: (name: string) => attributes.get(name),
      id: "",
      inputMode: "",
      name: "",
      placeholder: "",
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
      addEventListener: (type: "pointerdown" | "keydown" | "blur", listener: (ev: Event | KeyboardEvent | PointerEvent) => void) => {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      },
      type: ""
    };
    return input;
  }

  it("parses dimension millimeters using the current input sanitation", () => {
    expect(parseDimensionMillimeters("123")).toBe(123);
    expect(parseDimensionMillimeters("123,6 mm")).toBe(124);
    expect(parseDimensionMillimeters(" -12.4 ")).toBe(-12);
    expect(parseDimensionMillimeters("abc")).toBe(0);
    expect(parseDimensionMillimeters("")).toBe(0);
  });

  it("applies the shared dimension input style", () => {
    const input = makeInput();

    applyDimensionInputStyle(input);

    expect(input.style.position).toBe("absolute");
    expect(input.style.display).toBe("none");
    expect(input.style.pointerEvents).toBe("auto");
    expect(input.style.zIndex).toBe("18");
    expect(input.style.width).toBe("76px");
    expect(input.style.height).toBe("22px");
    expect(input.style.borderRadius).toBe("7px");
    expect(input.style.border).toBe("1px solid rgba(36, 40, 54, 0.95)");
    expect(input.style.background).toBe("#0f1117");
    expect(input.style.color).toBe("#ffffff");
    expect(input.style.caretColor).toBe("#ffffff");
    expect(input.style.padding).toBe("0 6px");
    expect(input.style.fontSize).toBe("12px");
    expect(input.style.outline).toBe("none");
    expect(input.style.transform).toBe("translate(-50%, -50%)");
  });

  it("shows the dimension input at the pointer relative to the host", () => {
    const input = makeInput();

    showDimensionInputAtPointer(input, {
      clientX: 145,
      clientY: 260,
      hostLeft: 20,
      hostTop: 30,
      value: "900"
    });

    expect(input.value).toBe("900");
    expect(input.style.left).toBe("125px");
    expect(input.style.top).toBe("230px");
    expect(input.style.display).toBe("block");
    expect(input.isFocused()).toBe(true);
    expect(input.isSelected()).toBe(true);
  });

  it("shows the dimension input from a pointer event relative to the host rect", () => {
    const input = makeInput();

    showDimensionInputForPointerEvent(input, {
      event: { clientX: 312, clientY: 418 },
      host: {
        getBoundingClientRect: () => ({ left: 100, top: 80 })
      },
      value: "720"
    });

    expect(input.value).toBe("720");
    expect(input.style.left).toBe("212px");
    expect(input.style.top).toBe("338px");
    expect(input.style.display).toBe("block");
    expect(input.isFocused()).toBe(true);
    expect(input.isSelected()).toBe(true);
  });

  it("creates a shared dimension edit input with current attributes and host append", () => {
    const input = makeEditInput();
    const host = { appendChild: vi.fn() };

    const result = createDimensionEditInput(
      { createElement: () => input },
      host,
      {
        ariaLabel: "Window dimension in millimeters",
        id: "window-dimension-edit",
        onCommit: vi.fn(),
        onHide: vi.fn()
      }
    );

    expect(result).toBe(input);
    expect(input.id).toBe("window-dimension-edit");
    expect(input.name).toBe("window-dimension-edit");
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("numeric");
    expect(input.autocomplete).toBe("off");
    expect(input.placeholder).toBe("mm");
    expect(input.getAttributeValue("aria-label")).toBe("Window dimension in millimeters");
    expect(input.style.display).toBe("none");
    expect(host.appendChild).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("keeps dimension edit pointerdown inside the input", () => {
    const input = makeEditInput();
    createDimensionEditInput({ createElement: () => input }, { appendChild: vi.fn() }, {
      ariaLabel: "Door dimension in millimeters",
      id: "door-dimension-edit",
      onCommit: vi.fn(),
      onHide: vi.fn()
    });
    const ev = { stopPropagation: vi.fn() } as unknown as PointerEvent;

    input.dispatch("pointerdown", ev);

    expect(ev.stopPropagation).toHaveBeenCalledOnce();
  });

  it("commits and blurs the dimension edit input on Enter", () => {
    const input = makeEditInput();
    const onCommit = vi.fn();
    const onHide = vi.fn();
    createDimensionEditInput({ createElement: () => input }, { appendChild: vi.fn() }, {
      ariaLabel: "Door dimension in millimeters",
      id: "door-dimension-edit",
      onCommit,
      onHide
    });
    const ev = { key: "Enter", preventDefault: vi.fn() } as unknown as KeyboardEvent;

    input.dispatch("keydown", ev);

    expect(onCommit).toHaveBeenCalledOnce();
    expect(input.blur).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledOnce();
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });

  it("hides and blurs the dimension edit input on Escape", () => {
    const input = makeEditInput();
    const onCommit = vi.fn();
    const onHide = vi.fn();
    createDimensionEditInput({ createElement: () => input }, { appendChild: vi.fn() }, {
      ariaLabel: "Door dimension in millimeters",
      id: "door-dimension-edit",
      onCommit,
      onHide
    });
    input.style.display = "block";
    const ev = { key: "Escape", preventDefault: vi.fn() } as unknown as KeyboardEvent;

    input.dispatch("keydown", ev);

    expect(input.style.display).toBe("none");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.blur).toHaveBeenCalledOnce();
    expect(onHide).toHaveBeenCalledTimes(2);
    expect(ev.preventDefault).toHaveBeenCalledOnce();
  });
});
