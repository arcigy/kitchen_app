import { getAppContextMenuController, type ContextMenuController } from "./contextMenu";

export function registerModuleCatalogContextMenu(
  host: HTMLElement,
  menu: ContextMenuController = getAppContextMenuController()
): () => void {
  return menu.register(host, (request) => {
    const button = request.target.closest<HTMLButtonElement>("button[data-module-type], .module-catalog-worktop");
    if (!button) return [];
    if (button.classList.contains("module-catalog-worktop")) {
      return [{
        id: "catalog-draw-worktop",
        label: "Draw worktop",
        disabledReason: button.disabled ? "Open a kitchen for editing first." : undefined,
        execute: () => button.click()
      }];
    }
    return [{
      id: "catalog-place-module",
      label: "Place module",
      iconId: "cabinet",
      disabledReason: button.disabled ? "Open a kitchen for editing first." : undefined,
      execute: () => button.click()
    }];
  });
}
