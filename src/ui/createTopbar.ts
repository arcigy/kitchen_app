import type { OrganizationUser } from "../core/client/client-types";
import { createAccountMenu } from "./account/accountMenu";
import { actionIconMarkup } from "./actionIcons";
import { bindIconTooltip } from "./iconTooltips";
import { t } from "../i18n";

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
  product.innerHTML = `<strong>Arcigy</strong><span>Kitchen</span>`;
  titlebar.appendChild(product);

  const quick = document.createElement("div");
  quick.className = "revit-quick-actions";
  quick.innerHTML = `
    <button type="button" aria-label="${t("Open")}" data-quick-action="open">${actionIconMarkup("open")}</button>
    <button type="button" aria-label="${t("Print")}" data-quick-action="print">${actionIconMarkup("print")}</button>
    <button type="button" aria-label="${t("Save")}" data-quick-action="save">${actionIconMarkup("save")}</button>
    <i></i>
    <button type="button" aria-label="${t("Undo")}" data-quick-action="undo">${actionIconMarkup("undo")}</button>
    <button type="button" aria-label="${t("Redo")}" data-quick-action="redo">${actionIconMarkup("redo")}</button>
    <button type="button" aria-label="${t("Cloud status")}" data-quick-action="cloud">${actionIconMarkup("cloud")}</button>
  `;
  quick.querySelectorAll<HTMLButtonElement>("button").forEach((button) => bindIconTooltip(button));
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
  shareButton.textContent = t("Share");
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
    btn.setAttribute("aria-label", args.title);

    const icon = document.createElement("div");
    icon.className = "tool-icon";
    icon.innerHTML = args.iconSvg;
    btn.appendChild(icon);
    bindIconTooltip(btn, { title: args.title });

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
    title: t("Arcigy Kitchen"),
    projectLabel: t("Workspace"),
    tabs: [
      { id: "architecture", label: t("Architecture"), active: true },
      { id: "structure", label: t("Structure") },
      { id: "systems", label: t("Systems") },
      { id: "insert", label: t("Insert") },
      { id: "annotate", label: t("Annotate") },
      { id: "analyze", label: t("Analyze") },
      { id: "massing", label: t("Massing & Site") },
      { id: "collaborate", label: t("Collaborate") },
      { id: "view", label: t("View") },
      { id: "manage", label: t("Manage") },
      { id: "kitchen", label: t("Kitchen") },
      { id: "livingWall", label: t("Living Wall") },
      { id: "visualisation", label: t("Visualisation") }
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
    getQuickAction: (actionId: string) => quick.querySelector<HTMLButtonElement>(`button[data-quick-action="${actionId}"]`),
    getShareButton: () => shareButton
  };
}
