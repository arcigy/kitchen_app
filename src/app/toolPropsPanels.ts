type ToolPropsContext = Record<string, any>;

export function mountWallToolPropsPanel(ctx: ToolPropsContext) {
  const { props, wallDefault, wallDraw, updateWallMeshWithJustification, setUnderlayStatus } = ctx;
    props.setTitle("Wall");
    const s = props.section();
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.value = String(wallDefault.thicknessMm);
    props.row(s, "Thickness (mm)", th);
    const just = document.createElement("select");
    just.innerHTML = `
      <option value="center">Center</option>
      <option value="interior">Finish face: interior</option>
      <option value="exterior">Finish face: exterior</option>
    `;
    just.value = wallDefault.justification;
    props.row(s, "Justification", just);
    const flip = document.createElement("button");
    flip.type = "button";
    flip.textContent = "Flip exterior";
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const mat = document.createElement("select");
    mat.innerHTML = `<option value="default">Default</option>`;
    mat.value = wallDefault.materialId;
    props.row(s, "Material", mat);
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni 2 body v 2D. Shift = bez axis snap. Esc = stop chain.";
    s.appendChild(hint);
    const updatePreview = () => {
      if (!wallDraw.preview || !wallDraw.a) return;
      updateWallMeshWithJustification(
        wallDraw.preview,
        wallDraw.a,
        wallDraw.hoverB ?? wallDraw.a,
        wallDefault.thicknessMm,
        wallDefault.justification,
        wallDefault.exteriorSign
      );
    };
    th.addEventListener("change", () => {
      wallDefault.thicknessMm = Math.max(10, Number(th.value) || wallDefault.thicknessMm);
      th.value = String(wallDefault.thicknessMm);
      updatePreview();
    });
    just.addEventListener("change", () => {
      wallDefault.justification =
        just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      updatePreview();
    });
    flip.addEventListener("click", () => {
      wallDefault.exteriorSign = wallDefault.exteriorSign === 1 ? -1 : 1;
      updatePreview();
      setUnderlayStatus(`Wall: exterior ${wallDefault.exteriorSign === 1 ? "left" : "right"} of Aâ†’B.`);
    });
    mat.addEventListener("change", () => {
      wallDefault.materialId = mat.value || "default";
    });
  
}

export function mountKitchenWorktopToolPropsPanel(ctx: ToolPropsContext) {
  const { props, S, kitchenWorktopDraw, scheduleKitchenWorktopPreviewUpdate, getMaterialDefinitionById } = ctx;
    props.setTitle("Worktop");
    const section = props.section();

    const just = document.createElement("select");
    just.innerHTML = `
      <option value="center">Center</option>
      <option value="back">Back edge</option>
      <option value="front">Front edge</option>
    `;
    just.value = kitchenWorktopDraw.justification;
    props.row(section, "Justification", just);

    const depth = document.createElement("div");
    depth.textContent = `${S.kitchenCtx.worktopDepthMm} mm`;
    props.row(section, "Depth", depth);

    const thickness = document.createElement("div");
    thickness.textContent = `${S.kitchenCtx.worktopThicknessMm} mm`;
    props.row(section, "Thickness", thickness);

    const height = document.createElement("div");
    height.textContent = `${S.kitchenCtx.heightMm} mm`;
    props.row(section, "Top Height", height);

    const material = document.createElement("div");
    material.textContent = getMaterialDefinitionById(S.kitchenCtx.worktopMaterialId)?.displayName ?? S.kitchenCtx.worktopMaterialId;
    props.row(section, "Material", material);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      "Klikaj body tvaru dosky. Môžeš pokračovať ďalšími rohmi aj pre U tvar. Esc = potvrdiť hotový tvar. Space zrkadlí dosku okolo tej istej back/front line.";
    section.appendChild(hint);

    just.addEventListener("change", () => {
      kitchenWorktopDraw.justification =
        just.value === "front" ? "front" : just.value === "center" ? "center" : "back";
      scheduleKitchenWorktopPreviewUpdate();
    });
  
}

export function mountAlignToolPropsPanel(ctx: ToolPropsContext) {
  const { props, alignState } = ctx;
    props.setTitle("Align");
    const s = props.section();
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni referenčnú líniu, potom druhú rovnobežnú líniu (stena sa posunie alebo sa upraví koniec). Esc = zrušiť.";
    s.appendChild(hint);
    const cur = document.createElement("div");
    cur.className = "muted";
    cur.style.marginTop = "8px";
    cur.textContent = alignState.ref ? `Referencia: ${alignState.ref.label}` : "Referencia: (žiadna)";
    s.appendChild(cur);
  
}

export function mountTrimToolPropsPanel(ctx: ToolPropsContext) {
  const { props, trimState } = ctx;
    props.setTitle("Trim");
    const s = props.section();
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni cieľovú stenu (ktorú chceš skrátiť), potom klikni reznú líniu. Esc = späť.";
    s.appendChild(hint);

    const step = document.createElement("div");
    step.className = "muted";
    step.style.marginTop = "8px";
    step.textContent = trimState.step === "pickTarget" ? "Krok: vyber cieľ" : "Krok: vyber rez";
    s.appendChild(step);

    const cur = document.createElement("div");
    cur.className = "muted";
    cur.style.marginTop = "6px";
    cur.textContent = trimState.targetPick ? `Cieľ: ${trimState.targetPick.label}` : "Cieľ: (žiadny)";
    s.appendChild(cur);
  
}

export function mountMeasureToolPropsPanel(ctx: ToolPropsContext) {
  const { props, measureState, args, formatMm, clearAllMeasurements, setUnderlayStatus, mountProps } = ctx;
    props.setTitle("Measure");
    const s = props.section();

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      "Funguje v 2D aj 3D. Klikni prvý snap bod alebo hranu. Pri druhom bode sa v 2D zapne aj perpendicular snap na hrany. Drž Shift pre normal guide mode. Esc len vypne tool, Shift+Esc vymaže všetky uložené merania.";
    s.appendChild(hint);

    const axisWrap = document.createElement("label");
    axisWrap.style.display = "flex";
    axisWrap.style.alignItems = "center";
    axisWrap.style.gap = "8px";
    axisWrap.style.marginTop = "10px";
    const axis = document.createElement("input");
    axis.type = "checkbox";
    axis.checked = measureState.axisLock;
    axis.addEventListener("change", () => {
      measureState.axisLock = axis.checked;
      args.axisLockEl.checked = axis.checked;
    });
    axisWrap.append(axis, document.createTextNode("Axis lock (optional, 2D/3D)"));
    s.appendChild(axisWrap);

    const status = document.createElement("div");
    status.className = "muted";
    status.style.marginTop = "8px";
    status.textContent = measureState.firstPoint
      ? `Prvý bod: ${formatMm(measureState.firstPoint)}`
      : "Prvý bod: (žiadny)";
    s.appendChild(status);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.style.marginTop = "10px";
    clearBtn.addEventListener("click", () => {
      clearAllMeasurements();
      setUnderlayStatus("Measure: klikni prvý bod.");
      mountProps();
    });
    s.appendChild(clearBtn);
  
}
