type ToolButtonArgs = {
  title: string;
  iconSvg: string;
  label?: string;
  variant?: "success" | "danger";
  onClick?: () => void;
};

type ChromeTabArgs = {
  id?: string;
  label: string;
  active?: boolean;
  accent?: boolean;
  onClick?: () => void;
};

type ChromeArgs = {
  title: string;
  projectLabel?: string;
  tabs: ChromeTabArgs[];
};

type AddRowArgs = {
  title?: string;
  className?: string;
};

type AddGroupArgs = {
  row?: HTMLElement;
};

export function createTopbar(container: HTMLElement) {
  container.innerHTML = "";
  container.style.position = "relative";

  const chrome = document.createElement("div");
  chrome.className = "revit-chrome";
  container.appendChild(chrome);

  const titlebar = document.createElement("div");
  titlebar.className = "revit-titlebar";
  chrome.appendChild(titlebar);

  const brand = document.createElement("div");
  brand.className = "revit-brand";
  brand.textContent = "K";
  titlebar.appendChild(brand);

  const title = document.createElement("div");
  title.className = "revit-windowtitle";
  titlebar.appendChild(title);

  const project = document.createElement("div");
  project.className = "revit-projectlabel";
  titlebar.appendChild(project);

  const tabs = document.createElement("div");
  tabs.className = "revit-tabs";
  chrome.appendChild(tabs);
  const tabMap = new Map<string, HTMLButtonElement>();

  const rows = document.createElement("div");
  rows.className = "topbar-rows";
  chrome.appendChild(rows);

  const setChrome = (args: ChromeArgs) => {
    title.textContent = args.title;
    project.textContent = args.projectLabel ?? "";
    tabs.innerHTML = "";
    tabMap.clear();

    for (const tab of args.tabs) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = ["revit-tab", tab.active ? "active" : "", tab.accent ? "accent" : ""].filter(Boolean).join(" ");
      el.textContent = tab.label;
      if (tab.onClick) el.addEventListener("click", tab.onClick);
      if (tab.id) tabMap.set(tab.id, el);
      tabs.appendChild(el);
    }
  };

  const addRow = (args: AddRowArgs = {}) => {
    const wrap = document.createElement("div");
    wrap.className = ["topbar-row-wrap", args.className].filter(Boolean).join(" ");

    if (args.title) {
      const title = document.createElement("div");
      title.className = "topbar-row-title";
      title.textContent = args.title;
      wrap.appendChild(title);
    }

    const row = document.createElement("div");
    row.className = "topbar";
    wrap.appendChild(row);
    rows.appendChild(wrap);
    return row;
  };

  const clear = () => {
    rows.innerHTML = "";
  };

  const getRow = (row?: HTMLElement) => row ?? rows.querySelector<HTMLElement>(".topbar") ?? addRow();

  const addGroup = (title?: string, args: AddGroupArgs = {}) => {
    const g = document.createElement("div");
    g.className = "topbar-group";
    getRow(args.row).appendChild(g);

    if (title) {
      const t = document.createElement("div");
      t.className = "topbar-group-title";
      t.textContent = title;
      g.appendChild(t);
    }

    const tools = document.createElement("div");
    tools.className = "topbar-tools";
    g.appendChild(tools);
    return tools;
  };

  const addSpacer = (args: AddGroupArgs = {}) => {
    const s = document.createElement("div");
    s.style.flex = "1 1 auto";
    getRow(args.row).appendChild(s);
  };

  const toolButton = (toolsEl: HTMLElement, args: ToolButtonArgs) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = ["tool-btn", args.label ? "has-label" : "", args.variant ?? ""].filter(Boolean).join(" ");
    btn.title = args.title;
    btn.setAttribute("aria-label", args.title);

    const icon = document.createElement("div");
    icon.className = "tool-icon";
    icon.innerHTML = args.iconSvg;
    btn.appendChild(icon);

    if (args.label) {
      const label = document.createElement("div");
      label.className = "tool-label";
      label.textContent = args.label;
      btn.appendChild(label);
    }

    if (args.onClick) btn.addEventListener("click", args.onClick);
    toolsEl.appendChild(btn);
    return btn;
  };

  setChrome({
    title: "Kitchen Layout 2026 - Floor Plan",
    projectLabel: "Project 1",
    tabs: [
      { id: "file", label: "File", accent: true },
      { id: "architecture", label: "Architecture", active: true },
      { id: "kitchen", label: "Kitchen" },
      { id: "livingWall", label: "Living Wall" },
      { id: "room", label: "Room" },
      { id: "modify", label: "Modify" },
      { id: "visualisation", label: "Visualisation" },
      { id: "view", label: "View" }
    ]
  });

  return {
    clear,
    addRow,
    addGroup,
    addSpacer,
    toolButton,
    setChrome,
    setProjectLabel: (labelText: string) => { project.textContent = labelText; },
    getTab: (id: string) => tabMap.get(id) ?? null
  };
}

