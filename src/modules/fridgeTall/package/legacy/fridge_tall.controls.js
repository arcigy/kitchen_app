function fridgeTallControlsV2(n, e, t) {
  const r0 = fridgeTallBuildLegacyControlsParamsV2(e);
  const syncBaseControlsState = () => {
    const nextState = fridgeTallBuildLegacyControlsParamsV2(r0);
    Object.keys(e).forEach((key) => {
      if (!(key in nextState)) {
        delete e[key];
      }
    });
    Object.assign(e, nextState);
    Object.assign(r0, nextState);
    window.__MODULE_BUILDER_DEV__?.applyRuntimeSnapshotWithPreview?.({
      moduleType: "fridge_tall",
      params: fridgeTallSanitizeLegacyParamsV2(nextState),
      resetView: false
    });
  };
  const i = S_(n, r0, {
    onChange: () => {
      syncBaseControlsState();
      t.onChange();
    }
  });
  const o = () => {
    const r = (a2) => n.querySelector(a2)?.closest(".field");
    const a = (s2) => {
      const l2 = Number(s2);
      return Number.isFinite(l2) ? l2 : 0;
    };
    const s = (l2) => {
      const c2 = { ...l2 };
      const d2 = typeof c2.handleComponentId == "string" && c2.handleComponentId.length > 0 ? c2.handleComponentId : null;
      if (!d2) {
        c2.handleType = "none";
        delete c2.handleComponentId;
        return c2;
      }
      c2.handleComponentId = d2;
      if (d2.includes(".knob.")) {
        c2.handleType = "knob";
        c2.handleLengthMm = 32;
        c2.handleSizeMm = 28;
        c2.handleProjectionMm = 28;
        return c2;
      }
      if (d2.includes(".profile.")) {
        c2.handleType = "bar";
        c2.handleLengthMm = 160;
        c2.handleSizeMm = 14;
        c2.handleProjectionMm = 10;
        return c2;
      }
      c2.handleType = "bar";
      c2.handleLengthMm = d2.includes(".192.") ? 192 : 160;
      c2.handleSizeMm = 12;
      c2.handleProjectionMm = 14;
      return c2;
    };
    const l = (c2) => {
      const d2 = { ...c2 };
      const h2 = typeof d2.legComponentId == "string" && d2.legComponentId.length > 0 ? d2.legComponentId : null;
      if (!h2) {
        delete d2.legComponentId;
        return d2;
      }
      d2.legComponentId = h2;
      d2.plinthHeight = h2.includes(".150.") ? 150 : 100;
      return d2;
    };
    const d0 = (c2) => {
      const d2 = fridgeTallSanitizeLegacyParamsV2(c2);
      Object.keys(e).forEach((key) => {
        if (!(key in d2)) {
          delete e[key];
        }
      });
      Object.keys(r0).forEach((key) => {
        if (!(key in d2)) {
          delete r0[key];
        }
      });
      Object.assign(e, d2);
      Object.assign(r0, fridgeTallBuildLegacyControlsParamsV2(d2));
      window.__MODULE_BUILDER_DEV__?.applyRuntimeSnapshotWithPreview?.({
        moduleType: "fridge_tall",
        params: d2,
        resetView: false
      });
      t.onChange();
    };
    const bindNumberIntercept = (selector, key, fallbackValue, minimumValue = 0, transform) => {
      const control = n.querySelector(selector);
      if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) return;
      if (control.dataset.fridgeInterceptBound === "true") return;
      control.dataset.fridgeInterceptBound = "true";
      const commit = () => {
        const rawValue = Number(control.value);
        const normalizedValue = Number.isFinite(rawValue) ? Math.max(minimumValue, rawValue) : fallbackValue;
        const nextValue = typeof transform == "function" ? transform(normalizedValue) : normalizedValue;
        d0({ ...e, [key]: nextValue });
      };
      control.addEventListener("input", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit();
      }, true);
      control.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit();
      }, true);
    };
    const bindTextareaListIntercept = (selector, key) => {
      const control = n.querySelector(selector);
      if (!(control instanceof HTMLTextAreaElement)) return;
      if (control.dataset.fridgeInterceptBound === "true") return;
      control.dataset.fridgeInterceptBound = "true";
      const commit = () => {
        const values = control.value.split(",").map((entry) => Number(entry.trim())).filter((entry) => Number.isFinite(entry) && entry >= 0);
        d0({ ...e, [key]: values });
      };
      control.addEventListener("input", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit();
      }, true);
      control.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit();
      }, true);
    };
    const bindSelectIntercept = (selector, commitValue) => {
      const control = n.querySelector(selector);
      if (!(control instanceof HTMLSelectElement)) return;
      if (control.dataset.fridgeInterceptBound === "true") return;
      control.dataset.fridgeInterceptBound = "true";
      const commit = () => {
        d0(commitValue(control.value));
      };
      control.addEventListener("input", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit();
      }, true);
      control.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit();
      }, true);
    };
    const bindCheckboxIntercept = (selector, key, fallbackValue = false) => {
      const control = n.querySelector(selector);
      if (!(control instanceof HTMLInputElement) || control.type !== "checkbox") return;
      if (control.dataset.fridgeInterceptBound === "true") return;
      control.dataset.fridgeInterceptBound = "true";
      const commit = (nextChecked) => {
        control.checked = nextChecked;
        d0({ ...e, [key]: nextChecked === true });
      };
      control.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit(!(e[key] === true ? true : fallbackValue));
      }, true);
      control.addEventListener("change", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        commit(control.checked === true);
      }, true);
    };
    const c = (d2, h2, f2, m2, v0) => {
      let v2 = n.querySelector(`[data-enhanced-parameter-field="${d2}"]`);
      if (v2 instanceof HTMLElement) {
        return v2;
      }
      const M2 = f2.find((p3) => {
        const y2 = r(p3);
        return y2 instanceof HTMLElement;
      });
      if (!M2) return null;
      const p2 = r(M2);
      if (!(p2 instanceof HTMLElement)) return null;
      v2 = document.createElement("div");
      v2.className = "field";
      v2.dataset.enhancedParameterField = d2;
      if (m2 === "toggle") {
        v2.style.gridTemplateColumns = "1fr 120px";
      }
      const y = document.createElement("label");
      y.textContent = h2;
      const g = m2 === "toggle" ? document.createElement("input") : document.createElement("select");
      if (typeof v0 == "string" && v0.length > 0) {
        g.id = v0;
      }
      if (m2 === "toggle") {
        g.type = "checkbox";
        g.style.justifySelf = "start";
      }
      v2.appendChild(y);
      v2.appendChild(g);
      p2.insertAdjacentElement("afterend", v2);
      return v2;
    };
    const d = [
      "#f_handleType",
      "#f_handleLengthMm",
      "#f_handleSizeMm",
      "#f_handleProjectionMm"
    ].map((h2) => r(h2)).filter((h2) => h2 instanceof HTMLElement);
    for (const h2 of d) {
      h2.style.display = "none";
    }
    bindNumberIntercept("#f_width", "width", 600, 100);
    bindNumberIntercept("#f_height", "height", 1916, 100);
    bindNumberIntercept("#f_depth", "depth", 600, 100);
    bindNumberIntercept("#f_plinthHeight", "plinthHeight", 100, 0);
    bindNumberIntercept("#f_plinthSetbackMm", "plinthSetbackMm", 60, 0);
    bindNumberIntercept("#f_frontGap", "frontGap", 0, 0);
    bindNumberIntercept("#f_sideGap", "sideGap", 0, 0);
    bindNumberIntercept("#f_topGap", "topGap", 0, 0);
    bindNumberIntercept("#f_bottomGap", "bottomGap", 0, 0);
    bindNumberIntercept("#f_handlePositionMm", "handlePositionMm", 60, 0);
    bindNumberIntercept("#f_doorHandleOffsetFromSplitMm", "doorHandleOffsetFromSplitMm", 0, 0);
    bindNumberIntercept("#f_drawerCount", "drawerCount", 0, 0, (value) => Math.round(value));
    bindNumberIntercept("#f_gapAboveDrawersMm", "gapAboveDrawersMm", 0, 0);
    bindTextareaListIntercept("#f_drawerFrontHeights", "drawerFrontHeights");
    bindNumberIntercept("#f_fridgeWidthMm", "fridgeWidthMm", 560, 100);
    bindNumberIntercept("#f_fridgeHeightMm", "fridgeHeightMm", 1770, 100);
    bindNumberIntercept("#f_fridgeDepthMm", "fridgeDepthMm", 550, 100);
    bindNumberIntercept("#f_fridgeSideClearanceMm", "fridgeSideClearanceMm", 2, 0);
    bindNumberIntercept("#f_fridgeTopClearanceMm", "fridgeTopClearanceMm", 5, 0);
    bindNumberIntercept("#f_fridgeBottomClearanceMm", "fridgeBottomClearanceMm", 5, 0);
    bindNumberIntercept("#f_freezerDoorHeightMm", "freezerDoorHeightMm", 700, 0);
    bindNumberIntercept("#f_fridgeDoorGapMm", "fridgeDoorGapMm", 2, 0);
    bindCheckboxIntercept("#f_doorOpen_fridge_v2", "doorOpen", false);
    const h = c("fridge-board-thickness", "Board Thickness", ["#f_depth", "#f_height", "#f_width"], "select", "f_boardThickness");
    if (h instanceof HTMLElement) {
      const f2 = h.querySelector("select");
      if (f2 instanceof HTMLSelectElement) {
        f2.innerHTML = '<option value="16">16 mm</option><option value="18">18 mm</option><option value="20">20 mm</option>';
        const m0 = a(e.boardThickness);
        f2.value = String(Math.abs(m0 - 16) < Math.abs(m0 - 18) ? 16 : Math.abs(m0 - 20) < Math.abs(m0 - 18) ? 20 : 18);
        f2.onchange = () => {
          d0({ ...e, boardThickness: Number(f2.value) === 16 ? 16 : Number(f2.value) === 20 ? 20 : 18 });
        };
      }
    }
    const f = c("fridge-back-thickness", "Back Thickness", ["#f_depth", "#f_height", "#f_width"], "select", "f_backThickness");
    if (f instanceof HTMLElement) {
      const m2 = f.querySelector("select");
      if (m2 instanceof HTMLSelectElement) {
        m2.innerHTML = '<option value="6">6 mm</option><option value="8">8 mm</option>';
        m2.value = String(fridgeTallResolveBackThicknessMm(e.backThickness));
        m2.onchange = () => {
          d0({ ...e, backThickness: fridgeTallResolveBackThicknessMm(m2.value) });
        };
      }
    }
    const m = c(
      "fridge-front-thickness",
      "Front Thickness",
      ["#f_freezerDoorHeightMm", "#f_fridgeDoorGapMm", "#f_frontGap"],
      "select",
      "f_frontThicknessMm"
    );
    if (m instanceof HTMLElement) {
      const v2 = m.querySelector("select");
      if (v2 instanceof HTMLSelectElement) {
        v2.innerHTML = '<option value="16">16 mm</option><option value="18">18 mm</option><option value="20">20 mm</option>';
        const M2 = a(e.frontThicknessMm);
        v2.value = String(fridgeTallResolveFrontThicknessMm(M2));
        v2.onchange = () => {
          d0({ ...e, frontThicknessMm: fridgeTallResolveFrontThicknessMm(v2.value) });
        };
      }
    }
    const v = n.querySelector("#f_handleComponentId")?.closest(".field");
    if (v instanceof HTMLElement) {
      v.remove();
    }
    const removeLegacyField = (selector) => {
      const field = n.querySelector(selector)?.closest(".field");
      if (field instanceof HTMLElement) {
        field.remove();
      }
    };
    removeLegacyField("#f_hingeComponentId");
    removeLegacyField("#f_hingeSide");
    const M = c(
      "fridge-leg-component",
      "Leg Component",
      ["#f_plinthHeight", "#f_plinthSetbackMm", "#f_height"],
      "select",
      "f_legComponentId"
    );
    if (M instanceof HTMLElement) {
      const p2 = M.querySelector("select");
      if (p2 instanceof HTMLSelectElement) {
        p2.innerHTML = [
          '<option value="cmp.leg.adjustable.100.black">Adjustable Leg 100 mm Black</option>',
          '<option value="cmp.leg.adjustable.100.white">Adjustable Leg 100 mm White</option>',
          '<option value="cmp.leg.adjustable.150.black">Adjustable Leg 150 mm Black</option>',
          '<option value="cmp.leg.adjustable.150.inox">Adjustable Leg 150 mm Inox</option>'
        ].join("");
        p2.value = typeof e.legComponentId == "string" && e.legComponentId.length > 0 ? e.legComponentId : "cmp.leg.adjustable.100.black";
        p2.onchange = () => {
          d0(l({ ...e, legComponentId: p2.value || null }));
        };
      }
    }
    const p = c(
      "fridge-door-open",
      "Door open",
      ["#f_freezerDoorHeightMm", "#f_fridgeDoorGapMm", "#f_doorHandleOffsetFromSplitMm"],
      "toggle",
      "f_doorOpen_fridge_v2"
    );
    if (p instanceof HTMLElement) {
      const y = p.querySelector("input");
      if (y instanceof HTMLInputElement) {
        y.checked = e.doorOpen === true;
        y.onchange = () => {
          d0({ ...e, doorOpen: y.checked === true });
        };
      }
    }
    return {
      applyToParams(y) {
        const g0 = fridgeTallSanitizeLegacyParamsV2(y);
        Object.keys(y).forEach((W0) => {
          if (!(W0 in g0)) {
            delete y[W0];
          }
        });
        Object.assign(y, g0);
        const g = h?.querySelector("select");
        if (g instanceof HTMLSelectElement) {
          y.boardThickness = Number(g.value) === 16 ? 16 : Number(g.value) === 20 ? 20 : 18;
        }
        const W = f?.querySelector("select");
        if (W instanceof HTMLSelectElement) {
          y.backThickness = fridgeTallResolveBackThicknessMm(W.value);
        }
        const $ = m?.querySelector("select");
        if ($ instanceof HTMLSelectElement) {
          y.frontThicknessMm = fridgeTallResolveFrontThicknessMm($.value);
        }
        const ie = M?.querySelector("select");
        if (ie instanceof HTMLSelectElement) {
          Object.assign(y, l({ ...y, legComponentId: ie.value || null }));
        }
        const oe2 = p?.querySelector("input");
        if (oe2 instanceof HTMLInputElement) {
          y.doorOpen = oe2.checked === true;
        }
      }
    };
  };
  o();
  return {
    syncFromParams() {
      Object.assign(r0, fridgeTallBuildLegacyControlsParamsV2(e));
      i?.syncFromParams?.();
      o()?.applyToParams(e);
      o();
    }
  };
}