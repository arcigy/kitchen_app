import { actionIconMarkup, type ActionIconId } from "./actionIcons";

export type ContextMenuAction = {
  type?: "action";
  id: string;
  label: string;
  iconId?: ActionIconId;
  shortcut?: string;
  checked?: boolean;
  danger?: boolean;
  disabledReason?: string;
  execute: () => void | Promise<void>;
};

export type ContextMenuSeparator = {
  type: "separator";
  id: string;
};

export type ContextMenuSubmenu = {
  type: "submenu";
  id: string;
  label: string;
  iconId?: ActionIconId;
  items: ContextMenuItem[];
};

export type ContextMenuItem = ContextMenuAction | ContextMenuSeparator | ContextMenuSubmenu;

export type ContextMenuRequest = {
  clientX: number;
  clientY: number;
  sourceEvent: MouseEvent | KeyboardEvent;
  target: HTMLElement;
};

export type ContextMenuResolver = (request: ContextMenuRequest) => ContextMenuItem[];

export type ContextMenuController = {
  close: () => void;
  destroy: () => void;
  isOpen: () => boolean;
  openAt: (request: ContextMenuRequest, items: ContextMenuItem[]) => boolean;
  register: (element: HTMLElement, resolver: ContextMenuResolver) => () => void;
};

let appContextMenuController: ContextMenuController | null = null;

export function getAppContextMenuController(): ContextMenuController {
  appContextMenuController ??= createContextMenuController({
    onActionError: (error, action) => console.error(`Context menu action failed: ${action.id}`, error)
  });
  return appContextMenuController;
}

type CreateContextMenuControllerOptions = {
  document?: Document;
  window?: Window;
  onActionError?: (error: unknown, action: ContextMenuAction) => void;
};

