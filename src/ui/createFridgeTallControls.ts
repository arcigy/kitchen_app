import type { FridgeTallParams } from "../model/cabinetTypes";

type ControlApi = { syncFromParams: () => void };

type CreateControlsArgs = {
  onChange: () => void;
  getWorktopThicknessMm: () => number;
};

export function createFridgeTallControls(container: HTMLElement, params: FridgeTallParams, args: CreateControlsArgs): ControlApi {
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";
  container.appendChild(grid);

  const numberFields: Array<{ key: keyof FridgeTallParams; input: HTMLInputElement }> = [];
  const keyFields: Array<{ key: "materials.bodyKey" | "materials.frontKey"; input: HTMLInputElement }> = [];
  const nameFields: Array<{ key: "materials.bodyName" | "materials.frontName"; input: HTMLInputElement }> = [];
  const colorFields: Array<{ key: "materials.bodyColor" | "materials.frontColor"; input: HTMLInputElement }> = [];
  let fridgePresetSelect: HTMLSelectElement | null = null;

  const addNumber = (key: keyof FridgeTallParams, label: string, opts: { min?: number; step?: number } = {}) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.htmlFor = `f_${String(key)}`;
    const input = document.createElement("input");
    input.id = `f_${String(key)}`;
    input.type = "number";
    input.inputMode = "decimal";
    if (opts.min !== undefined) input.min = String(opts.min);
    input.step = String(opts.step ?? 1);
    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);
    numberFields.push({ key, input });
  };

  const addKey = (key: "materials.bodyKey" | "materials.frontKey", label: string) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.htmlFor = `f_${key.replaceAll(".", "_")}`;
    const input = document.createElement("input");
    input.id = `f_${key.replaceAll(".", "_")}`;
    input.type = "text";
    input.placeholder = "e.g. egger_u999_st2";
    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);
    keyFields.push({ key, input });
  };

  const addColor = (key: "materials.bodyColor" | "materials.frontColor", label: string) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.htmlFor = `f_${key.replaceAll(".", "_")}`;
    const input = document.createElement("input");
    input.id = `f_${key.replaceAll(".", "_")}`;
    input.type = "color";
    input.style.width = "120px";
    input.style.height = "36px";
    input.style.padding = "0";
    input.style.borderRadius = "10px";
    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);
    colorFields.push({ key, input });
  };

  const addName = (key: "materials.bodyName" | "materials.frontName", label: string) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    lab.htmlFor = `f_${key.replaceAll(".", "_")}`;
    const input = document.createElement("input");
    input.id = `f_${key.replaceAll(".", "_")}`;
    input.type = "text";
    input.placeholder = "e.g. Egger U999 ST2 18mm";
    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);
    nameFields.push({ key, input });
  };

  // Base
  addNumber("width", "Width (mm)", { min: 200, step: 1 });
  addNumber("height", "Height (mm)", { min: 400, step: 1 });
  addNumber("depth", "Depth (mm)", { min: 200, step: 1 });
  addNumber("boardThickness", "Board thickness (mm)", { min: 5, step: 1 });
  addNumber("backThickness", "Back thickness (mm)", { min: 3, step: 1 });
  addNumber("plinthHeight", "Plinth height (mm)", { min: 0, step: 1 });
  addNumber("plinthSetbackMm", "Plinth setback (mm)", { min: 0, step: 1 });

  // Doors (reveals + thickness)
  addNumber("frontThicknessMm", "Door thickness (mm)", { min: 5, step: 1 });
  addNumber("sideGap", "Side reveal (mm)", { min: 0, step: 0.5 });
  addNumber("topGap", "Top reveal (mm)", { min: 0, step: 0.5 });
  addNumber("bottomGap", "Bottom reveal (mm)", { min: 0, step: 0.5 });

  // Handles (same contract as other models)
  const handleWrap = document.createElement("div");
  handleWrap.className = "field";
  handleWrap.style.gridTemplateColumns = "1fr 120px";
  const handleLabel = document.createElement("label");
  handleLabel.textContent = "Handle type";
  handleLabel.htmlFor = "f_handleType";
  const handleType = document.createElement("select");
  handleType.id = "f_handleType";
  handleType.innerHTML = `
    <option value="none">none</option>
    <option value="bar">bar</option>
    <option value="knob">knob</option>
    <option value="cup">cup</option>
    <option value="gola">gola</option>
  `;
  handleWrap.appendChild(handleLabel);
  handleWrap.appendChild(handleType);
  grid.appendChild(handleWrap);

  addNumber("handleLengthMm", "Handle length (mm)", { min: 0, step: 1 });
  addNumber("handleSizeMm", "Handle size (mm)", { min: 0, step: 1 });
  addNumber("handleProjectionMm", "Handle projection (mm)", { min: 0, step: 1 });

  // Fridge niche
  addNumber("fridgeWidthMm", "Fridge niche width (mm)", { min: 100, step: 1 });
  addNumber("fridgeHeightMm", "Fridge niche height (mm)", { min: 100, step: 1 });
  addNumber("fridgeDepthMm", "Fridge niche depth (mm)", { min: 100, step: 1 });
  addNumber("fridgeSideClearanceMm", "Fridge side clearance (mm)", { min: 0, step: 0.5 });
  addNumber("fridgeTopClearanceMm", "Fridge top clearance (mm)", { min: 0, step: 0.5 });
  addNumber("fridgeBottomClearanceMm", "Fridge bottom clearance (mm)", { min: 0, step: 0.5 });

  // Common real-world presets (built-in fridge opening)
  {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.textContent = "Fridge preset";
    lab.htmlFor = "f_fridgePreset";
    const sel = document.createElement("select");
    sel.id = "f_fridgePreset";
    sel.innerHTML = `
      <option value="560_1770_550">56w / 177h / 55d</option>
      <option value="570_1780_550">57w / 178h / 55d</option>
    `;
    wrap.appendChild(lab);
    wrap.appendChild(sel);
    grid.appendChild(wrap);
    fridgePresetSelect = sel;

    sel.addEventListener("change", () => {
      const [w, h, d] = String(sel.value)
        .split("_")
        .map((x) => Number(x));
      if (![w, h, d].every((n) => Number.isFinite(n))) return;
      params.fridgeWidthMm = w;
      params.fridgeHeightMm = h;
      params.fridgeDepthMm = d;

      const fw = numberFields.find((x) => x.key === "fridgeWidthMm");
      if (fw) fw.input.value = String(w);
      const fh = numberFields.find((x) => x.key === "fridgeHeightMm");
      if (fh) fh.input.value = String(h);
      const fd = numberFields.find((x) => x.key === "fridgeDepthMm");
      if (fd) fd.input.value = String(d);

      args.onChange();
    });
  }

  // Door split (freezer + fridge)
  addNumber("freezerDoorHeightMm", "Freezer door height (mm)", { min: 50, step: 1 });
  addNumber("fridgeDoorGapMm", "Door gap (mm)", { min: 0, step: 0.5 });
  addNumber("doorHandleOffsetFromSplitMm", "Handle offset from split (mm)", { min: 0, step: 1 });

  // No top cabinet in this variant (the unit ends at the fridge height).

  addKey("materials.bodyKey", "Body material key");
  addKey("materials.frontKey", "Fronts material key");
  addName("materials.bodyName", "Body material name");
  addName("materials.frontName", "Fronts material name");
  addColor("materials.bodyColor", "Body color");
  addColor("materials.frontColor", "Fronts color");

  const readNumber = (input: HTMLInputElement, fallback: number) => {
    const n = Number(input.value);
    return Number.isFinite(n) ? n : fallback;
  };

  const updateUiState = () => {
    const type = (handleType.value as FridgeTallParams["handleType"]) ?? "none";
    const len = numberFields.find((f) => f.key === "handleLengthMm")?.input ?? null;
    if (len) len.disabled = type === "none" || type === "knob";
    const size = numberFields.find((f) => f.key === "handleSizeMm")?.input ?? null;
    if (size) size.disabled = type === "none";
    const proj = numberFields.find((f) => f.key === "handleProjectionMm")?.input ?? null;
    if (proj) proj.disabled = type === "none";
  };

  const syncFromParams = () => {
    for (const f of numberFields) {
      const value = params[f.key];
      f.input.value = typeof value === "number" ? String(value) : "";
    }
    handleType.value = (params.handleType as any) ?? "none";
    for (const f of keyFields) f.input.value = getMaterialKey(params, f.key);
    for (const f of nameFields) f.input.value = getMaterialName(params, f.key);
    for (const f of colorFields) f.input.value = getMaterialColor(params, f.key);
    if (fridgePresetSelect) {
      const w = Math.round(Number(params.fridgeWidthMm));
      const h = Math.round(Number(params.fridgeHeightMm));
      const d = Math.round(Number(params.fridgeDepthMm));
      fridgePresetSelect.value = `${w}_${h}_${d}`;
    }
    updateUiState();
  };

  const onInputsChanged = () => {
    for (const f of numberFields) {
      const current = params[f.key];
      if (typeof current !== "number") continue;
      (params[f.key] as number) = readNumber(f.input, current);
    }
    params.handleType = (handleType.value as any) ?? "none";
    for (const f of keyFields) setMaterialKey(params, f.key, f.input.value);
    for (const f of nameFields) setMaterialName(params, f.key, f.input.value);
    for (const f of colorFields) setMaterialColor(params, f.key, f.input.value);

    updateUiState();
    args.onChange();
  };

  for (const f of numberFields) {
    f.input.addEventListener("input", onInputsChanged);
  }
  for (const f of keyFields) f.input.addEventListener("input", onInputsChanged);
  for (const f of nameFields) f.input.addEventListener("input", onInputsChanged);
  for (const f of colorFields) f.input.addEventListener("input", onInputsChanged);
  handleType.addEventListener("change", onInputsChanged);

  syncFromParams();
  return { syncFromParams };
}

