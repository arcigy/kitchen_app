import type { OrganizationUser } from "../core/client/client-types";
import { createAccountMenu } from "./account/accountMenu";

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

type TopbarArgs = {
  organizationUsers?: OrganizationUser[];
  currentUserId?: string;
};

export function createTopbar(container: HTMLElement, args: TopbarArgs = {}) {
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
  brand.textContent = "A";
  titlebar.appendChild(brand);

  const product = document.createElement("div");
  product.className = "revit-product";
  product.innerHTML = `<strong>ARCHI-CAD</strong><span>PRO</span>`;
  titlebar.appendChild(product);

  const quick = document.createElement("div");
  quick.className = "revit-quick-actions";
  quick.innerHTML = `
    <button type="button" title="Open" aria-label="Open" data-quick-action="open">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.5h6.2l1.9 2.2h8.9l-2.2 8.2H4.8L3.5 7.5Z" />
        <path d="M4.6 7.5V5.2h5.7l1.8 2.3" />
      </svg>
    </button>
    <button type="button" title="Print" aria-label="Print" data-quick-action="print">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 8V4.8h9.6V8" />
        <path d="M7 16.2H5.2a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5h13.6a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
        <path d="M7 13.2h10v6H7z" />
        <path d="M16.8 11.1h.1" />
      </svg>
    </button>
    <button type="button" title="Save" aria-label="Save" data-quick-action="save">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 4.5h11.2l2.8 2.8v14.2h-15v-17Z" />
        <path d="M8 4.5v6h8v-6" />
        <path d="M8 21.5v-6h8v6" />
      </svg>
    </button>
    <i></i>
    <button type="button" title="Undo" aria-label="Undo" data-quick-action="undo">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.2 7.4 5.4 11l3.8 3.6" />
        <path d="M5.8 11h8.3a5.4 5.4 0 0 1 5.4 5.4" />
      </svg>
    </button>
    <button type="button" title="Redo" aria-label="Redo" data-quick-action="redo">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.8 7.4 3.8 3.6-3.8 3.6" />
        <path d="M18.2 11H9.9a5.4 5.4 0 0 0-5.4 5.4" />
      </svg>
    </button>
    <button type="button" title="Cloud" aria-label="Cloud" data-quick-action="cloud">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 18.2h10.2a4 4 0 0 0 .4-8 5.7 5.7 0 0 0-10.8-1.7A4.8 4.8 0 0 0 7.5 18.2Z" />
      </svg>
    </button>
  `;
  titlebar.appendChild(quick);

  const title = document.createElement("div");
  title.className = "revit-windowtitle";
  titlebar.appendChild(title);

  const project = document.createElement("div");
  project.className = "revit-projectlabel";
  titlebar.appendChild(project);

  const account = document.createElement("div");
  account.className = "revit-account";
  titlebar.appendChild(account);

  const organizationUsers = document.createElement("div");
  organizationUsers.className = "revit-organization-users";
  account.appendChild(organizationUsers);

  const shareButton = document.createElement("button");
  shareButton.type = "button";
  shareButton.textContent = "Share";
  account.appendChild(shareButton);

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

  const setOrganizationUsers = (users: OrganizationUser[], currentUserId = args.currentUserId) => {
    organizationUsers.innerHTML = "";
    createAccountMenu({
      mount: organizationUsers,
      users,
      currentUserId: currentUserId ?? "",
      showName: false
    });
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
    title: "PROJECT - VILLA NORD",
    projectLabel: "Project 1",
    tabs: [
      { id: "architecture", label: "Architecture", active: true },
      { id: "structure", label: "Structure" },
      { id: "systems", label: "Systems" },
      { id: "insert", label: "Insert" },
      { id: "annotate", label: "Annotate" },
      { id: "analyze", label: "Analyze" },
      { id: "massing", label: "Massing & Site" },
      { id: "collaborate", label: "Collaborate" },
      { id: "view", label: "View" },
      { id: "manage", label: "Manage" },
      { id: "kitchen", label: "Kitchen" },
      { id: "livingWall", label: "Living Wall" },
      { id: "visualisation", label: "Visualisation" }
    ]
  });
  setOrganizationUsers(args.organizationUsers ?? []);

  return {
    clear,
    addRow,
    addGroup,
    addSpacer,
    toolButton,
    setChrome,
    setOrganizationUsers,
    setProjectLabel: (labelText: string) => { project.textContent = labelText; },
    getTab: (id: string) => tabMap.get(id) ?? null,
    getQuickAction: (actionId: string) => quick.querySelector<HTMLButtonElement>(`button[data-quick-action="${actionId}"]`)
  };
}

