type ToolButtonArgs = {
  title: string;
  iconSvg: string;
  onClick?: () => void;
};

export function createTopbar(container: HTMLElement) {
  container.innerHTML = "";
  container.style.position = "relative";

  const row = document.createElement("div");
  row.className = "topbar";
  container.appendChild(row);

  const clear = () => {
    row.innerHTML = "";
  };

  const addGroup = (title?: string) => {
    const g = document.createElement("div");
    g.className = "topbar-group";
    row.appendChild(g);

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

  const addSpacer = () => {
    const s = document.createElement("div");
    s.style.flex = "1 1 auto";
    row.appendChild(s);
  };

  const toolButton = (toolsEl: HTMLElement, args: ToolButtonArgs) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-btn";
    btn.title = args.title;
    btn.setAttribute("aria-label", args.title);

    const icon = document.createElement("div");
    icon.className = "tool-icon";
    icon.innerHTML = args.iconSvg;
    btn.appendChild(icon);

    if (args.onClick) btn.addEventListener("click", args.onClick);
    toolsEl.appendChild(btn);
    return btn;
  };

  return { clear, addGroup, addSpacer, toolButton };
}

