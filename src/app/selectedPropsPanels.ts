import type { WallInstance, WallParams } from "./localTypes";

type SelectedPropsContext = Record<string, any>;

export function mountWallPropsPanel(ctx: SelectedPropsContext, w?: any) {
  const { props, selectedWallIds, walls, showNoProps, commitHistory, S, mountProps, rebuildWall, rebuildWallPlanMesh, appendLinkedMeasureInputs } = ctx;
    const selectedWalls =
      selectedWallIds.size > 1
        ? [...selectedWallIds]
            .map((id: string) => walls.find((wall: WallInstance) => wall.id === id))
            .filter((wall): wall is WallInstance => Boolean(wall))
        : w
          ? [w]
          : [];
    if (selectedWalls.length === 0) return showNoProps();

    const isMulti = selectedWalls.length > 1;
    const firstWall = selectedWalls[0];
    props.setTitle(isMulti ? `Steny (${selectedWalls.length})` : `Stena (${firstWall.id})`);
    const s = props.section();

    const multiVal = <K extends keyof WallParams>(items: WallInstance[], key: K) => {
      const first = items[0].params[key];
      const mixed = items.some((item) => item.params[key] !== first);
      return { value: mixed ? null : first, mixed };
    };

    const applyToSelectedWalls = (fn: (wall: WallInstance) => void) => {
      for (const wall of selectedWalls) fn(wall);
      for (const wall of walls) rebuildWall(wall);
      rebuildWallPlanMesh();
      commitHistory(S);
      mountProps();
    };

    const thickness = multiVal(selectedWalls, "thicknessMm");
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.placeholder = thickness.mixed ? "(rôzne)" : "";
    th.value = thickness.mixed ? "" : String(thickness.value);
    props.row(s, "Hrúbka (mm)", th);

    const height = multiVal(selectedWalls, "heightMm");
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.step = "1";
    heightInput.placeholder = height.mixed ? "(rôzne)" : "";
    heightInput.value = height.mixed ? "" : String(height.value);
    props.row(s, "Výška (mm)", heightInput);

    const justification = multiVal(selectedWalls, "justification");
    const just = document.createElement("select");
    just.innerHTML = `
      ${justification.mixed ? `<option value="">(rôzne)</option>` : ""}
      <option value="center">Center</option>
      <option value="interior">Finish face: interior</option>
      <option value="exterior">Finish face: exterior</option>
    `;
    just.value = justification.mixed ? "" : String(justification.value ?? "center");
    props.row(s, "Justification", just);

    th.addEventListener("change", () => {
      const next = Number(th.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.thicknessMm = Math.max(10, Math.round(next));
      });
    });
    heightInput.addEventListener("change", () => {
      const next = Number(heightInput.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.heightMm = Math.max(1, Math.round(next));
        wall.heightMm = wall.params.heightMm;
      });
    });
    just.addEventListener("change", () => {
      if (!just.value) return;
      applyToSelectedWalls((wall) => {
        wall.params.justification =
          just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      });
    });

    if (isMulti) return;

    const flip = document.createElement("button");
    flip.type = "button";
    flip.textContent = "Flip exterior";
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const mat = document.createElement("select");
    mat.innerHTML = `<option value="default">Default</option>`;
    mat.value = firstWall.params.materialId;
    props.row(s, "Material", mat);
    const len = document.createElement("div");
    len.className = "muted";
    const dx = firstWall.params.bMm.x - firstWall.params.aMm.x;
    const dz = firstWall.params.bMm.z - firstWall.params.aMm.z;
    len.textContent = `Length: ${Math.round(Math.hypot(dx, dz))} mm`;
    s.appendChild(len);
    flip.addEventListener("click", () => {
      firstWall.params.exteriorSign = (firstWall.params.exteriorSign ?? 1) === 1 ? -1 : 1;
      applyToSelectedWalls((wall) => {
        if (wall.id === firstWall.id) wall.params.exteriorSign = firstWall.params.exteriorSign;
      });
    });
    mat.addEventListener("change", () => {
      firstWall.params.materialId = mat.value || "default";
      commitHistory(S);
    });

    appendLinkedMeasureInputs(s, { kind: "wall", wallId: firstWall.id });
  
}

export function mountFloorPropsPanel(ctx: SelectedPropsContext, floor: any) {
  const { props, getAllMaterials, floorDefault, rebuildFloor, updateSelectionHighlights, commitHistory, S, enterFloorBoundaryEdit, appendLinkedMeasureInputs } = ctx;
    props.setTitle(`Podlaha (${floor.id})`);
    const s = props.section();

    const name = document.createElement("input");
    name.type = "text";
    name.value = floor.params.name;
    props.row(s, "Názov", name);

    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(floor.params.heightMm);
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.step = "1";
    thickness.value = String(floor.params.thicknessMm);
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = document.createElement("select");
    mat.innerHTML = getAllMaterials().map((material: { id: string | number; name: string }) => `<option value="${material.id}">${material.name}</option>`).join("");
    mat.value = floor.params.materialId ?? floorDefault.materialId;
    props.row(s, "Materiál", mat);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit Boundary Line";
    edit.style.marginTop = "10px";
    s.appendChild(edit);

    const commit = () => {
      floor.params.name = name.value.trim() || floor.params.name;
      floor.params.heightMm = Math.round(Number(height.value) || floor.params.heightMm);
      floor.params.thicknessMm = Math.max(1, Math.round(Number(thickness.value) || floor.params.thicknessMm));
      floor.params.materialId = mat.value || floorDefault.materialId;
      name.value = floor.params.name;
      height.value = String(floor.params.heightMm);
      thickness.value = String(floor.params.thicknessMm);
      mat.value = floor.params.materialId;
      rebuildFloor(floor);
      updateSelectionHighlights();
      commitHistory(S);
    };

    name.addEventListener("change", commit);
    height.addEventListener("change", commit);
    thickness.addEventListener("change", commit);
    mat.addEventListener("change", commit);
    edit.addEventListener("click", () => enterFloorBoundaryEdit(floor.id));

    appendLinkedMeasureInputs(s, { kind: "floor", floorId: floor.id });
  
}

