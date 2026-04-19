type ToolButtonArgs = {
  title: string;
  iconSvg: string;
  label?: string;
  variant?: "success" | "danger";
  onClick?: () => void;
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

  const rows = document.createElement("div");
  rows.className = "topbar-rows";
  container.appendChild(rows);

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

  return { clear, addRow, addGroup, addSpacer, toolButton };
}

