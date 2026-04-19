type ToolbarOpts = {
  onModuleAdd: (type: string) => void;
  onFinish: () => void;
  onDiscard: () => void;
};

export function mountKitchenToolbar(ribbonEl: HTMLElement, opts: ToolbarOpts): () => void {
  const prev = Array.from(ribbonEl.children) as HTMLElement[];
  const prevDisplay = prev.map((el) => el.style.display);
  for (const el of prev) el.style.display = "none";

  const host = document.createElement("div");
  host.className = "topbar";
  ribbonEl.appendChild(host);

  const group = () => {
    const g = document.createElement("div");
    g.className = "topbar-group";
    host.appendChild(g);
    const tools = document.createElement("div");
    tools.className = "topbar-tools";
    g.appendChild(tools);
    return tools;
  };

  const spacer = document.createElement("div");
  spacer.style.flex = "1 1 auto";

  const btn = (toolsEl: HTMLElement, title: string, label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tool-btn";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.textContent = label;
    b.addEventListener("click", onClick);
    toolsEl.appendChild(b);
    return b;
  };

  const modules = group();
  btn(modules, "Add drawer", "D", () => opts.onModuleAdd("drawer_low"));
  btn(modules, "Add nested drawer", "ND", () => opts.onModuleAdd("nested_drawer_low"));
  btn(modules, "Add shelves", "S", () => opts.onModuleAdd("shelves"));
  btn(modules, "Add fridge", "F", () => opts.onModuleAdd("fridge_tall"));
  btn(modules, "Add corner", "C", () => opts.onModuleAdd("corner_shelf_lower"));
  btn(modules, "Add flap shelves", "FL", () => opts.onModuleAdd("flap_shelves_low"));
  btn(modules, "Add swing shelves", "SW", () => opts.onModuleAdd("swing_shelves_low"));
  btn(modules, "Add oven base", "O", () => opts.onModuleAdd("oven_base_low"));
  btn(modules, "Add microwave+oven tall", "M", () => opts.onModuleAdd("microwave_oven_tall"));
  btn(modules, "Add top drawers/doors", "TD", () => opts.onModuleAdd("top_drawers_doors_low"));

  host.appendChild(spacer);

  const exit = group();
  const finish = btn(exit, "Dokončiť", "✓", () => opts.onFinish());
  finish.style.color = "#22c55e";
  finish.style.borderColor = "rgba(34,197,94,0.55)";
  finish.style.background = "rgba(34,197,94,0.10)";
  const discard = btn(exit, "Zrušiť zmeny", "✗", () => opts.onDiscard());
  discard.style.color = "#ef4444";
  discard.style.borderColor = "rgba(239,68,68,0.55)";
  discard.style.background = "rgba(239,68,68,0.10)";

  return () => {
    host.remove();
    for (let i = 0; i < prev.length; i++) prev[i].style.display = prevDisplay[i];
  };
}
