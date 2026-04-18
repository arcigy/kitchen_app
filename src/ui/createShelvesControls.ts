import type { ShelvesParams } from "../model/cabinetTypes";
import { computeEqualShelfGaps } from "../model/cabinetTypes";

type ControlApi = {
  syncFromParams: () => void;
};

type CreateControlsArgs = {
  onChange: () => void;
  getWorktopThicknessMm: () => number;
};

export function createShelvesControls(container: HTMLElement, params: ShelvesParams, args: CreateControlsArgs): ControlApi {
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";
  container.appendChild(grid);

  const numberFields: Array<{ key: keyof ShelvesParams; input: HTMLInputElement }> = [];
  const keyFields: Array<{
    key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey";
    input: HTMLInputElement;
  }> = [];
  const colorFields: Array<{
    key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor";
    input: HTMLInputElement;
  }> = [];
  let bodyTextureRotation: HTMLSelectElement | null = null;
  let bodyTintColor: HTMLInputElement | null = null;
  let bodyTintStrength: HTMLInputElement | null = null;

  const addNumber = (key: keyof ShelvesParams, label: string, opts: { min?: number; step?: number } = {}) => {
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

  const addKey = (
    key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey",
    label: string
  ) => {
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

  const addColor = (
    key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor",
    label: string
  ) => {
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

  addNumber("width", "Width (mm)", { min: 200, step: 1 });

  // Height: shelves are typically upper cabinets (not under worktop),
  // but we still expose both fields for consistency.
  const heightFinalWrap = document.createElement("div");
  heightFinalWrap.className = "field";
  const heightFinalLabel = document.createElement("label");
  heightFinalLabel.textContent = "Final height (incl. worktop) (mm)";
  heightFinalLabel.htmlFor = "f_height";
  const heightFinal = document.createElement("input");
  heightFinal.id = "f_height";
  heightFinal.type = "number";
  heightFinal.inputMode = "decimal";
  heightFinal.min = "50";
  heightFinal.step = "1";
  heightFinalWrap.appendChild(heightFinalLabel);
  heightFinalWrap.appendChild(heightFinal);
  grid.appendChild(heightFinalWrap);

  const heightCarcassWrap = document.createElement("div");
  heightCarcassWrap.className = "field";
  const heightCarcassLabel = document.createElement("label");
  heightCarcassLabel.textContent = "Carcass height (excl. worktop) (mm)";
  heightCarcassLabel.htmlFor = "f_heightCarcass";
  const heightCarcass = document.createElement("input");
  heightCarcass.id = "f_heightCarcass";
  heightCarcass.type = "number";
  heightCarcass.inputMode = "decimal";
  heightCarcass.min = "50";
  heightCarcass.step = "1";
  heightCarcassWrap.appendChild(heightCarcassLabel);
  heightCarcassWrap.appendChild(heightCarcass);
  grid.appendChild(heightCarcassWrap);

  addNumber("depth", "Depth (mm)", { min: 200, step: 1 });
  addNumber("boardThickness", "Board thickness (mm)", { min: 5, step: 1 });
  addNumber("backThickness", "Back thickness (mm)", { min: 3, step: 1 });
  addNumber("plinthHeight", "Plinth height (mm)", { min: 0, step: 1 });
  addNumber("plinthSetbackMm", "Plinth setback (mm)", { min: 0, step: 1 });

  const wallWrap = document.createElement("div");
  wallWrap.className = "field";
  wallWrap.style.gridTemplateColumns = "1fr 120px";

  const wallLabel = document.createElement("label");
  wallLabel.textContent = "Wall mounted (no legs/sockel)";
  wallLabel.htmlFor = "f_wallMounted";

  const wallMounted = document.createElement("input");
  wallMounted.id = "f_wallMounted";
  wallMounted.type = "checkbox";
  wallMounted.checked = params.wallMounted === true;
  wallMounted.style.justifySelf = "start";

  wallWrap.appendChild(wallLabel);
  wallWrap.appendChild(wallMounted);
  grid.appendChild(wallWrap);

  // Door/front sizing (match drawer cabinet semantics)
  addNumber("frontThicknessMm", "Front thickness (mm)", { min: 5, step: 1 });
  addNumber("frontGap", "Door center gap (mm)", { min: 0, step: 0.5 });
  addNumber("sideGap", "Side reveal (mm)", { min: 0, step: 0.5 });
  addNumber("topGap", "Top reveal (mm)", { min: 0, step: 0.5 });
  addNumber("bottomGap", "Bottom reveal (mm)", { min: 0, step: 0.5 });

  // Handles (same as drawer cabinet)
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

  addNumber("handlePositionMm", "Handle pos from top (mm)", { min: 0, step: 1 });
  addNumber("handleLengthMm", "Handle length (mm)", { min: 0, step: 1 });
  addNumber("handleSizeMm", "Handle size (mm)", { min: 0, step: 1 });
  addNumber("handleProjectionMm", "Handle projection (mm)", { min: 0, step: 1 });
  addNumber("shelfCount", "Shelf count (compartments)", { min: 1, step: 1 });
  addNumber("shelfThickness", "Shelf thickness (mm)", { min: 5, step: 1 });

  // Doors
  const doorsWrap = document.createElement("div");
  doorsWrap.className = "field";
  doorsWrap.style.gridTemplateColumns = "1fr 120px";

  const doorsLabel = document.createElement("label");
  doorsLabel.textContent = "Double door";
  doorsLabel.htmlFor = "f_doorDouble";

  const doorDouble = document.createElement("input");
  doorDouble.id = "f_doorDouble";
  doorDouble.type = "checkbox";
  doorDouble.checked = params.doorDouble === true;
  doorDouble.style.justifySelf = "start";

  doorsWrap.appendChild(doorsLabel);
  doorsWrap.appendChild(doorDouble);
  grid.appendChild(doorsWrap);

  const openWrap = document.createElement("div");
  openWrap.className = "field";
  openWrap.style.gridTemplateColumns = "1fr 120px";

  const openLabel = document.createElement("label");
  openLabel.textContent = "Door open";
  openLabel.htmlFor = "f_doorOpen";

  const doorOpen = document.createElement("input");
  doorOpen.id = "f_doorOpen";
  doorOpen.type = "checkbox";
  doorOpen.checked = params.doorOpen === true;
  doorOpen.style.justifySelf = "start";

  openWrap.appendChild(openLabel);
  openWrap.appendChild(doorOpen);
  grid.appendChild(openWrap);

  // Hinge count
  const hingeWrap = document.createElement("div");
  hingeWrap.className = "field";
  hingeWrap.style.gridTemplateColumns = "1fr 120px";

  const hingeLabel = document.createElement("label");
  hingeLabel.textContent = "Hinges per door";
  hingeLabel.htmlFor = "f_hingeCount";

  const hingeCount = document.createElement("select");
  hingeCount.id = "f_hingeCount";
  hingeCount.style.width = "120px";
  hingeCount.style.height = "36px";
  hingeCount.style.borderRadius = "10px";
  hingeCount.style.border = "1px solid var(--border)";
  hingeCount.style.background = "#0f1117";
  hingeCount.style.color = "var(--text)";
  hingeCount.innerHTML = `
    <option value="2">2</option>
    <option value="3">3</option>
  `;

  hingeWrap.appendChild(hingeLabel);
  hingeWrap.appendChild(hingeCount);
  grid.appendChild(hingeWrap);

  // Auto-fit checkbox
  const autoWrap = document.createElement("div");
  autoWrap.className = "field";
  autoWrap.style.gridTemplateColumns = "1fr 120px";

  const autoLabel = document.createElement("label");
  autoLabel.textContent = "Auto-fit centered shelves";
  autoLabel.htmlFor = "f_shelfAutoFit";

  const autoFit = document.createElement("input");
  autoFit.id = "f_shelfAutoFit";
  autoFit.type = "checkbox";
  autoFit.checked = params.shelfAutoFit === true;
  autoFit.style.justifySelf = "start";

  autoWrap.appendChild(autoLabel);
  autoWrap.appendChild(autoFit);
  grid.appendChild(autoWrap);

  // Shelf gaps (comma-separated) - clear gaps between boards
  const heightsWrap = document.createElement("div");
  heightsWrap.className = "field";
  heightsWrap.style.gridTemplateColumns = "1fr";

  const heightsLabel = document.createElement("label");
  heightsLabel.textContent = "Shelf gaps (mm) – comma-separated (count = shelfCount)";
  heightsLabel.htmlFor = "f_shelfGaps";
  heightsWrap.appendChild(heightsLabel);

  const heights = document.createElement("textarea");
  heights.id = "f_shelfGaps";
  heights.rows = 3;
  heights.placeholder = "e.g. 200, 200, 200, 200";
  heightsWrap.appendChild(heights);
  grid.appendChild(heightsWrap);

  addKey("materials.bodyKey", "Body material key");
  addKey("materials.frontKey", "Fronts material key");
  addKey("materials.drawerKey", "Drawer material key");

  addColor("materials.bodyColor", "Body color");
  addColor("materials.frontColor", "Fronts color");
  addColor("materials.drawerColor", "Drawer color");

  // Body texture rotation
  {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const lab = document.createElement("label");
    lab.textContent = "Body texture rotation";
    lab.htmlFor = "f_bodyTextureRotation";

    const sel = document.createElement("select");
    sel.id = "f_bodyTextureRotation";
    sel.innerHTML = `
      <option value="0">0°</option>
      <option value="90">90°</option>
      <option value="180">180°</option>
      <option value="270">270°</option>
    `;

    wrap.appendChild(lab);
    wrap.appendChild(sel);
    grid.appendChild(wrap);

    bodyTextureRotation = sel;
  }

  // Body tint
  {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const lab = document.createElement("label");
    lab.textContent = "Body wood tint";
    lab.htmlFor = "f_bodyTintColor";

    const input = document.createElement("input");
    input.id = "f_bodyTintColor";
    input.type = "color";
    input.style.width = "120px";
    input.style.height = "36px";
    input.style.padding = "0";
    input.style.borderRadius = "10px";

    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);

    bodyTintColor = input;
  }

  {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const lab = document.createElement("label");
    lab.textContent = "Body tint strength";
    lab.htmlFor = "f_bodyTintStrength";

    const input = document.createElement("input");
    input.id = "f_bodyTintStrength";
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "1";

    wrap.appendChild(lab);
    wrap.appendChild(input);
    grid.appendChild(wrap);

    bodyTintStrength = input;
  }

  const syncFromParams = () => {
    for (const f of numberFields) {
      const value = params[f.key];
      f.input.value = typeof value === "number" ? String(value) : "";
    }
    heightFinal.value = String(params.height);
    heightCarcass.value = String(computeCarcassHeight());
    for (const f of keyFields) f.input.value = getMaterialKey(params, f.key);
    for (const f of colorFields) f.input.value = getMaterialColor(params, f.key);
    if (bodyTextureRotation) bodyTextureRotation.value = String(params.materials.bodyPbr?.rotationDeg ?? 0);
    if (bodyTintColor) bodyTintColor.value = params.materials.bodyPbr?.tintColor ?? "#ffffff";
    if (bodyTintStrength) bodyTintStrength.value = String(Math.round((params.materials.bodyPbr?.tintStrength ?? 0) * 100));
    doorDouble.checked = params.doorDouble === true;
    doorOpen.checked = params.doorOpen === true;
    hingeCount.value = String(params.hingeCountPerDoor);
    autoFit.checked = params.shelfAutoFit === true;
    heights.value = params.shelfGaps.join(", ");
    heights.readOnly = autoFit.checked;
    handleType.value = (params.handleType as any) ?? "none";
    wallMounted.checked = params.wallMounted === true;
    updateUiState();
  };

  const updateUiState = () => {
    const type = (handleType.value as ShelvesParams["handleType"]) ?? "none";

    const pos = numberFields.find((f) => f.key === "handlePositionMm")?.input ?? null;
    if (pos) pos.disabled = type === "none" || type === "gola";

    const len = numberFields.find((f) => f.key === "handleLengthMm")?.input ?? null;
    if (len) len.disabled = type === "none" || type === "knob";

    const size = numberFields.find((f) => f.key === "handleSizeMm")?.input ?? null;
    if (size) size.disabled = type === "none";

    const proj = numberFields.find((f) => f.key === "handleProjectionMm")?.input ?? null;
    if (proj) proj.disabled = type === "none";

    const plinth = numberFields.find((f) => f.key === "plinthHeight")?.input ?? null;
    const setback = numberFields.find((f) => f.key === "plinthSetbackMm")?.input ?? null;
    if (plinth) plinth.disabled = wallMounted.checked;
    if (setback) setback.disabled = wallMounted.checked;
  };

  const readNumber = (input: HTMLInputElement, fallback: number) => {
    const n = Number(input.value);
    return Number.isFinite(n) ? n : fallback;
  };

  const computeCarcassHeight = () => params.height;
  const setFinalHeightFromCarcass = (carcassMm: number) => {
    params.height = Math.max(50, Math.round(carcassMm));
  };

  const onInputsChanged = () => {
    for (const f of numberFields) {
      const current = params[f.key];
      if (typeof current !== "number") continue;
      (params[f.key] as number) = readNumber(f.input, current);
    }

    params.shelfCount = Math.max(1, Math.round(params.shelfCount));
    params.doorDouble = doorDouble.checked;
    params.doorOpen = doorOpen.checked;
    params.hingeCountPerDoor = hingeCount.value === "2" ? 2 : 3;
    params.shelfAutoFit = autoFit.checked;

    for (const f of keyFields) setMaterialKey(params, f.key, f.input.value);
    for (const f of colorFields) setMaterialColor(params, f.key, f.input.value);
    if (bodyTextureRotation) {
      if (!params.materials.bodyPbr) params.materials.bodyPbr = { id: "wood_veneer_oak_7760_1k", rotationDeg: 0 };
      params.materials.bodyPbr.rotationDeg = (Number(bodyTextureRotation.value) as 0 | 90 | 180 | 270) ?? 0;
    }
    if (bodyTintColor || bodyTintStrength) {
      if (!params.materials.bodyPbr) params.materials.bodyPbr = { id: "wood_veneer_oak_7760_1k", rotationDeg: 0 };
      if (bodyTintColor) params.materials.bodyPbr.tintColor = bodyTintColor.value;
      if (bodyTintStrength) params.materials.bodyPbr.tintStrength = Number(bodyTintStrength.value) / 100;
    }

    params.wallMounted = wallMounted.checked;
    params.handleType = (handleType.value as ShelvesParams["handleType"]) ?? "none";

    if (autoFit.checked) {
      params.shelfGaps = computeEqualShelfGaps(params);
      heights.value = params.shelfGaps.join(", ");
    } else {
      const typed = parseHeights(heights.value);
      params.shelfGaps = typed;
      const expected = params.shelfCount;
      if (params.shelfGaps.length !== expected) {
        params.shelfGaps = normalizeHeights(typed, expected);
        heights.value = params.shelfGaps.join(", ");
      }
    }

    args.onChange();
  };

  for (const f of numberFields) f.input.addEventListener("input", onInputsChanged);
  for (const f of keyFields) f.input.addEventListener("input", onInputsChanged);
  for (const f of colorFields) f.input.addEventListener("input", onInputsChanged);
  bodyTextureRotation?.addEventListener("change", onInputsChanged);
  bodyTintColor?.addEventListener("input", onInputsChanged);
  bodyTintStrength?.addEventListener("input", onInputsChanged);
  handleType.addEventListener("change", onInputsChanged);
  wallMounted.addEventListener("change", onInputsChanged);

  heightFinal.addEventListener("input", () => {
    params.height = Math.max(50, Math.round(readNumber(heightFinal, params.height)));
    heightCarcass.value = String(computeCarcassHeight());
    onInputsChanged();
  });
  heightCarcass.addEventListener("input", () => {
    setFinalHeightFromCarcass(readNumber(heightCarcass, computeCarcassHeight()));
    heightFinal.value = String(params.height);
    onInputsChanged();
  });
  heights.addEventListener("input", () => {
    // Any manual typing should switch out of auto-fit, otherwise values get overwritten.
    if (autoFit.checked) {
      autoFit.checked = false;
      heights.readOnly = false;
      params.shelfAutoFit = false;
    }
    // When editing inner layout, auto-open door so changes are visible.
    if (!doorOpen.checked) {
      doorOpen.checked = true;
      params.doorOpen = true;
    }
    onInputsChanged();
  });
  autoFit.addEventListener("change", () => {
    heights.readOnly = autoFit.checked;
    if (!doorOpen.checked) {
      doorOpen.checked = true;
      params.doorOpen = true;
    }
    onInputsChanged();
  });
  doorDouble.addEventListener("change", onInputsChanged);
  doorOpen.addEventListener("change", onInputsChanged);
  hingeCount.addEventListener("change", onInputsChanged);
  // Keep handle field enable/disable state responsive when user toggles type.
  handleType.addEventListener("change", updateUiState);

  syncFromParams();
  return { syncFromParams };
}

function parseHeights(raw: string): number[] {
  const parts = raw
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
}

function normalizeHeights(existing: number[], count: number): number[] {
  const out = existing.slice(0, Math.max(0, count));
  if (out.length === 0 && count > 0) out.push(200);
  while (out.length < count) out.push(out[out.length - 1] ?? 200);
  return out;
}

function getMaterialColor(params: ShelvesParams, key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor") {
  if (key === "materials.bodyColor") return params.materials.bodyColor;
  if (key === "materials.frontColor") return params.materials.frontColor;
  return params.materials.drawerColor;
}

function setMaterialColor(
  params: ShelvesParams,
  key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor",
  value: string
) {
  if (key === "materials.bodyColor") params.materials.bodyColor = value;
  else if (key === "materials.frontColor") params.materials.frontColor = value;
  else params.materials.drawerColor = value;
}

function getMaterialKey(params: ShelvesParams, key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey") {
  if (key === "materials.bodyKey") return params.materials.bodyKey;
  if (key === "materials.frontKey") return params.materials.frontKey;
  return params.materials.drawerKey;
}

function setMaterialKey(params: ShelvesParams, key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey", value: string) {
  if (key === "materials.bodyKey") params.materials.bodyKey = value;
  else if (key === "materials.frontKey") params.materials.frontKey = value;
  else params.materials.drawerKey = value;
}
