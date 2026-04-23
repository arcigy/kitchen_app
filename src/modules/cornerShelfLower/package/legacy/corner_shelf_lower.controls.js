function cornerShelfLowerControlsV2(n, e, t) {
  const i = i_(n, e, { onChange: t.onChange });
  const readBoolean = (o, r) => {
    if (typeof o == "boolean") return o;
    if (typeof r == "boolean") return r;
    return false;
  };
  const readString = (o, r, a) => {
    if (typeof o == "string" && o.trim().length > 0) return o.trim();
    if (typeof r == "string" && r.trim().length > 0) return r.trim();
    return a;
  };
  const readNumber = (o, r, a) => {
    const s = Number(o);
    if (Number.isFinite(s)) return s;
    const l = Number(r);
    if (Number.isFinite(l)) return l;
    return a;
  };
  const syncCornerHeightParams = () => {
    const worktopThickness = typeof e.worktopThicknessMm == "number" && Number.isFinite(e.worktopThicknessMm) ? Math.max(0, e.worktopThicknessMm) : 0;
    const resolvedHeight = readNumber(e.height, null, 720);
    const resolvedHeightCarcass = readNumber(e.heightCarcass, null, Math.max(50, resolvedHeight - worktopThickness));
    e.height = Math.max(50, Math.round(resolvedHeight));
    e.heightCarcass = Math.max(50, Math.round(resolvedHeightCarcass));
    if (Math.round(e.heightCarcass + worktopThickness) !== e.height) {
      e.height = Math.max(50, Math.round(e.heightCarcass + worktopThickness));
    }
  };
  const syncCanonicalCornerParams = () => {
    syncCornerHeightParams();
    e.doorDouble = readBoolean(e.doorDouble, e.doorDouble_corner);
    e.doorDouble_corner = e.doorDouble;
    e.doorOpen = readBoolean(e.doorOpen, e.doorOpen_corner);
    e.doorOpen_corner = e.doorOpen;
    e.hingeCountPerDoor = Math.max(1, Math.min(6, Math.round(readNumber(e.hingeCountPerDoor, e.hingeCount_corner, 2))));
    e.hingeCount_corner = String(e.hingeCountPerDoor);
    e.hingeSideFrontX = "right";
    e.hingeSideFrontX_corner = "right";
    e.hingeSideFrontZ = "right";
    e.hingeSideFrontZ_corner = "right";
    e.shelfAutoFit = readBoolean(e.shelfAutoFit, e.shelfAutoFit_corner);
    e.shelfAutoFit_corner = e.shelfAutoFit;
    Array.isArray(e.shelfGaps) || (e.shelfGaps = []);
    e.shelfGaps_corner = e.shelfGaps.join(", ");
  };
  const commitCornerAliasChange = () => {
    syncCanonicalCornerParams();
    t.onChange();
  };
  const bindIntercept = (o, r, a) => {
    const s = n.querySelector(o);
    if (!(s instanceof HTMLInputElement) && !(s instanceof HTMLSelectElement) && !(s instanceof HTMLTextAreaElement)) return;
    if (s.dataset.cornerAliasInterceptBound === "true") return;
    s.dataset.cornerAliasInterceptBound = "true";
    s.addEventListener(
      r,
      (l) => {
        a(s);
        l.preventDefault();
        l.stopImmediatePropagation();
        commitCornerAliasChange();
      },
      true
    );
  };
  bindIntercept("#f_doorDouble_corner", "change", (o) => {
    const r = o;
    e.doorDouble = r.checked === true;
    e.doorDouble_corner = e.doorDouble;
  });
  bindIntercept("#f_doorOpen_corner", "change", (o) => {
    const r = o;
    e.doorOpen = r.checked === true;
    e.doorOpen_corner = e.doorOpen;
  });
  bindIntercept("#f_hingeCount_corner", "change", (o) => {
    const r = Math.max(1, Math.min(6, Math.round(Number(o.value) || 2)));
    e.hingeCountPerDoor = r;
    e.hingeCount_corner = String(r);
  });
  bindIntercept("#f_shelfAutoFit_corner", "change", (o) => {
    const r = o;
    e.shelfAutoFit = r.checked === true;
    e.shelfAutoFit_corner = e.shelfAutoFit;
  });
  bindIntercept("#f_shelfGaps_corner", "input", (o) => {
    const r = o.value.split(",").map((a) => Number(a.trim())).filter((a) => Number.isFinite(a) && a > 0);
    e.shelfGaps = r;
    e.shelfGaps_corner = o.value;
  });
  bindIntercept("#f_height", "input", (o) => {
    const resolvedHeight = Math.max(50, Math.round(Number(o.value) || 720));
    const worktopThickness = typeof e.worktopThicknessMm == "number" && Number.isFinite(e.worktopThicknessMm) ? Math.max(0, e.worktopThicknessMm) : 0;
    e.height = resolvedHeight;
    e.heightCarcass = Math.max(50, Math.round(resolvedHeight - worktopThickness));
    const carcassInput = n.querySelector("#f_heightCarcass");
    if (carcassInput instanceof HTMLInputElement) {
      carcassInput.value = String(e.heightCarcass);
    }
  });
  bindIntercept("#f_heightCarcass", "input", (o) => {
    const resolvedHeightCarcass = Math.max(50, Math.round(Number(o.value) || 682));
    const worktopThickness = typeof e.worktopThicknessMm == "number" && Number.isFinite(e.worktopThicknessMm) ? Math.max(0, e.worktopThicknessMm) : 0;
    e.heightCarcass = resolvedHeightCarcass;
    e.height = Math.max(50, Math.round(resolvedHeightCarcass + worktopThickness));
    const heightInput = n.querySelector("#f_height");
    if (heightInput instanceof HTMLInputElement) {
      heightInput.value = String(e.height);
    }
  });
  bindIntercept("#f_worktopThicknessMm", "input", (o) => {
    const resolvedWorktopThickness = Math.max(0, Math.round(Number(o.value) || 0));
    e.worktopThicknessMm = resolvedWorktopThickness;
    const resolvedHeightCarcass = typeof e.heightCarcass == "number" && Number.isFinite(e.heightCarcass) ? Math.max(50, Math.round(e.heightCarcass)) : Math.max(50, Math.round(readNumber(e.height, null, 720) - resolvedWorktopThickness));
    e.heightCarcass = resolvedHeightCarcass;
    e.height = Math.max(50, Math.round(resolvedHeightCarcass + resolvedWorktopThickness));
    const heightInput = n.querySelector("#f_height");
    if (heightInput instanceof HTMLInputElement) {
      heightInput.value = String(e.height);
    }
    const carcassInput = n.querySelector("#f_heightCarcass");
    if (carcassInput instanceof HTMLInputElement) {
      carcassInput.value = String(e.heightCarcass);
    }
  });
  syncCanonicalCornerParams();
  return {
    syncFromParams() {
      syncCanonicalCornerParams();
      i?.syncFromParams?.();
      syncCanonicalCornerParams();
    }
  };
}