function swingShelvesLowControlsV2(n, e, t) {
  n.innerHTML = "";
  const i = document.createElement("div");
  i.className = "grid";
  n.appendChild(i);
  const numberInputs = [];
  const textAreas = [];
  const checkboxInputs = [];
  const addNumberField = (key, label, options = {}) => {
    const field = document.createElement("div");
    field.className = "field";
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.htmlFor = `f_${key}`;
    const input = document.createElement("input");
    input.id = `f_${key}`;
    input.type = "number";
    input.inputMode = "decimal";
    if (options.min !== void 0) input.min = String(options.min);
    input.step = String(options.step ?? 1);
    field.appendChild(labelElement);
    field.appendChild(input);
    i.appendChild(field);
    numberInputs.push({ key, input });
    return input;
  };
  const addCheckboxField = (key, label) => {
    const field = document.createElement("div");
    field.className = "field";
    field.style.gridTemplateColumns = "1fr 120px";
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.htmlFor = `f_${key}`;
    const input = document.createElement("input");
    input.id = `f_${key}`;
    input.type = "checkbox";
    input.style.justifySelf = "start";
    field.appendChild(labelElement);
    field.appendChild(input);
    i.appendChild(field);
    checkboxInputs.push({ key, input });
    return input;
  };
  const addTextAreaField = (key, label, placeholder) => {
    const field = document.createElement("div");
    field.className = "field";
    field.style.gridTemplateColumns = "1fr";
    const labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.htmlFor = `f_${key}`;
    const input = document.createElement("textarea");
    input.id = `f_${key}`;
    input.rows = 3;
    input.placeholder = placeholder;
    field.appendChild(labelElement);
    field.appendChild(input);
    i.appendChild(field);
    textAreas.push({ key, input });
    return input;
  };
  const widthInput = addNumberField("width", "Width (mm)", { min: 300, step: 1 });
  const heightInput = addNumberField("height", "Height (mm)", { min: 50, step: 1 });
  const heightCarcassInput = addNumberField("heightCarcass", "Height Carcass (mm)", { min: 50, step: 1 });
  const worktopInput = addNumberField("worktopThicknessMm", "Worktop Thickness (mm)", { min: 0, step: 1 });
  addNumberField("depth", "Depth (mm)", { min: 200, step: 1 });
  addNumberField("boardThickness", "Board Thickness (mm)", { min: 5, step: 1 });
  addNumberField("shelfThickness", "Shelf Thickness (mm)", { min: 5, step: 1 });
  addNumberField("backThickness", "Back Thickness (mm)", { min: 3, step: 1 });
  addNumberField("backGrooveDepthMm", "Back Groove Depth (mm)", { min: 0, step: 0.5 });
  addNumberField("backGrooveWidthMm", "Back Groove Width (mm)", { min: 0, step: 0.5 });
  addNumberField("backGrooveOffsetMm", "Back Groove Offset (mm)", { min: 0, step: 0.5 });
  addNumberField("backGrooveClearanceMm", "Back Groove Clearance (mm)", { min: 0, step: 0.5 });
  addNumberField("plinthHeight", "Plinth Height (mm)", { min: 0, step: 1 });
  addNumberField("plinthSetbackMm", "Plinth Setback (mm)", { min: 0, step: 1 });
  addNumberField("frontThicknessMm", "Front Thickness (mm)", { min: 5, step: 1 });
  addNumberField("frontGap", "Front Gap (mm)", { min: 0, step: 0.5 });
  addNumberField("sideGap", "Side Reveal (mm)", { min: 0, step: 0.5 });
  addNumberField("topGap", "Top Reveal (mm)", { min: 0, step: 0.5 });
  addNumberField("bottomGap", "Bottom Reveal (mm)", { min: 0, step: 0.5 });
  addNumberField("shelfCount", "Shelf Count", { min: 1, step: 1 });
  addNumberField("hingeCountPerDoor", "Hinges Per Door", { min: 1, step: 1 });
  addNumberField("hingeTopOffsetMm", "Hinge Top Offset (mm)", { min: 0, step: 1 });
  addNumberField("hingeBottomOffsetMm", "Hinge Bottom Offset (mm)", { min: 0, step: 1 });
  addNumberField("handlePositionMm", "Handle Position From Top (mm)", { min: 0, step: 1 });
  addCheckboxField("doorDouble", "Double Door");
  addCheckboxField("doorOpen", "Door Open");
  addCheckboxField("shelfAutoFit", "Auto-Fit Shelves");
  addTextAreaField("shelfGaps", "Shelf Gaps (mm)", "e.g. 180, 180, 180");
  const readNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const commit = () => t.onChange();
  const syncHeightFromTotal = () => {
    const height = Math.max(50, Math.round(readNumber(e.height, 700)));
    const worktopThickness = Math.max(0, Math.round(readNumber(e.worktopThicknessMm, 38)));
    e.height = height;
    e.worktopThicknessMm = worktopThickness;
    e.heightCarcass = Math.max(50, Math.round(height - worktopThickness));
    heightCarcassInput.value = String(e.heightCarcass);
    heightInput.value = String(e.height);
    worktopInput.value = String(e.worktopThicknessMm);
  };
  heightInput.addEventListener("input", () => {
    e.height = Math.max(50, Math.round(readNumber(heightInput.value, 700)));
    syncHeightFromTotal();
    commit();
  });
  heightCarcassInput.addEventListener("input", () => {
    const heightCarcass = Math.max(50, Math.round(readNumber(heightCarcassInput.value, 662)));
    const worktopThickness = Math.max(0, Math.round(readNumber(e.worktopThicknessMm, 38)));
    e.heightCarcass = heightCarcass;
    e.height = Math.max(50, Math.round(heightCarcass + worktopThickness));
    heightInput.value = String(e.height);
    commit();
  });
  worktopInput.addEventListener("input", () => {
    e.worktopThicknessMm = Math.max(0, Math.round(readNumber(worktopInput.value, 38)));
    syncHeightFromTotal();
    commit();
  });
  for (const entry of numberInputs) {
    if (entry.input === heightInput || entry.input === heightCarcassInput || entry.input === worktopInput) {
      continue;
    }
    entry.input.addEventListener("input", () => {
      e[entry.key] = readNumber(entry.input.value, readNumber(e[entry.key], 0));
      commit();
    });
  }
  for (const entry of checkboxInputs) {
    entry.input.addEventListener("change", () => {
      e[entry.key] = entry.input.checked === true;
      commit();
    });
  }
  for (const entry of textAreas) {
    entry.input.addEventListener("input", () => {
      if (entry.key === "shelfGaps") {
        e.shelfGaps = entry.input.value.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
      } else {
        e[entry.key] = entry.input.value;
      }
      commit();
    });
  }
  return {
    syncFromParams() {
      syncHeightFromTotal();
      for (const entry of numberInputs) {
        if (entry.key === "height" || entry.key === "heightCarcass" || entry.key === "worktopThicknessMm") continue;
        const value = readNumber(e[entry.key], 0);
        entry.input.value = String(value);
      }
      for (const entry of checkboxInputs) {
        entry.input.checked = e[entry.key] === true;
      }
      for (const entry of textAreas) {
        if (entry.key === "shelfGaps") {
          entry.input.value = Array.isArray(e.shelfGaps) ? e.shelfGaps.join(", ") : "";
        } else {
          entry.input.value = typeof e[entry.key] === "string" ? e[entry.key] : "";
        }
      }
    }
  };
}