export function createContextMenuController(options: CreateContextMenuControllerOptions = {}): ContextMenuController {
  const ownerDocument = options.document ?? document;
  const ownerWindow = options.window ?? window;
  let menuRoot: HTMLDivElement | null = null;
  let registeredElements = 0;
  const registeredResolver = new WeakMap<HTMLElement, ContextMenuResolver>();

  const close = () => {
    menuRoot?.remove();
    menuRoot = null;
  };

  const handleContextMenu = (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target || keepsNativeContextMenu(target)) return;
    const request: ContextMenuRequest = {
      clientX: event.clientX,
      clientY: event.clientY,
      sourceEvent: event,
      target
    };
    const items = resolveRegisteredItems(target, request);
    if (!hasActionableContent(items)) return;
    event.preventDefault();
    openAt(request, items);
  };

  const handleKeyboardContextMenu = (event: KeyboardEvent) => {
    if (!(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return;
    const target = ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null;
    if (!target || keepsNativeContextMenu(target)) return;
    const rect = target.getBoundingClientRect();
    const request: ContextMenuRequest = {
      clientX: Math.max(0, Math.min(ownerWindow.innerWidth - 1, rect.left + Math.min(rect.width, 24))),
      clientY: Math.max(0, Math.min(ownerWindow.innerHeight - 1, rect.top + Math.min(rect.height, 24))),
      sourceEvent: event,
      target
    };
    const items = resolveRegisteredItems(target, request);
    if (!hasActionableContent(items)) return;
    event.preventDefault();
    openAt(request, items);
  };

  const handleOutsidePointer = (event: PointerEvent) => {
    if (menuRoot && event.target instanceof Node && !menuRoot.contains(event.target)) close();
  };

  const handleViewportChange = () => close();

  ownerDocument.addEventListener("contextmenu", handleContextMenu);
  ownerDocument.addEventListener("keydown", handleKeyboardContextMenu);
  ownerDocument.addEventListener("pointerdown", handleOutsidePointer, true);
  ownerDocument.addEventListener("scroll", handleViewportChange, true);
  ownerWindow.addEventListener("resize", handleViewportChange);

  const openAt = (request: ContextMenuRequest, rawItems: ContextMenuItem[]) => {
    const items = normalizeItems(rawItems);
    if (!hasActionableContent(items)) return false;
    close();

    const root = ownerDocument.createElement("div");
    root.className = "arcigy-context-menu";
    root.setAttribute("role", "menu");
    root.setAttribute("aria-label", "Context actions");
    root.tabIndex = -1;
    root.addEventListener("contextmenu", (event) => event.preventDefault());
    root.addEventListener("keydown", (event) => handleMenuKeydown(event, root));
    renderItems(root, items, root);
    ownerDocument.body.append(root);
    menuRoot = root;
    clampToViewport(root, request.clientX, request.clientY, ownerWindow);
    focusFirstEnabled(root);
    return true;
  };

  const renderItems = (container: HTMLElement, items: ContextMenuItem[], root: HTMLDivElement) => {
    for (const item of normalizeItems(items)) {
      if (item.type === "separator") {
        const separator = ownerDocument.createElement("div");
        separator.className = "arcigy-context-menu__separator";
        separator.setAttribute("role", "separator");
        container.append(separator);
        continue;
      }

      if (item.type === "submenu") {
        const wrapper = ownerDocument.createElement("div");
        wrapper.className = "arcigy-context-menu__submenu-wrap";
        const button = createMenuButton(item.label, item.iconId, undefined, false, false);
        button.dataset.contextMenuSubmenu = item.id;
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        const arrow = ownerDocument.createElement("span");
        arrow.className = "arcigy-context-menu__submenu-arrow";
        arrow.textContent = "›";
        button.append(arrow);
        const submenu = ownerDocument.createElement("div");
        submenu.className = "arcigy-context-menu arcigy-context-menu--submenu";
        submenu.setAttribute("role", "menu");
        submenu.hidden = true;
        renderItems(submenu, item.items, root);
        const openSubmenu = () => {
          closeSiblingSubmenus(button);
          submenu.hidden = false;
          button.setAttribute("aria-expanded", "true");
          positionSubmenu(submenu, button, ownerWindow);
        };
        wrapper.addEventListener("pointerenter", openSubmenu);
        button.addEventListener("click", () => {
          openSubmenu();
          focusFirstEnabled(submenu);
        });
        wrapper.append(button, submenu);
        container.append(wrapper);
        continue;
      }

      const action = item;
      const button = createMenuButton(action.label, action.iconId, action.shortcut, !!action.danger, !!action.disabledReason);
      button.dataset.contextMenuAction = action.id;
      if (action.disabledReason) {
        button.disabled = true;
        button.title = action.disabledReason;
        button.setAttribute("aria-description", action.disabledReason);
      }
      if (action.checked !== undefined) {
        button.setAttribute("role", "menuitemcheckbox");
        button.setAttribute("aria-checked", String(action.checked));
        button.classList.toggle("is-checked", action.checked);
      }
      button.addEventListener("click", async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.classList.add("is-busy");
        button.setAttribute("aria-busy", "true");
        try {
          await action.execute();
          close();
        } catch (error) {
          button.disabled = false;
          button.classList.remove("is-busy");
          button.removeAttribute("aria-busy");
          options.onActionError?.(error, action);
        }
      });
      container.append(button);
    }
  };

  const createMenuButton = (
    label: string,
    iconId: ActionIconId | undefined,
    shortcut: string | undefined,
    danger: boolean,
    disabled: boolean
  ) => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "arcigy-context-menu__item";
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    if (danger) button.classList.add("is-danger");
    if (disabled) button.classList.add("is-disabled");

    const icon = ownerDocument.createElement("span");
    icon.className = "arcigy-context-menu__icon";
    if (iconId) icon.innerHTML = actionIconMarkup(iconId);
    const text = ownerDocument.createElement("span");
    text.className = "arcigy-context-menu__label";
    text.textContent = label;
    button.append(icon, text);
    if (shortcut) {
      const shortcutNode = ownerDocument.createElement("span");
      shortcutNode.className = "arcigy-context-menu__shortcut";
      shortcutNode.textContent = shortcut;
      button.append(shortcutNode);
    }
    return button;
  };

  const handleMenuKeydown = (event: KeyboardEvent, root: HTMLDivElement) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    const current = event.target instanceof HTMLButtonElement ? event.target : null;
    const activeMenu = current?.parentElement?.closest<HTMLElement>("[role='menu']") ?? root;
    const buttons = enabledDirectButtons(activeMenu);
    if (!buttons.length) return;
    const index = current ? buttons.indexOf(current) : -1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[nextIndex]?.focus();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && current) {
      event.preventDefault();
      current.click();
      return;
    }
    if (event.key === "ArrowRight" && current?.dataset.contextMenuSubmenu) {
      event.preventDefault();
      current.click();
      return;
    }
    if (event.key === "ArrowLeft" && activeMenu !== root) {
      event.preventDefault();
      const parentButton = activeMenu.parentElement?.querySelector<HTMLButtonElement>(":scope > .arcigy-context-menu__item");
      activeMenu.hidden = true;
      parentButton?.setAttribute("aria-expanded", "false");
      parentButton?.focus();
    }
  };

  const register = (element: HTMLElement, resolver: ContextMenuResolver) => {
    registeredResolver.set(element, resolver);
    registeredElements += 1;
    return () => {
      if (registeredResolver.get(element) === resolver) {
        registeredResolver.delete(element);
        registeredElements = Math.max(0, registeredElements - 1);
      }
      close();
    };
  };

  const destroy = () => {
    close();
    ownerDocument.removeEventListener("contextmenu", handleContextMenu);
    ownerDocument.removeEventListener("keydown", handleKeyboardContextMenu);
    ownerDocument.removeEventListener("pointerdown", handleOutsidePointer, true);
    ownerDocument.removeEventListener("scroll", handleViewportChange, true);
    ownerWindow.removeEventListener("resize", handleViewportChange);
    registeredElements = 0;
  };

  function resolveRegisteredItems(target: HTMLElement, request: ContextMenuRequest): ContextMenuItem[] {
    let current: HTMLElement | null = target;
    while (current) {
      const resolver = registeredResolver.get(current);
      if (resolver) {
        const items = resolver(request);
        if (hasActionableContent(items)) return items;
      }
      current = current.parentElement;
    }
    return [];
  }

  return { close, destroy, isOpen: () => !!menuRoot, openAt, register };
}

