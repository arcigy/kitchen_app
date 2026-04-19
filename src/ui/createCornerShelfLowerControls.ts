import type { CornerShelfLowerParams } from "../model/cabinetTypes";
import { computeEqualShelfGaps } from "../model/cabinetTypes";

type ControlApi = {
  syncFromParams: () => void;
};

type CreateControlsArgs = {
  onChange: () => void;
  getWorktopThicknessMm: () => number;
};

export function createCornerShelfLowerControls(
  container: HTMLElement,
  params: CornerShelfLowerParams,
  args: CreateControlsArgs
): ControlApi {
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";
  container.appendChild(grid);

  const numberFields: Array<{ key: keyof CornerShelfLowerParams; input: HTMLInputElement }> = [];
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

  const addNumber = (
    key: keyof CornerShelfLowerParams,
    label: string,
    opts: { min?: number; step?: number } = {}
  ) => {
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

  const addKey = (key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey", label: string) => {
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

  const addColor = (key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor", label: string) => {
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

  // Dimensions
  addNumber("lengthX", "Length X (mm)", { min: 400, step: 1 });
  addNumber("lengthZ", "Length Z (mm)", { min: 400, step: 1 });
  addNumber("depth", "Depth (mm)", { min: 300, step: 1 });

  // Height (final incl. worktop + carcass excl. worktop)
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

  addNumber("boardThickness", "Board thickness (mm)", { min: 5, step: 1 });
  addNumber("backThickness", "Back thickness (mm)", { min: 3, step: 1 });
  addNumber("plinthHeight", "Plinth height (mm)", { min: 0, step: 1 });
  addNumber("plinthSetbackMm", "Plinth setback (mm)", { min: 0, step: 1 });

  // Shelves
  addNumber("shelfCount", "Shelf count (compartments)", { min: 1, step: 1 });
  addNumber("shelfThickness", "Shelf thickness (mm)", { min: 5, step: 1 });

  // Doors
  const doorsWrap = document.createElement("div");
  doorsWrap.className = "field";
  doorsWrap.style.gridTemplateColumns = "1fr 120px";

  const doorsLabel = document.createElement("label");
  doorsLabel.textContent = "Two faces doors";
  doorsLabel.htmlFor = "f_doorDouble_corner";

  const doorDouble = document.createElement("input");
  doorDouble.id = "f_doorDouble_corner";
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
  openLabel.htmlFor = "f_doorOpen_corner";

  const doorOpen = document.createElement("input");
  doorOpen.id = "f_doorOpen_corner";
  doorOpen.type = "checkbox";
  doorOpen.checked = params.doorOpen === true;
  doorOpen.style.justifySelf = "start";

  openWrap.appendChild(openLabel);
  openWrap.appendChild(doorOpen);
  grid.appendChild(openWrap);

  // Hinges
  const hingeZWrap = document.createElement("div");
  hingeZWrap.className = "field";
  hingeZWrap.style.gridTemplateColumns = "1fr 120px";

  const hingeZLabel = document.createElement("label");
  hingeZLabel.textContent = "Hinge side (Z face)";
  hingeZLabel.htmlFor = "f_hingeSideFrontZ";

  const hingeSideFrontZ = document.createElement("select");
  hingeSideFrontZ.id = "f_hingeSideFrontZ";
  hingeSideFrontZ.innerHTML = `
    <option value="left">left</option>
    <option value="right">right</option>
  `;

  hingeZWrap.appendChild(hingeZLabel);
  hingeZWrap.appendChild(hingeSideFrontZ);
  grid.appendChild(hingeZWrap);

  const hingeXWrap = document.createElement("div");
  hingeXWrap.className = "field";
  hingeXWrap.style.gridTemplateColumns = "1fr 120px";

  const hingeXLabel = document.createElement("label");
  hingeXLabel.textContent = "Hinge side (X face)";
  hingeXLabel.htmlFor = "f_hingeSideFrontX";

  const hingeSideFrontX = document.createElement("select");
  hingeSideFrontX.id = "f_hingeSideFrontX";
  hingeSideFrontX.innerHTML = `
    <option value="left">left</option>
    <option value="right">right</option>
  `;

  hingeXWrap.appendChild(hingeXLabel);
  hingeXWrap.appendChild(hingeSideFrontX);
  grid.appendChild(hingeXWrap);

  addNumber("hingeCountPerDoor", "Hinges per door", { min: 1, step: 1 });
  addNumber("hingeTopOffsetMm", "Hinge top offset (mm)", { min: 0, step: 1 });
  addNumber("hingeBottomOffsetMm", "Hinge bottom offset (mm)", { min: 0, step: 1 });

  // Auto-fit checkbox
  const autoWrap = document.createElement("div");
  autoWrap.className = "field";
  autoWrap.style.gridTemplateColumns = "1fr 120px";

  const autoLabel = document.createElement("label");
  autoLabel.textContent = "Auto-fit equal gaps";
  autoLabel.htmlFor = "f_shelfAutoFit_corner";

  const autoFit = document.createElement("input");
  autoFit.id = "f_shelfAutoFit_corner";
  autoFit.type = "checkbox";
  autoFit.checked = params.shelfAutoFit === true;
  autoFit.style.justifySelf = "start";

  autoWrap.appendChild(autoLabel);
  autoWrap.appendChild(autoFit);
  grid.appendChild(autoWrap);

  // Shelf gaps
  const gapsWrap = document.createElement("div");
  gapsWrap.className = "field";
  gapsWrap.style.gridTemplateColumns = "1fr";

  const gapsLabel = document.createElement("label");
  gapsLabel.textContent = "Shelf gaps (mm) – comma-separated (count = shelfCount)";
  gapsLabel.htmlFor = "f_shelfGaps_corner";
  gapsWrap.appendChild(gapsLabel);

  const gaps = document.createElement("textarea");
  gaps.id = "f_shelfGaps_corner";
  gaps.rows = 3;
  gaps.placeholder = "e.g. 200, 200, 200, 200";
  gapsWrap.appendChild(gaps);
  grid.appendChild(gapsWrap);

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
    hingeSideFrontZ.value = params.hingeSideFrontZ ?? "right";
    // Backward compat: older saves may contain "bottom/top".
    const hx =
      params.hingeSideFrontX === "left" || params.hingeSideFrontX === "right"
        ? params.hingeSideFrontX
        : (params.hingeSideFrontX as any) === "bottom"
          ? "left"
          : "right";
    hingeSideFrontX.value = hx;
    autoFit.checked = params.shelfAutoFit === true;
    gaps.value = params.shelfGaps.join(", ");
    gaps.readOnly = autoFit.checked;
  };

  const readNumber = (input: HTMLInputElement, fallback: number) => {
    const n = Number(input.value);
    return Number.isFinite(n) ? n : fallback;
  };

  const getWorktopT = () => Math.max(0, Math.round(args.getWorktopThicknessMm()));
  const computeCarcassHeight = () => {
    const t = getWorktopT();
    if (t <= 0) return params.height;
    return Math.max(50, Math.round(params.height - t));
  };
  const setFinalHeightFromCarcass = (carcassMm: number) => {
    const c = Math.max(50, Math.round(carcassMm));
    const t = getWorktopT();
    params.height = t > 0 ? c + t : c;
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
    params.hingeSideFrontZ = (hingeSideFrontZ.value as any) ?? "right";
    params.hingeSideFrontX = (hingeSideFrontX.value as any) ?? "right";
    params.hingeCountPerDoor = Math.max(1, Math.min(6, Math.round(params.hingeCountPerDoor)));
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

    if (autoFit.checked) {
      params.shelfGaps = computeEqualShelfGaps(params);
      gaps.value = params.shelfGaps.join(", ");
    } else {
      const typed = parseNumbers(gaps.value);
      params.shelfGaps = typed;
      const expected = params.shelfCount;
      if (params.shelfGaps.length !== expected) {
        params.shelfGaps = normalize(typed, expected);
        gaps.value = params.shelfGaps.join(", ");
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

  gaps.addEventListener("input", () => {
    if (autoFit.checked) {
      autoFit.checked = false;
      gaps.readOnly = false;
      params.shelfAutoFit = false;
    }
    if (!doorOpen.checked) {
      doorOpen.checked = true;
      params.doorOpen = true;
    }
    onInputsChanged();
  });

  autoFit.addEventListener("change", () => {
    gaps.readOnly = autoFit.checked;
    if (!doorOpen.checked) {
      doorOpen.checked = true;
      params.doorOpen = true;
    }
    onInputsChanged();
  });

  doorDouble.addEventListener("change", onInputsChanged);
  doorOpen.addEventListener("change", onInputsChanged);
  hingeSideFrontZ.addEventListener("change", onInputsChanged);
  hingeSideFrontX.addEventListener("change", onInputsChanged);

  syncFromParams();
  return { syncFromParams };
}

function parseNumbers(raw: string): number[] {
  const parts = raw
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((p) => Number(p)).filter((n) => Number.isFinite(n));
}

function normalize(existing: number[], count: number): number[] {
  const out = existing.slice(0, Math.max(0, count));
  if (out.length === 0 && count > 0) out.push(200);
  while (out.length < count) out.push(out[out.length - 1] ?? 200);
  return out;
}

function getMaterialColor(
  params: CornerShelfLowerParams,
  key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor"
) {
  if (key === "materials.bodyColor") return params.materials.bodyColor;
  if (key === "materials.frontColor") return params.materials.frontColor;
  return params.materials.drawerColor;
}

function setMaterialColor(
  params: CornerShelfLowerParams,
  key: "materials.bodyColor" | "materials.frontColor" | "materials.drawerColor",
  value: string
) {
  if (key === "materials.bodyColor") params.materials.bodyColor = value;
  else if (key === "materials.frontColor") params.materials.frontColor = value;
  else params.materials.drawerColor = value;
}

function getMaterialKey(
  params: CornerShelfLowerParams,
  key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey"
) {
  if (key === "materials.bodyKey") return params.materials.bodyKey;
  if (key === "materials.frontKey") return params.materials.frontKey;
  return params.materials.drawerKey;
}

function setMaterialKey(
  params: CornerShelfLowerParams,
  key: "materials.bodyKey" | "materials.frontKey" | "materials.drawerKey",
  value: string
) {
  if (key === "materials.bodyKey") params.materials.bodyKey = value;
  else if (key === "materials.frontKey") params.materials.frontKey = value;
  else params.materials.drawerKey = value;
}