function getMaterialKey(params: FridgeTallParams, key: "materials.bodyKey" | "materials.frontKey") {
  if (key === "materials.bodyKey") return params.materials.bodyKey ?? "";
  return params.materials.frontKey ?? "";
}

function setMaterialKey(params: FridgeTallParams, key: "materials.bodyKey" | "materials.frontKey", value: string) {
  if (key === "materials.bodyKey") params.materials.bodyKey = value;
  else params.materials.frontKey = value;
}

function getMaterialName(params: FridgeTallParams, key: "materials.bodyName" | "materials.frontName") {
  if (key === "materials.bodyName") return params.materials.bodyName ?? "";
  return params.materials.frontName ?? "";
}

function setMaterialName(params: FridgeTallParams, key: "materials.bodyName" | "materials.frontName", value: string) {
  if (key === "materials.bodyName") params.materials.bodyName = value;
  else params.materials.frontName = value;
}

function getMaterialColor(params: FridgeTallParams, key: "materials.bodyColor" | "materials.frontColor") {
  if (key === "materials.bodyColor") return params.materials.bodyColor ?? "#ffffff";
  return params.materials.frontColor ?? "#ffffff";
}

function setMaterialColor(params: FridgeTallParams, key: "materials.bodyColor" | "materials.frontColor", value: string) {
  if (key === "materials.bodyColor") params.materials.bodyColor = value;
  else params.materials.frontColor = value;
}