function keepsNativeContextMenu(target: HTMLElement): boolean {
  return !!target.closest("input, textarea, [contenteditable=''], [contenteditable='true']");
}

function normalizeItems(items: ContextMenuItem[]): ContextMenuItem[] {
  const normalized: ContextMenuItem[] = [];
  for (const item of items) {
    if (item.type === "submenu") {
      const childItems = normalizeItems(item.items);
      if (!hasActionableContent(childItems)) continue;
      normalized.push({ ...item, items: childItems });
      continue;
    }
    if (item.type === "separator") {
      if (!normalized.length || normalized.at(-1)?.type === "separator") continue;
    }
    normalized.push(item);
  }
  while (normalized.at(-1)?.type === "separator") normalized.pop();
  return normalized;
}

function hasActionableContent(items: ContextMenuItem[]): boolean {
  return items.some((item) => item.type !== "separator" && (item.type !== "submenu" || hasActionableContent(item.items)));
}

function enabledDirectButtons(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.children).flatMap((child) => {
    if (child instanceof HTMLButtonElement) return child.disabled ? [] : [child];
    if (child instanceof HTMLElement && child.classList.contains("arcigy-context-menu__submenu-wrap")) {
      const button = child.querySelector<HTMLButtonElement>(":scope > .arcigy-context-menu__item");
      return button && !button.disabled ? [button] : [];
    }
    return [];
  });
}

function focusFirstEnabled(menu: HTMLElement): void {
  enabledDirectButtons(menu)[0]?.focus();
}

function closeSiblingSubmenus(button: HTMLButtonElement): void {
  const parentMenu = button.closest<HTMLElement>("[role='menu']");
  if (!parentMenu) return;
  for (const submenu of parentMenu.querySelectorAll<HTMLElement>(":scope > .arcigy-context-menu__submenu-wrap > .arcigy-context-menu--submenu")) {
    if (submenu.parentElement?.contains(button)) continue;
    submenu.hidden = true;
    submenu.parentElement?.querySelector(":scope > .arcigy-context-menu__item")?.setAttribute("aria-expanded", "false");
  }
}

function clampToViewport(element: HTMLElement, x: number, y: number, ownerWindow: Window): void {
  const gap = 6;
  element.style.left = `${Math.max(gap, x)}px`;
  element.style.top = `${Math.max(gap, y)}px`;
  const rect = element.getBoundingClientRect();
  element.style.left = `${Math.max(gap, Math.min(x, ownerWindow.innerWidth - rect.width - gap))}px`;
  element.style.top = `${Math.max(gap, Math.min(y, ownerWindow.innerHeight - rect.height - gap))}px`;
}

function positionSubmenu(submenu: HTMLElement, button: HTMLElement, ownerWindow: Window): void {
  const buttonRect = button.getBoundingClientRect();
  submenu.style.left = `${buttonRect.width - 2}px`;
  submenu.style.top = "-4px";
  submenu.hidden = false;
  const submenuRect = submenu.getBoundingClientRect();
  if (submenuRect.right > ownerWindow.innerWidth - 6) submenu.style.left = `${-submenuRect.width + 2}px`;
  if (submenuRect.bottom > ownerWindow.innerHeight - 6) submenu.style.top = `${ownerWindow.innerHeight - submenuRect.bottom - 6}px`;
}
