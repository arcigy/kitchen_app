import { getWallMaterialOption, WALL_MATERIAL_OPTIONS } from "./wallMaterials";

type WallMaterialPickerOptions = {
  value: string | null | undefined;
  mixed?: boolean;
  onChange: (materialId: string) => void;
};

function colorToCss(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function createWallMaterialPicker(options: WallMaterialPickerOptions) {
  const wrap = document.createElement("div");
  wrap.className = "wall-color-swatches";
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "6px";
  wrap.style.minHeight = "28px";

  let selectedId = options.mixed ? "" : getWallMaterialOption(options.value).id;
  const buttons: HTMLButtonElement[] = [];

  const sync = () => {
    for (const button of buttons) {
      const active = button.dataset.wallMaterialId === selectedId;
      button.style.border = active ? "2px solid #0f75bd" : "1px solid rgba(15, 23, 42, 0.42)";
      button.style.boxShadow = active ? "0 0 0 2px rgba(15, 117, 189, 0.18)" : "none";
    }
  };

  for (const option of WALL_MATERIAL_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = option.name;
    button.setAttribute("aria-label", option.name);
    button.dataset.wallMaterialId = option.id;
    button.style.width = "24px";
    button.style.height = "24px";
    button.style.padding = "0";
    button.style.boxSizing = "border-box";
    button.style.borderRadius = "999px";
    button.style.background = colorToCss(option.color);
    button.style.cursor = "pointer";
    button.style.flex = "0 0 auto";
    button.addEventListener("click", () => {
      selectedId = option.id;
      sync();
      options.onChange(option.id);
    });
    buttons.push(button);
    wrap.appendChild(button);
  }

  sync();
  return wrap;
}
