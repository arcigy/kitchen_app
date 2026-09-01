import type {
  EditorCommandDescriptor,
  EditorCommandGroup,
  EditorCommandId,
  EditorCommandRegistry
} from "../app/editorCommandRegistry";
import { createResponsiveWorkspaceController } from "../app/responsiveWorkspaceController";
import { t } from "../i18n";

type MobilePanel = "commands" | "properties" | "catalog" | "project" | null;

const GROUP_LABELS: Record<EditorCommandGroup, string> = {
  file: "File",
  architecture: "Architecture",
  kitchen: "Kitchen",
  "living-wall": "Living Wall",
  room: "Room",
  modify: "Modify",
  visualisation: "Visualisation",
  view: "View"
};

function commandButton(command: EditorCommandDescriptor, registry: EditorCommandRegistry) {
  const state = registry.getState(command.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "arcigy-mobile-command";
  button.dataset.mobileCommand = command.id;
  button.disabled = !state.available;
  button.setAttribute("aria-pressed", String(state.active));
  button.title = state.disabledReason ?? t(command.label);
  if (command.iconSvg) {
    const icon = document.createElement("span");
    icon.className = "arcigy-mobile-command__icon";
    icon.innerHTML = command.iconSvg;
    button.appendChild(icon);
  }
  const label = document.createElement("span");
  label.textContent = t(command.label);
  button.appendChild(label);
  return button;
}

export function mountMobileWorkspaceShell(args: {
  root: HTMLElement;
  registry: EditorCommandRegistry;
  openProjectManager: () => void;
  saveProject?: () => void | Promise<void>;
  getActiveToolLabel?: () => string;
  getMobileAdditiveSelection?: () => boolean;
  setMobileAdditiveSelection?: (enabled: boolean) => void;
}) {
  const header = args.root.querySelector<HTMLElement>("[data-mobile-header]");
  const dock = args.root.querySelector<HTMLElement>("[data-mobile-dock]");
  const scrim = args.root.querySelector<HTMLButtonElement>("[data-mobile-scrim]");
  const commandSheet = args.root.querySelector<HTMLElement>("[data-mobile-command-sheet]");
  const commandList = args.root.querySelector<HTMLElement>("[data-mobile-command-list]");
  const commandSearch = args.root.querySelector<HTMLInputElement>("[data-mobile-command-search]");
  const properties = args.root.querySelector<HTMLElement>("#properties");
  const catalog = args.root.querySelector<HTMLElement>("#moduleCatalog");
  const project = args.root.querySelector<HTMLElement>(".archux-bottom");
  const activeTool = args.root.querySelector<HTMLElement>("[data-mobile-active-tool]");
  if (!header || !dock || !scrim || !commandSheet || !commandList || !commandSearch || !activeTool) return null;
  const commandListEl = commandList;
  const projectTitle = header.querySelector<HTMLElement>(".arcigy-mobile-header__title strong");
  const syncProjectTitle = () => {
    const desktopTitle = args.root.querySelector<HTMLElement>(".revit-projectlabel")?.textContent?.trim();
    if (desktopTitle && projectTitle) projectTitle.textContent = desktopTitle;
  };
  const titleObserver = new MutationObserver(syncProjectTitle);
  const desktopProjectLabel = args.root.querySelector<HTMLElement>(".revit-projectlabel");
  if (desktopProjectLabel) titleObserver.observe(desktopProjectLabel, { childList: true, characterData: true, subtree: true });
  syncProjectTitle();

  const responsive = createResponsiveWorkspaceController(args.root);
  let panel: MobilePanel = null;

  const panelElement = (value: MobilePanel) => {
    if (value === "commands") return commandSheet;
    if (value === "properties") return properties;
    if (value === "catalog") return catalog;
    if (value === "project") return project;
    return null;
  };

  const syncPanel = () => {
    for (const element of [commandSheet, properties, catalog, project]) element?.classList.remove("arcigy-mobile-sheet--open");
    panelElement(panel)?.classList.add("arcigy-mobile-sheet--open");
    scrim.hidden = panel == null;
    args.root.dataset.mobilePanel = panel ?? "none";
    dock.querySelectorAll<HTMLButtonElement>("[data-mobile-panel]").forEach((button) => {
      button.setAttribute("aria-expanded", String(button.dataset.mobilePanel === panel));
    });
  };

  const closePanel = () => {
    panel = null;
    syncPanel();
  };

  const openPanel = (next: Exclude<MobilePanel, null>) => {
    panel = panel === next ? null : next;
    syncPanel();
    if (panel === "commands") {
      syncMultiSelect();
      renderCommands(commandSearch.value);
      window.setTimeout(() => commandSearch.focus({ preventScroll: true }), 0);
    }
  };

  const run = async (id: EditorCommandId) => {
    if (await args.registry.execute(id)) {
      activeTool.textContent = args.getActiveToolLabel?.() ?? t(args.registry.get(id)?.label ?? "Select");
      if (id === "kitchen-catalog") openPanel("catalog");
      else if (id === "room-catalog" || id === "living-wall-catalog") {
        panel = "commands";
        syncPanel();
        renderCommands("");
      } else closePanel();
    }
  };

  function renderCommands(query = "") {
    commandListEl.replaceChildren();
    const matches = args.registry.search(query);
    for (const group of Object.keys(GROUP_LABELS) as EditorCommandGroup[]) {
      const commands = matches.filter((command) => command.group === group);
      if (commands.length === 0) continue;
      const section = document.createElement("section");
      section.className = "arcigy-mobile-command-group";
      const title = document.createElement("h3");
      title.textContent = t(GROUP_LABELS[group]);
      section.appendChild(title);
      const grid = document.createElement("div");
      for (const command of commands) {
        const button = commandButton(command, args.registry);
        button.addEventListener("click", () => void run(command.id));
        grid.appendChild(button);
      }
      section.appendChild(grid);
      commandListEl.appendChild(section);
    }
    if (!query.trim()) {
      const ribbonButtons = [...args.root.querySelectorAll<HTMLButtonElement>(".topbar-classic-ribbon .tool-btn")]
        .filter((button) => !button.disabled);
      if (ribbonButtons.length > 0) {
        const section = document.createElement("section");
        section.className = "arcigy-mobile-command-group";
        const title = document.createElement("h3");
        title.textContent = t("Current catalog");
        const grid = document.createElement("div");
        ribbonButtons.forEach((source) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "arcigy-mobile-command";
          const sourceIcon = source.querySelector<HTMLElement>(".tool-icon");
          if (sourceIcon) {
            const icon = document.createElement("span");
            icon.className = "arcigy-mobile-command__icon";
            icon.innerHTML = sourceIcon.innerHTML;
            button.appendChild(icon);
          }
          const label = document.createElement("span");
          label.textContent = source.querySelector<HTMLElement>(".tool-label")?.textContent ?? source.title;
          button.appendChild(label);
          button.addEventListener("click", () => {
            source.click();
            closePanel();
          });
          grid.appendChild(button);
        });
        section.append(title, grid);
        commandListEl.appendChild(section);
      }
    }
    if (commandListEl.childElementCount === 0) {
      const empty = document.createElement("p");
      empty.className = "arcigy-mobile-command-empty";
      empty.textContent = t("No matching commands");
      commandListEl.appendChild(empty);
    }
  }

  const saveButton = header.querySelector<HTMLButtonElement>("[data-mobile-save]");
  const saveStatus = header.querySelector<HTMLElement>(".arcigy-mobile-header__title span");
  header.querySelector<HTMLButtonElement>("[data-mobile-projects]")?.addEventListener("click", args.openProjectManager);
  saveButton?.addEventListener("click", () => {
    if (!args.saveProject) return;
    saveButton.disabled = true;
    if (saveStatus) saveStatus.textContent = t("Saving…");
    void Promise.resolve(args.saveProject())
      .then(() => { if (saveStatus) saveStatus.textContent = t("Saved"); })
      .catch(() => { if (saveStatus) saveStatus.textContent = t("Save failed"); })
      .finally(() => { saveButton.disabled = false; });
  });
  dock.querySelector<HTMLButtonElement>("[data-mobile-command='undo']")?.addEventListener("click", () => void run("undo"));
  dock.querySelector<HTMLButtonElement>("[data-mobile-command='redo']")?.addEventListener("click", () => void run("redo"));
  dock.querySelectorAll<HTMLButtonElement>("[data-mobile-panel]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.mobilePanel as Exclude<MobilePanel, null>));
  });
  scrim.addEventListener("click", closePanel);
  commandSheet.querySelector<HTMLButtonElement>("[data-mobile-sheet-close]")?.addEventListener("click", closePanel);
  commandSheet.querySelector<HTMLButtonElement>("[data-mobile-project-overview]")?.addEventListener("click", () => openPanel("project"));
  const multiSelectButton = commandSheet.querySelector<HTMLButtonElement>("[data-mobile-multi-select]");
  const syncMultiSelect = () => {
    multiSelectButton?.setAttribute("aria-pressed", String(args.getMobileAdditiveSelection?.() ?? false));
  };
  multiSelectButton?.addEventListener("click", () => {
    args.setMobileAdditiveSelection?.(!(args.getMobileAdditiveSelection?.() ?? false));
    syncMultiSelect();
    closePanel();
  });
  commandSearch.addEventListener("input", () => renderCommands(commandSearch.value));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel) closePanel();
  });

  const workspaceMenu = header.querySelector<HTMLElement>("[data-mobile-workspace-menu]");
  const workspaceToggle = header.querySelector<HTMLButtonElement>("[data-mobile-workspace-toggle]");
  const setWorkspaceMenuOpen = (open: boolean) => {
    if (!workspaceMenu || !workspaceToggle) return;
    workspaceMenu.hidden = !open;
    workspaceToggle.setAttribute("aria-expanded", String(open));
  };
  const syncWorkspaceSelection = (id?: string) => {
    const activeId = id ?? args.root.querySelector<HTMLButtonElement>("[data-workspace-nav].active")?.dataset.workspaceNav;
    if (!activeId) return;
    const source = args.root.querySelector<HTMLButtonElement>(`[data-workspace-nav="${activeId}"]`);
    const label = source?.querySelector("span")?.textContent?.trim();
    if (label && workspaceToggle) workspaceToggle.textContent = `${label} ▾`;
    workspaceMenu?.querySelectorAll<HTMLButtonElement>("[data-mobile-workspace]").forEach((button) => {
      const selected = button.dataset.mobileWorkspace === activeId;
      button.setAttribute("aria-current", selected ? "page" : "false");
    });
  };
  workspaceToggle?.addEventListener("click", () => setWorkspaceMenuOpen(workspaceMenu?.hidden ?? true));
  workspaceMenu?.querySelectorAll<HTMLButtonElement>("[data-mobile-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      const workspaceId = button.dataset.mobileWorkspace;
      const target = workspaceId
        ? args.root.querySelector<HTMLButtonElement>(`[data-workspace-nav="${workspaceId}"]`)
        : null;
      target?.click();
      syncWorkspaceSelection(workspaceId);
      setWorkspaceMenuOpen(false);
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (workspaceMenu?.hidden || header.contains(event.target as Node)) return;
    setWorkspaceMenuOpen(false);
  });

  args.registry.subscribe(() => {
    if (panel === "commands") renderCommands(commandSearch.value);
  });
  responsive.subscribe((state) => {
    if (state.profile === "desktop") closePanel();
  });
  activeTool.textContent = args.getActiveToolLabel?.() ?? t("Select");
  syncWorkspaceSelection();
  syncMultiSelect();
  renderCommands();
  syncPanel();
  return {
    closePanel,
    openPanel,
    responsive,
    dispose: () => {
      titleObserver.disconnect();
      responsive.dispose();
    }
  };
}
