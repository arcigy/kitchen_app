import { getCurrentLanguage, setCurrentLanguage, t, type AppLanguage } from "../i18n";

type MenuAction = {
  type?: "action";
  label: string;
  onSelect: () => void | Promise<void>;
  checked?: boolean;
};

type MenuSeparator = {
  type: "separator";
};

type MenuSubmenu = {
  type: "submenu";
  label: string;
  items: MenuItem[];
};

type MenuItem = MenuAction | MenuSeparator | MenuSubmenu;

type FileMenuActions = {
  save: () => void | Promise<void>;
  saveAs: () => void | Promise<void>;
  exportLayoutJson: () => void | Promise<void>;
  exportSceneJson: () => void | Promise<void>;
  exportPng: () => void | Promise<void>;
  copyJson: () => void | Promise<void>;
  onLanguageChange?: (language: AppLanguage) => void;
};

export function attachFileMenu(anchor: HTMLElement, actions: FileMenuActions) {
  let menuEl: HTMLDivElement | null = null;

  const closeMenu = () => {
    menuEl?.remove();
    menuEl = null;
    anchor.classList.remove("open");
  };

  const openMenu = () => {
    closeMenu();
    anchor.classList.add("open");
    menuEl = renderMenu(buildItems(actions), false, closeMenu);
    menuEl.classList.add("app-menu-root");
    document.body.appendChild(menuEl);
    const rect = anchor.getBoundingClientRect();
    menuEl.style.left = `${rect.left}px`;
    menuEl.style.top = `${rect.bottom - 1}px`;
  };

  anchor.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menuEl) closeMenu();
    else openMenu();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node | null;
    if (!target) return;
    if (menuEl?.contains(target) || anchor.contains(target)) return;
    closeMenu();
  });

  return { closeMenu, openMenu };
}

function buildItems(actions: FileMenuActions): MenuItem[] {
  const currentLanguage = getCurrentLanguage();
  return [
    { label: t("Save"), onSelect: actions.save },
    { label: t("Save As…"), onSelect: actions.saveAs },
    { type: "separator" },
    { label: t("Export Layout JSON…"), onSelect: actions.exportLayoutJson },
    { label: t("Export Scene JSON…"), onSelect: actions.exportSceneJson },
    { label: t("Export PNG Snapshot…"), onSelect: actions.exportPng },
    { label: t("Copy JSON to Clipboard"), onSelect: actions.copyJson },
    {
      type: "submenu",
      label: t("Settings"),
      items: [
        {
          type: "submenu",
          label: t("Language"),
          items: [
            {
              label: t("English"),
              checked: currentLanguage === "en",
              onSelect: () => {
                setCurrentLanguage("en");
                actions.onLanguageChange?.("en");
              }
            },
            {
              label: t("Slovak"),
              checked: currentLanguage === "sk",
              onSelect: () => {
                setCurrentLanguage("sk");
                actions.onLanguageChange?.("sk");
              }
            }
          ]
        }
      ]
    }
  ];
}

function renderMenu(items: MenuItem[], nested: boolean, closeMenu: () => void): HTMLDivElement {
  const menu = document.createElement("div");
  menu.className = `app-menu${nested ? " app-menu--nested" : ""}`;

  for (const item of items) {
    if (item.type === "separator") {
      const separator = document.createElement("div");
      separator.className = "app-menu-separator";
      menu.appendChild(separator);
      continue;
    }

    if (item.type === "submenu") {
      const row = document.createElement("div");
      row.className = "app-menu-item app-menu-item--submenu";

      const label = document.createElement("span");
      label.textContent = item.label;
      row.appendChild(label);

      const arrow = document.createElement("span");
      arrow.className = "app-menu-arrow";
      arrow.textContent = "›";
      row.appendChild(arrow);

      const submenu = renderMenu(item.items, false, closeMenu);
      submenu.classList.add("app-menu-submenu");
      row.appendChild(submenu);
      menu.appendChild(row);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-menu-item";
    button.addEventListener("click", async () => {
      await item.onSelect();
      closeMenu();
    });

    const label = document.createElement("span");
    label.textContent = item.label;
    button.appendChild(label);

    const check = document.createElement("span");
    check.className = "app-menu-check";
    check.textContent = item.checked ? "✓" : "";
    button.appendChild(check);

    menu.appendChild(button);
  }

  return menu;
}