export function mountSectionToolPropsPanel(ctx: SelectedPropsContext) {
  const { props, sectionDraw, drawOrthoEnabled } = ctx;
    props.setTitle("Section");
    const s = props.section();
    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = sectionDraw.a
      ? `Klikni druhý bod. Ortho ${drawOrthoEnabled ? "ON" : "OFF"}, Shift = bez axis snap, Space = zrkadliť smer. Aktuálne: ${sectionDraw.mirrored ? "mirrored" : "default"}.`
      : "Klikni prvý bod section line. Po druhom bode sa section vytvorí a otvorí.";
    s.appendChild(info);
  
}

export function mountSectionPropsPanel(ctx: SelectedPropsContext, id: string) {
  const { props, sections, showNoProps, getSectionBasis, updateAllSectionVisuals, mountProps, commitHistory, S } = ctx;
    const section = sections.find((item: any) => item.id === id) ?? null;
    if (!section) return showNoProps();
    props.setTitle(`Section (${section.id})`);
    const s = props.section();

    const name = document.createElement("input");
    name.type = "text";
    name.value = section.params.name;
    props.row(s, "Name", name);

    const info = document.createElement("div");
    info.className = "muted";
    info.style.marginTop = "8px";
    const basis = getSectionBasis(section.params);
    info.textContent = `A: ${section.params.aMm.x}, ${section.params.aMm.z} mm | B: ${section.params.bMm.x}, ${section.params.bMm.z} mm | Dĺžka: ${basis ? Math.round(basis.length * 1000) : 0} mm`;
    s.appendChild(info);

    const dir = document.createElement("div");
    dir.className = "muted";
    dir.style.marginTop = "6px";
    dir.textContent = `Smer: ${section.params.mirrored ? "Mirrored" : "Default"}`;
    s.appendChild(dir);

    const commit = () => {
      const nextName = name.value.trim() || section.params.name;
      if (nextName === section.params.name) {
        name.value = section.params.name;
        return;
      }
      section.params.name = nextName;
      name.value = section.params.name;
      updateAllSectionVisuals();
      mountProps();
      commitHistory(S);
    };

    name.addEventListener("change", commit);
    name.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
    });
  
}

export function mountWindowPropsPanel(ctx: SelectedPropsContext) {
  const { props } = ctx;
    props.setTitle("Window");
    const s = props.section();
    const p = document.createElement("div");
    p.className = "muted";
    p.textContent = "Nastavenia okna zatiaľ zostávajú vpravo (TODO: presunúť do properties).";
    s.appendChild(p);
  
}

export function mountFloorBoundaryPropsPanel(ctx: SelectedPropsContext) {
  const { props, floorEdit, getAllMaterials, floorDefault } = ctx;
    props.setTitle("Floor Boundary");
    const s = props.section();
    const params = floorEdit.params;
    if (!params) return;

    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(params.heightMm);
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.step = "1";
    thickness.value = String(params.thicknessMm);
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = document.createElement("select");
    mat.innerHTML = getAllMaterials().map((material: { id: string | number; name: string }) => `<option value="${material.id}">${material.name}</option>`).join("");
    mat.value = params.materialId ?? floorDefault.materialId;
    props.row(s, "Materiál", mat);

    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = `Boundary lines: ${floorEdit.segments.length}. Ortho: ${floorEdit.ortho ? "ON" : "OFF"}. Horná línia je na výške úrovne, hrúbka ide vždy smerom dole.`;
    s.appendChild(info);

    if (floorEdit.error) {
      const error = document.createElement("div");
      error.style.color = "#ff6b6b";
      error.style.marginTop = "8px";
      error.textContent = floorEdit.error;
      s.appendChild(error);
    }

    height.addEventListener("change", () => {
      const next = Number(height.value);
      if (!Number.isFinite(next)) return;
      params.heightMm = Math.round(next);
      height.value = String(params.heightMm);
    });
    thickness.addEventListener("change", () => {
      const next = Number(thickness.value);
      if (!Number.isFinite(next)) return;
      params.thicknessMm = Math.max(1, Math.round(next));
      thickness.value = String(params.thicknessMm);
    });
    mat.addEventListener("change", () => {
      params.materialId = mat.value || floorDefault.materialId;
    });
  
}
