function cornerShelfLowerBuildV2(n) {
  const e = new St();
  e.name = "cornerShelfLowerModule";
  const parseCornerBoolean = (primaryValue, aliasValue, fallbackValue) => typeof aliasValue == "boolean" ? aliasValue : typeof primaryValue == "boolean" ? primaryValue : fallbackValue;
  const parseCornerString = (primaryValue, aliasValue, fallbackValue) => {
    if (typeof aliasValue == "string" && aliasValue.trim().length > 0) return aliasValue.trim();
    if (typeof primaryValue == "string" && primaryValue.trim().length > 0) return primaryValue.trim();
    return fallbackValue;
  };
  const parseCornerNumber = (primaryValue, aliasValue, fallbackValue) => {
    const aliasNumber = Number(aliasValue);
    if (Number.isFinite(aliasNumber)) return aliasNumber;
    const primaryNumber = Number(primaryValue);
    if (Number.isFinite(primaryNumber)) return primaryNumber;
    return fallbackValue;
  };
  const parseCornerNumberArray = (primaryValue, aliasValue) => {
    if (Array.isArray(primaryValue)) {
      const values = primaryValue.map((value) => Number(value)).filter((value) => Number.isFinite(value));
      if (values.length > 0) return values;
    }
    if (typeof aliasValue == "string" && aliasValue.trim().length > 0) {
      const values = aliasValue.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
      if (values.length > 0) return values;
    }
    return [];
  };
  n.doorDouble = parseCornerBoolean(n.doorDouble, n.doorDouble_corner, true);
  n.doorOpen = parseCornerBoolean(n.doorOpen, n.doorOpen_corner, false);
  n.hingeCountPerDoor = parseCornerNumber(n.hingeCountPerDoor, n.hingeCount_corner, 3);
  n.hingeSideFrontX = "right";
  n.hingeSideFrontZ = "right";
  n.hingeSideFrontX_corner = "right";
  n.hingeSideFrontZ_corner = "right";
  n.shelfAutoFit = parseCornerBoolean(n.shelfAutoFit, n.shelfAutoFit_corner, true);
  const resolvedCornerShelfGaps = parseCornerNumberArray(n.shelfGaps, n.shelfGaps_corner);
  if (resolvedCornerShelfGaps.length > 0) {
    n.shelfGaps = resolvedCornerShelfGaps;
  }
  const t = Math.max(400, Number(n.lengthX) || 1e3) * Qt;
  const i = Math.max(400, Number(n.lengthZ) || 1e3) * Qt;
  const o = Math.max(300, Number(n.depth) || 560) * Qt;
  const r = Math.max(200, Number(n.height) || 720) * Qt;
  const a = Math.max(5e-3, Number(n.boardThickness || 18) * Qt);
  const s = Math.max(3e-3, Number(n.backThickness || 6) * Qt);
  const l = Math.max(0, Number(n.plinthHeight || 0) * Qt);
  const assemblyContext = typeof n.assemblyContext === "string" ? n.assemblyContext : "kitchen";
  const kitchenModuleRole = n.kitchenModuleRole === "top" || n.kitchenModuleRole === "wall" || n.kitchenModuleRole === "tall" ? n.kitchenModuleRole : "base";
  const requiresWorktop = assemblyContext === "kitchen" ? typeof n.requiresWorktop == "boolean" ? n.requiresWorktop : kitchenModuleRole === "base" : false;
  const worktopThicknessMm = requiresWorktop ? Math.max(0, Number(n.worktopThicknessMm ?? 0) || 0) : 0;
  const heightCarcass = Math.max(
    50,
    Number(n.heightCarcass ?? Number(n.height ?? 720) - worktopThicknessMm) || Math.max(50, Number(n.height ?? 720) - worktopThicknessMm)
  );
  n.heightCarcass = Math.round(heightCarcass);
  n.height = Math.max(50, Math.round(heightCarcass + worktopThicknessMm));
  const worktopOffset = worktopThicknessMm * Qt;
  const c = Math.max(0, Number(n.plinthSetbackMm || 0) * Qt);
  const d = Math.max(5e-3, Number(n.boardThickness || 18) * Qt);
  const h = 2e-4;
  const f = Math.min(a, Math.max(0, Number(n.backGrooveDepthMm ?? 8) * Qt));
  const m = Math.min(Math.max(s, Number(n.backGrooveWidthMm ?? 8) * Qt), Math.max(s, o * 0.25));
  const v = Math.max(0, Number(n.backGrooveOffsetMm ?? 12) * Qt);
  const M = Math.min(f, Math.max(0, Number(n.backGrooveClearanceMm ?? 1) * Qt));
  const p = n.materials.bodyPbr ? Ui({ fallbackColor: n.materials.bodyColor, ref: n.materials.bodyPbr }) : new Xe({ color: Zl(n.materials.bodyColor), roughness: 0.85, metalness: 0 });
  const u = new Xe({ color: Zl(n.materials.frontColor), roughness: 0.65, metalness: 0 });
  const b = new Xe({ color: 4869978, roughness: 0.5, metalness: 0.15 });
  const x = new Xe({
    color: Zl(n.materials.backInsideColor ?? "#f4f4f4"),
    roughness: 0.86,
    metalness: 0.02
  });
  const E = new Xe({ color: 6317938, roughness: 0.7, metalness: 0.05 });
  const B = new Xe({ color: 3817291, roughness: 0.45, metalness: 0.35 });
  const A = (q, Y, ce = "none") => {
    q.userData.selectable = true;
    q.userData.dimensionsMm = { width: Y.width / Qt, height: Y.height / Qt, depth: Y.depth / Qt };
    q.userData.grainAlong = ce;
    n.materials.bodyPbr && Oi(q.geometry, { x: Y.width, y: Y.height, z: Y.depth }, ce, {
      texScaleM: Ii(n.materials.bodyPbr.id)
    });
  };
  const P = (q, Y, ce = "none") => {
    q.userData.selectable = true;
    q.userData.dimensionsMm = { ...Y };
    q.userData.grainAlong = ce;
  };
  const D = (q, Y) => {
    q.userData ?? (q.userData = {});
    q.userData.paramKeys = [...Y];
  };
  const S = -t / 2;
  const _ = -i / 2;
  const T = Math.max(0.1, n.heightCarcass * Qt - l);
  const I = Math.max(0, Number(n.sideGap ?? 0) * Qt);
  const z = Math.max(0, Number(n.topGap ?? 0) * Qt);
  const O = Math.max(0, Number(n.bottomGap ?? 0) * Qt);
  const R = Math.max(
    5e-3,
    (typeof n.frontThicknessMm == "number" ? n.frontThicknessMm : n.boardThickness) * Qt
  );
  const N = Math.max(R / 2 + 5e-3, Math.max(0, Number(n.legInsetMm ?? 30) * Qt));
  const G = Math.max(0.012, Math.max(20, Number(n.legDiameterMm ?? 40)) * Qt / 2);
  const V = Math.max(a / 2, Math.min(o / 2, Math.max(a / 2, m / 2)));
  const H = Ti(o - V - h);
  const ee = Math.max(1e-3, T - 2 * a + 2 * f - M);
  const j = Math.max(0, f - M / 2);
  {
    const q = new Se(a, T, o);
    const Y = new oe(q, p);
    Y.name = "side_end_x";
    Y.position.set(t / 2 - a / 2, l + T / 2, _ + o / 2);
    A(Y, { width: a, height: T, depth: o }, "height");
    D(Y, ["lengthX", "height", "depth", "boardThickness", "plinthHeight", "worktopThicknessMm"]);
    e.add(Y);
    const ce = new Se(o, T, a);
    const ye = new oe(ce, p);
    ye.name = "side_end_z";
    ye.position.set(S + o / 2, l + T / 2, i / 2 - a / 2);
    A(ye, { width: o, height: T, depth: a }, "height");
    D(ye, ["lengthZ", "height", "depth", "boardThickness", "plinthHeight", "worktopThicknessMm"]);
    e.add(ye);
  }
  {
    const backEdgeInset = Math.max(s / 2 + h, f - M / 2);
    const backSideInset = Math.max(a - j, V + s / 2);
    const backCornerPanelWidth = Math.min(Math.max(a * 3, 0.08), Math.max(a, H / 2 - 5e-3));
    const q = S + backSideInset;
    const Y = t / 2 - backSideInset;
    const ce = Ti(Y - q - h);
    const ye = new Se(ce, ee, s);
    const he = new oe(ye, x);
    he.name = "back_x";
    he.position.set(q + h / 2 + ce / 2, l + T / 2, _ + backEdgeInset);
    he.userData.allowOverlapWith = ["side_end_x", "bottom_x", "top_x"];
    he.userData.allowOverlapReason = "back panel in groove";
    A(he, { width: ce, height: ee, depth: s }, "width");
    D(he, [
      "lengthX",
      "height",
      "depth",
      "boardThickness",
      "backThickness",
      "backGrooveDepthMm",
      "backGrooveWidthMm",
      "backGrooveOffsetMm",
      "backGrooveClearanceMm",
      "plinthHeight",
      "worktopThicknessMm"
    ]);
    e.add(he);
    const backZStart = Math.max(_ + backSideInset, _ + backCornerPanelWidth);
    const Pe = i / 2 - backSideInset;
    const we = Ti(Pe - backZStart - h);
    const xe = new Se(s, ee, we);
    const Te = new oe(xe, x);
    Te.name = "back_z";
    Te.position.set(S + backEdgeInset, l + T / 2, backZStart + h / 2 + we / 2);
    Te.userData.allowOverlapWith = ["side_end_z", "bottom_z", "top_z"];
    Te.userData.allowOverlapReason = "back panel in groove";
    A(Te, { width: s, height: ee, depth: we }, "depth");
    D(Te, [
      "lengthZ",
      "height",
      "depth",
      "boardThickness",
      "backThickness",
      "backGrooveDepthMm",
      "backGrooveWidthMm",
      "backGrooveOffsetMm",
      "backGrooveClearanceMm",
      "plinthHeight",
      "worktopThicknessMm"
    ]);
    e.add(Te);
    const backCornerPanelHeight = Math.max(1e-3, T - 2 * a);
    const backCornerPanel = new Se(a, backCornerPanelHeight, backCornerPanelWidth);
    const backCornerPanelMesh = new oe(backCornerPanel, x);
    backCornerPanelMesh.name = "back_corner_panel";
    backCornerPanelMesh.position.set(
      S + a / 2,
      l + a + backCornerPanelHeight / 2,
      _ + backCornerPanelWidth / 2
    );
    backCornerPanelMesh.userData.allowOverlapWith = ["back_x", "back_z", "bottom_x", "top_x_back"];
    backCornerPanelMesh.userData.allowOverlapReason = "corner back support panel";
    A(backCornerPanelMesh, { width: a, height: backCornerPanelHeight, depth: backCornerPanelWidth }, "height");
    D(backCornerPanelMesh, [
      "lengthX",
      "height",
      "depth",
      "boardThickness",
      "backThickness",
      "backGrooveDepthMm",
      "backGrooveWidthMm",
      "backGrooveOffsetMm",
      "backGrooveClearanceMm",
      "plinthHeight",
      "worktopThicknessMm"
    ]);
    e.add(backCornerPanelMesh);
  }
  function addDeck(q, Y, ce, ye) {
    const he = S + V;
    const _e = t / 2 - a;
    const Pe = Ti(_e - he - h);
    if (Pe > 1e-4) {
      if (q === "top") {
        const topRailStartX = S;
        const topRailWidth = Ti(_e - topRailStartX - h);
        const railDepth = Math.min(Math.max(a * 3, 0.08), Math.max(a, H / 2 - 5e-3));
        const frontRail = new Se(topRailWidth, ce, railDepth);
        const frontRailMesh = new oe(frontRail, ye);
        frontRailMesh.name = "top_x_front";
        frontRailMesh.position.set(
          topRailStartX + h / 2 + topRailWidth / 2,
          Y,
          _ + V + h / 2 + H - railDepth / 2
        );
        frontRailMesh.userData.allowOverlapWith = ["side_end_x"];
        frontRailMesh.userData.allowOverlapReason = "top front rail overlaps side end panel";
        A(frontRailMesh, { width: topRailWidth, height: ce, depth: railDepth }, "width");
        D(frontRailMesh, [
          "lengthX",
          "height",
          "depth",
          "boardThickness",
          "worktopThicknessMm",
          "backGrooveWidthMm",
          "backGrooveDepthMm",
          "backGrooveClearanceMm"
        ]);
        e.add(frontRailMesh);
        const backRailStartX = S;
        const backRailWidth = Ti(_e - backRailStartX - h);
        const backRail = new Se(backRailWidth, ce, railDepth);
        const backRailMesh = new oe(backRail, ye);
        backRailMesh.name = "top_x_back";
        backRailMesh.position.set(
          backRailStartX + h / 2 + backRailWidth / 2,
          Y,
          _ + railDepth / 2
        );
        backRailMesh.userData.allowOverlapWith = ["side_end_x", "back_corner_panel"];
        backRailMesh.userData.allowOverlapReason = "top rear rail overlaps corner support panel";
        A(backRailMesh, { width: backRailWidth, height: ce, depth: railDepth }, "width");
        D(backRailMesh, [
          "lengthX",
          "height",
          "depth",
          "boardThickness",
          "worktopThicknessMm",
          "backGrooveWidthMm",
          "backGrooveDepthMm",
          "backGrooveClearanceMm"
        ]);
        e.add(backRailMesh);
      } else {
        const bottomStartX = q === "bottom" ? S : he;
        const bottomWidth = q === "bottom" ? Ti(_e - bottomStartX - h) : Pe;
        if (bottomWidth > 1e-4) {
          const bottomDepth = q === "bottom" ? o : H;
          const bottomCenterZ = q === "bottom" ? _ + bottomDepth / 2 : _ + V + h / 2 + H / 2;
          const we = new Se(bottomWidth, ce, bottomDepth);
          const xe = new oe(we, ye);
          xe.name = `${q}_x`;
          xe.position.set(bottomStartX + h / 2 + bottomWidth / 2, Y, bottomCenterZ);
          A(xe, { width: bottomWidth, height: ce, depth: bottomDepth }, "width");
          D(xe, [
            "lengthX",
            "height",
            "depth",
            "boardThickness",
            "worktopThicknessMm",
            "backGrooveWidthMm",
            "backGrooveDepthMm",
            "backGrooveClearanceMm"
          ]);
          e.add(xe);
        }
      }
    }
    const Te = _ + o;
    const Ae = q === "bottom" ? i / 2 : i / 2 - a;
    const Le = Ae - Te - h;
    if (Le <= 1e-4) return;
    const zDeckWidth = q === "bottom" || q === "top" ? o : H;
    const zDeckCenterX = q === "bottom" || q === "top" ? S + zDeckWidth / 2 : S + V + h / 2 + H / 2;
    const X = new Se(zDeckWidth, ce, Le);
    const Ee = new oe(X, ye);
    Ee.name = `${q}_z`;
    Ee.position.set(zDeckCenterX, Y, Te + h / 2 + Le / 2);
    A(Ee, { width: zDeckWidth, height: ce, depth: Le }, "depth");
    D(Ee, [
      "lengthZ",
      "height",
      "depth",
      "boardThickness",
      "worktopThicknessMm",
      "backGrooveWidthMm",
      "backGrooveDepthMm",
      "backGrooveClearanceMm"
    ]);
    e.add(Ee);
  }
  addDeck("bottom", l + a / 2, a, p);
  addDeck("top", l + T - a / 2, a, p);
  if (l > 0) {
    const q = new Xe({ color: 2764602, roughness: 0.6, metalness: 0.1 });
    const Y = new wt(G, G, l, 18);
    const ce = Math.max(G + 5e-3, N);
    const kickDepth = Math.min(a, o * 0.2);
    const Ee = Math.min(c, o / 2);
    const drawerLegReveal = 4e-3;
    const xKickFront = _ + o - Ee;
    const zKickFront = S + o - Ee;
    const xKickBack = xKickFront - kickDepth;
    const zKickBack = zKickFront - kickDepth;
    const frontLegZ = Math.max(
      _ + G + 5e-3,
      Math.min(_ + o - G - 0.01, xKickBack - G + drawerLegReveal)
    );
    const frontLegX = Math.max(
      S + G + 5e-3,
      Math.min(S + o - G - 0.01, zKickBack - G + drawerLegReveal)
    );
    const ye = Math.max(S + G + 5e-3, Math.min(t / 2 - G - 0.01, ce));
    const he = Math.max(_ + G + 5e-3, Math.min(_ + o - G - 0.01, ce));
    const _e = Math.max(S + G + 5e-3, Math.min(S + o - G - 0.01, ce));
    const Pe = Math.max(_ + G + 5e-3, Math.min(i / 2 - G - 0.01, ce));
    const weInnerXFront = Math.max(S + o + G + 5e-3, Math.min(t / 2 - G - 0.01, S + o + ce));
    const weInnerZFront = Math.max(_ + o + G + 5e-3, Math.min(i / 2 - G - 0.01, _ + o + ce));
    const we = [
      ["leg_inner_rear", S + ye, _ + he],
      ["leg_outer_x_rear", t / 2 - ye, _ + he],
      ["leg_outer_x_front", t / 2 - ye, frontLegZ],
      ["leg_inner_x_front", weInnerXFront, frontLegZ],
      ["leg_outer_z_rear", S + ye, i / 2 - Pe],
      ["leg_outer_z_front", frontLegX, i / 2 - Pe],
      ["leg_inner_z_front", frontLegX, weInnerZFront]
    ];
    for (const [xe, Te, Ae] of we) {
      const Le2 = new oe(Y, q);
      Le2.name = xe;
      Le2.position.set(Te, l / 2, Ae);
      P(
        Le2,
        { width: G * 2 * 1e3, height: n.plinthHeight, depth: G * 2 * 1e3 },
        "none"
      );
      D(Le2, [
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "lengthX",
        "lengthZ",
        "legInsetMm",
        "legDiameterMm"
      ]);
      e.add(Le2);
    }
    const pe = _ + o - kickDepth / 2 - Ee;
    const Ce = S + o - kickDepth / 2 - Ee;
    const Fe = G + 4e-3;
    const Ne = 0.016;
    const Ue = Math.PI * 0.35;
    const qe = new wt(Fe, Fe, Ne, 24, 1, true, Ue / 2, Math.PI * 2 - Ue);
    const He = 0.03;
    const Je = 0.012;
    const Ze = 0.012;
    const ft = new Se(He, Je, Ze);
    const gt = 0.01;
    const et = 0.016;
    const ht = Math.max(Ne / 2, Math.min(l - Ne / 2 - 4e-3, Math.max(0.04, l * 0.35)));
    const rt = G + 3e-3;
    const clipFaceGap = 3e-3;
    const kickBackZ = pe - kickDepth / 2;
    const kickBackX = Ce - kickDepth / 2;
    const vt = (Le2, X2, Ee02) => {
      const de02 = new St();
      de02.name = `${Le2}_group`;
      de02.position.set(X2, ht, Ee02);
      const pe0 = new oe(qe, E);
      pe0.name = `${Le2}_collar`;
      pe0.rotation.y = Math.PI;
      A(pe0, { width: Fe * 2, height: Ne, depth: Fe * 2 }, "none");
      D(pe0, [
        "plinthHeight",
        "plinthSetbackMm",
        "depth",
        "lengthX",
        "lengthZ",
        "boardThickness",
        "legDiameterMm"
      ]);
      de02.add(pe0);
      return de02;
    };
    const Pt = (Le2, X2, Ee02, de02) => {
      const pe0 = vt(Le2, X2, Ee02);
      const Ce0 = Math.max(5e-3, de02 - Ee02 - Ze / 2 - clipFaceGap);
      const Fe0 = new oe(ft, E);
      Fe0.name = `${Le2}_pad`;
      Fe0.position.set(0, 0, Ce0);
      A(Fe0, { width: He, height: Je, depth: Ze }, "none");
      D(Fe0, ["plinthHeight", "plinthSetbackMm", "depth", "boardThickness"]);
      pe0.add(Fe0);
      const Ne0 = Math.max(5e-3, Ce0 - Ze / 2 - rt - 2e-3);
      const Ue0 = new Se(et, gt, Ne0);
      const qe0 = new oe(Ue0, E);
      qe0.name = `${Le2}_arm`;
      qe0.position.set(0, -Je / 2 + gt / 2, rt + 1e-3 + Ne0 / 2);
      A(qe0, { width: et, height: gt, depth: Ne0 }, "none");
      D(qe0, ["plinthHeight", "plinthSetbackMm", "depth"]);
      pe0.add(qe0);
      e.add(pe0);
    };
    const yt = (Le2, X2, Ee02, de02) => {
      const pe0 = vt(Le2, X2, Ee02);
      const Ce0 = Math.max(5e-3, de02 - X2 - He / 2 - clipFaceGap);
      const Fe0 = new oe(ft, E);
      Fe0.name = `${Le2}_pad`;
      Fe0.position.set(Ce0, 0, 0);
      A(Fe0, { width: He, height: Je, depth: Ze }, "none");
      D(Fe0, ["plinthHeight", "plinthSetbackMm", "depth", "boardThickness"]);
      pe0.add(Fe0);
      const Ne0 = Math.max(5e-3, Ce0 - He / 2 - rt - 2e-3);
      const Ue0 = new Se(Ne0, gt, et);
      const qe0 = new oe(Ue0, E);
      qe0.name = `${Le2}_arm`;
      qe0.position.set(rt + 1e-3 + Ne0 / 2, -Je / 2 + gt / 2, 0);
      A(qe0, { width: Ne0, height: gt, depth: et }, "none");
      D(qe0, ["plinthHeight", "plinthSetbackMm", "depth"]);
      pe0.add(qe0);
      e.add(pe0);
    };
    Pt("kickClip_x_outer", t / 2 - ye, frontLegZ, kickBackZ);
    Pt("kickClip_x_inner", weInnerXFront, frontLegZ, kickBackZ);
    yt("kickClip_z_outer", frontLegX, i / 2 - Pe, kickBackX);
    yt("kickClip_z_inner", frontLegX, weInnerZFront, kickBackX);
    const Le = S + o - Ee - kickDepth;
    const X = t / 2 - Le;
    if (X > 1e-4) {
      const Ee02 = new Se(X, l, kickDepth);
      const de02 = new oe(Ee02, p);
      de02.name = "kick_x";
      de02.position.set(Le + X / 2, l / 2, pe);
      A(de02, { width: X, height: l, depth: kickDepth }, "width");
      D(de02, ["plinthHeight", "plinthSetbackMm", "depth", "lengthX", "boardThickness"]);
      e.add(de02);
    }
    const Ee0 = _ + o - Ee;
    const de0 = i / 2 - Ee0;
    if (de0 > 1e-4) {
      const pe0 = new Se(kickDepth, l, de0);
      const Ce0 = new oe(pe0, p);
      Ce0.name = "kick_z";
      Ce0.position.set(Ce, l / 2, Ee0 + de0 / 2);
      A(Ce0, { width: kickDepth, height: l, depth: de0 }, "depth");
      D(Ce0, ["plinthHeight", "plinthSetbackMm", "depth", "lengthZ", "boardThickness"]);
      e.add(Ce0);
    }
  }
  const cornerShelfWorldYPositions = [];
  {
    const q = Math.max(1, Math.round(n.shelfCount));
    const Y = Math.max(0, q - 1);
    const ce = l + a;
    const shelfLayoutParams = {
      ...n,
      height: Math.max(50, Number(n.height || 720) - worktopThicknessMm),
      worktopThicknessMm: 0
    };
    const ye = n.shelfAutoFit === true ? Gn({ ...shelfLayoutParams, shelfGaps: [] }) : Gn(shelfLayoutParams);
    for (let he = 0; he < Y; he += 1) {
      const _e = ye[he] ?? 0;
      const Pe = ce + _e * Qt;
      cornerShelfWorldYPositions.push(Pe);
      const we = p.clone();
      we.polygonOffset = true;
      we.polygonOffsetFactor = 1;
      we.polygonOffsetUnits = 1;
      const xe = Ti(t - a - V);
      if (xe > 1e-4) {
        const Te2 = new Se(xe, d, H);
        const Ae2 = new oe(Te2, we);
        Ae2.name = `shelf_${he + 1}_x`;
        Ae2.position.set(S + V + xe / 2, Pe, _ + V + H / 2);
        A(Ae2, { width: xe, height: d, depth: H }, "width");
        D(Ae2, [
          "shelfCount",
          "shelfAutoFit",
          "shelfGaps",
          "height",
          "worktopThicknessMm",
          "plinthHeight",
          "boardThickness",
          "backGrooveWidthMm"
        ]);
        e.add(Ae2);
      }
      const Te = _ + o;
      const Ae = Math.max(0, i / 2 - a - Te);
      if (Ae > 1e-4) {
        const Le = new Se(H, d, Ae);
        const X = new oe(Le, we);
        X.name = `shelf_${he + 1}_z`;
        X.position.set(S + V + H / 2, Pe, Te + Ae / 2);
        A(X, { width: H, height: d, depth: Ae }, "depth");
        D(X, [
          "shelfCount",
          "shelfAutoFit",
          "shelfGaps",
          "height",
          "worktopThicknessMm",
          "plinthHeight",
          "boardThickness",
          "backGrooveWidthMm"
        ]);
        e.add(X);
      }
    }
  }
  {
    const buildCornerDoorHingeLocalYs = (doorHeight, hingeCount, topInset, bottomInset, hingeBodyHeight) => {
      const clampedCount = Math.max(1, Math.round(hingeCount));
      const fixedEdgeInset = 0.05;
      const topLimit = doorHeight / 2 - fixedEdgeInset;
      const bottomLimit = -doorHeight / 2 + fixedEdgeInset;
      const lowerBound = Math.min(bottomLimit, topLimit);
      const upperBound = Math.max(bottomLimit, topLimit);
      const fallbackLinear = () => {
        if (clampedCount === 1) {
          return [(lowerBound + upperBound) / 2];
        }
        const span = upperBound - lowerBound;
        if (span <= 1e-4) {
          return Array.from({ length: clampedCount }, () => (lowerBound + upperBound) / 2);
        }
        return Array.from({ length: clampedCount }, (_2, index) => lowerBound + span * index / (clampedCount - 1));
      };
      if (upperBound - lowerBound <= 1e-4 || cornerShelfWorldYPositions.length === 0) {
        return fallbackLinear();
      }
      const shelfAvoidanceHalfSpan = d / 2 + hingeBodyHeight / 2 + 8e-3;
      const blockedRanges = cornerShelfWorldYPositions.map((worldY) => worldY - ge).map((localY) => [Math.max(lowerBound, localY - shelfAvoidanceHalfSpan), Math.min(upperBound, localY + shelfAvoidanceHalfSpan)]).filter(([start, end]) => end - start > 1e-4).sort((left, right) => left[0] - right[0]);
      const mergedBlockedRanges = [];
      for (const [start, end] of blockedRanges) {
        const previous = mergedBlockedRanges[mergedBlockedRanges.length - 1];
        if (!previous || start > previous[1] + 1e-4) {
          mergedBlockedRanges.push([start, end]);
        } else {
          previous[1] = Math.max(previous[1], end);
        }
      }
      const allowedRanges = [];
      let cursor = lowerBound;
      for (const [start, end] of mergedBlockedRanges) {
        if (start - cursor > 1e-4) {
          allowedRanges.push([cursor, start]);
        }
        cursor = Math.max(cursor, end);
      }
      if (upperBound - cursor > 1e-4) {
        allowedRanges.push([cursor, upperBound]);
      }
      if (allowedRanges.length === 0) {
        return fallbackLinear();
      }
      if (clampedCount === 1) {
        const largestAllowedRange = allowedRanges.reduce(
          (bestRange, range) => range[1] - range[0] > bestRange[1] - bestRange[0] ? range : bestRange,
          allowedRanges[0]
        );
        return [largestAllowedRange ? (largestAllowedRange[0] + largestAllowedRange[1]) / 2 : (lowerBound + upperBound) / 2];
      }
      const lowerEdge = lowerBound;
      const upperEdge = upperBound;
      if (clampedCount === 2) {
        return [lowerEdge, upperEdge];
      }
      const middleCount = Math.max(0, clampedCount - 2);
      const middleLowerBound = lowerEdge + hingeBodyHeight;
      const middleUpperBound = upperEdge - hingeBodyHeight;
      if (middleCount <= 0 || middleUpperBound - middleLowerBound <= 1e-4) {
        return [lowerEdge, upperEdge];
      }
      const allowedMiddleRanges = allowedRanges.map(([start, end]) => [Math.max(start, middleLowerBound), Math.min(end, middleUpperBound)]).filter(([start, end]) => end - start > 1e-4);
      if (allowedMiddleRanges.length === 0) {
        return [lowerEdge, upperEdge];
      }
      const totalMiddleSpan = allowedMiddleRanges.reduce((sum, [start, end]) => sum + (end - start), 0);
      if (totalMiddleSpan <= 1e-4) {
        return [lowerEdge, upperEdge];
      }
      const resolvePositionAlongMiddleRanges = (distance) => {
        let remaining = Math.max(0, Math.min(totalMiddleSpan, distance));
        for (const [start, end] of allowedMiddleRanges) {
          const span = end - start;
          if (remaining <= span) {
            return start + remaining;
          }
          remaining -= span;
        }
        const lastRange = allowedMiddleRanges[allowedMiddleRanges.length - 1];
        return lastRange ? lastRange[1] : (middleLowerBound + middleUpperBound) / 2;
      };
      const resolvedMiddlePositions = Array.from(
        { length: middleCount },
        (_2, index) => resolvePositionAlongMiddleRanges(totalMiddleSpan * (index + 1) / (middleCount + 1))
      );
      return [lowerEdge, ...resolvedMiddlePositions, upperEdge];
    };
    const addHandleOnZFace = (Le, X, Ee0, de0, pe0, Ce0) => {
      if (n.handleType === "none") return;
      const Ne0 = Math.max(0, Number(n.handleLengthMm) || 0) * Qt;
      const Ue0 = Math.max(0, Number(n.handleSizeMm) || 0) * Qt;
      const qe0 = Math.max(0, Number(n.handleProjectionMm) || 0) * Qt;
      const He0 = Math.max(0, Number(n.handlePositionMm) || 0) * Qt;
      const Je0 = new Xe({ color: 3817291, roughness: 0.55, metalness: 0.1 });
      if (n.handleType === "gola") {
        const Ze02 = Math.min(Math.max(Ue0 || 0.012, 6e-3), 0.05);
        const ft02 = Math.min(Math.max(qe0 || 0.012, 6e-3), 0.04);
        const gt02 = Math.min(Math.max(Ne0 > 0 ? Ne0 : Ee0, 0.06), Ee0);
        const et02 = new Se(gt02, Ze02, ft02);
        const ct02 = new oe(et02, Je0);
        ct02.name = Le;
        ct02.position.set(0, de0 / 2 - Ze02 / 2 - 2e-3, pe0 / 2 - ft02 / 2 + 2e-3);
        A(ct02, { width: gt02, height: Ze02, depth: ft02 }, "none");
        D(ct02, ["handleComponentId", "handleType", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]);
        X.add(ct02);
        return;
      }
      const Ze0 = Math.max(-de0 / 2 + 0.03, Math.min(de0 / 2 - 0.03, de0 / 2 - He0));
      if (n.handleType === "knob") {
        const ft02 = Math.min(Math.max((Ue0 > 0 ? Ue0 : 0.024) / 2, 6e-3), 0.03);
        const gt02 = Math.min(Math.max(qe0 > 0 ? qe0 : 0.018, 8e-3), 0.06);
        const et02 = new wt(ft02, ft02, gt02, 18);
        const ct02 = new oe(et02, Je0);
        ct02.name = Le;
        ct02.rotation.x = Math.PI / 2;
        ct02.position.set(Ce0, Ze0, pe0 / 2 + gt02 / 2);
        A(ct02, { width: ft02 * 2, height: ft02 * 2, depth: gt02 }, "none");
        D(ct02, ["handleComponentId", "handleType", "handlePositionMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]);
        X.add(ct02);
        return;
      }
      const ft0 = Math.min(Math.max(Ne0 > 0 ? Ne0 : Math.min(Ee0 * 0.6, 0.35), 0.06), Math.max(0.08, Ee0 * 0.95));
      const gt0 = Math.min(Math.max(Ue0 > 0 ? Ue0 : 0.012, 6e-3), 0.05);
      const et0 = Math.min(Math.max(qe0 > 0 ? qe0 : 0.012, 6e-3), 0.06);
      const ct0 = new Se(ft0, gt0, et0);
      const ht0 = new oe(ct0, Je0);
      ht0.name = Le;
      ht0.position.set(Ce0, Ze0, pe0 / 2 + et0 / 2);
      A(ht0, { width: ft0, height: gt0, depth: et0 }, "none");
      D(ht0, ["handleComponentId", "handleType", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]);
      X.add(ht0);
      if (n.handleType === "cup") {
        const rt0 = Math.min(ft0 * 0.7, Math.max(0.06, ft0 - 0.08));
        const vt0 = [-rt0 / 2, rt0 / 2];
        for (let Pt0 = 0; Pt0 < vt0.length; Pt0 += 1) {
          const yt0 = new wt(4e-3, 4e-3, 3e-3, 16);
          const Lt0 = new oe(yt0, Je0);
          Lt0.name = `${Le}_screw_${Pt0 + 1}`;
          Lt0.rotation.x = Math.PI / 2;
          Lt0.position.set(Ce0 + vt0[Pt0], Ze0, pe0 / 2 - 15e-4);
          A(Lt0, { width: 8e-3, height: 8e-3, depth: 3e-3 }, "none");
          X.add(Lt0);
        }
      }
    };
    const addHandleOnXFace = (Le, X, Ee0, de0, pe0, Ce0) => {
      if (n.handleType === "none") return;
      const Ne0 = Math.max(0, Number(n.handleLengthMm) || 0) * Qt;
      const Ue0 = Math.max(0, Number(n.handleSizeMm) || 0) * Qt;
      const qe0 = Math.max(0, Number(n.handleProjectionMm) || 0) * Qt;
      const He0 = Math.max(0, Number(n.handlePositionMm) || 0) * Qt;
      const Je0 = new Xe({ color: 3817291, roughness: 0.55, metalness: 0.1 });
      if (n.handleType === "gola") {
        const Ze02 = Math.min(Math.max(Ue0 || 0.012, 6e-3), 0.05);
        const ft02 = Math.min(Math.max(qe0 || 0.012, 6e-3), 0.04);
        const gt02 = Math.min(Math.max(Ne0 > 0 ? Ne0 : pe0, 0.06), pe0);
        const et02 = new Se(ft02, Ze02, gt02);
        const ct02 = new oe(et02, Je0);
        ct02.name = Le;
        ct02.position.set(Ee0 / 2 - ft02 / 2 + 2e-3, de0 / 2 - Ze02 / 2 - 2e-3, Ce0);
        A(ct02, { width: ft02, height: Ze02, depth: gt02 }, "none");
        D(ct02, ["handleComponentId", "handleType", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]);
        X.add(ct02);
        return;
      }
      const Ze0 = Math.max(-de0 / 2 + 0.03, Math.min(de0 / 2 - 0.03, de0 / 2 - He0));
      if (n.handleType === "knob") {
        const ft02 = Math.min(Math.max((Ue0 > 0 ? Ue0 : 0.024) / 2, 6e-3), 0.03);
        const gt02 = Math.min(Math.max(qe0 > 0 ? qe0 : 0.018, 8e-3), 0.06);
        const et02 = new wt(ft02, ft02, gt02, 18);
        const ct02 = new oe(et02, Je0);
        ct02.name = Le;
        ct02.rotation.z = Math.PI / 2;
        ct02.position.set(Ee0 / 2 + gt02 / 2, Ze0, Ce0);
        A(ct02, { width: gt02, height: ft02 * 2, depth: ft02 * 2 }, "none");
        D(ct02, ["handleComponentId", "handleType", "handlePositionMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]);
        X.add(ct02);
        return;
      }
      const ft0 = Math.min(Math.max(Ne0 > 0 ? Ne0 : Math.min(pe0 * 0.6, 0.35), 0.06), Math.max(0.08, pe0 * 0.95));
      const gt0 = Math.min(Math.max(Ue0 > 0 ? Ue0 : 0.012, 6e-3), 0.05);
      const et0 = Math.min(Math.max(qe0 > 0 ? qe0 : 0.012, 6e-3), 0.06);
      const ct0 = new Se(et0, gt0, ft0);
      const ht0 = new oe(ct0, Je0);
      ht0.name = Le;
      ht0.position.set(Ee0 / 2 + et0 / 2, Ze0, Ce0);
      A(ht0, { width: et0, height: gt0, depth: ft0 }, "none");
      D(ht0, ["handleComponentId", "handleType", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]);
      X.add(ht0);
      if (n.handleType === "cup") {
        const rt0 = Math.min(ft0 * 0.7, Math.max(0.06, ft0 - 0.08));
        const vt0 = [-rt0 / 2, rt0 / 2];
        for (let Pt0 = 0; Pt0 < vt0.length; Pt0 += 1) {
          const yt0 = new wt(4e-3, 4e-3, 3e-3, 16);
          const Lt0 = new oe(yt0, Je0);
          Lt0.name = `${Le}_screw_${Pt0 + 1}`;
          Lt0.rotation.z = Math.PI / 2;
          Lt0.position.set(Ee0 / 2 - 15e-4, Ze0, Ce0 + vt0[Pt0]);
          A(Lt0, { width: 3e-3, height: 8e-3, depth: 8e-3 }, "none");
          X.add(Lt0);
        }
      }
    };
    const q = (Le, X, Ee0, de0, pe0, Ce0, Fe0) => {
      const Ne0 = Math.max(0.05, de0 - Ee0);
      const Ue0 = Ce0 === "left" ? Ee0 : de0;
      const qe0 = new St();
      qe0.name = `${Le}_pivot`;
      qe0.position.set(Ue0, ge, pe0);
      qe0.rotation.y = Ce0 === "left" ? -Fe0 : Fe0;
      const He0 = new Se(Ne0, be, te);
      const Je0 = new oe(He0, u);
      Je0.name = Le;
      Je0.position.set(Ce0 === "left" ? Ne0 / 2 : -Ne0 / 2, 0, 0);
      A(Je0, { width: Ne0, height: be, depth: te }, "height");
      D(Je0, [
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "frontThicknessMm",
        "doorOpen",
        "hingeSideFrontZ",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "handleComponentId",
        "handleType",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm"
      ]);
      qe0.add(Je0);
      const Ze0 = Ce0 === "left" ? Ne0 / 2 - 0.04 : -Ne0 / 2 + 0.04;
      addHandleOnZFace("doorHandle_front_z", qe0, Ne0, be, te, Ze0);
      he(qe0, X, Ce0 === "left" ? 1 : -1, Ne0);
      e.add(qe0);
      return { pivot: qe0, doorW: Ne0 };
    };
    const Y = (Le, X, Ee0, de0, pe0, Ce0, Fe0, Ne0) => {
      const Ue0 = Math.max(0.05, de0 - Ee0);
      const qe0 = Ce0 === "left" ? Ee0 : de0;
      const He0 = new St();
      He0.name = `${Le}_pivot`;
      He0.position.set(pe0, ge, qe0);
      He0.rotation.y = Ce0 === "left" ? Ne0 : -Ne0;
      const Je0 = new Se(te, be, Ue0);
      const Ze0 = new oe(Je0, u);
      Ze0.name = Le;
      Ze0.position.set(0, 0, Ce0 === "left" ? Ue0 / 2 : -Ue0 / 2);
      A(Ze0, { width: te, height: be, depth: Ue0 }, "height");
      D(Ze0, [
        "height",
        "plinthHeight",
        "worktopThicknessMm",
        "frontThicknessMm",
        "doorOpen",
        "hingeSideFrontX",
        "hingeCountPerDoor",
        "hingeTopOffsetMm",
        "hingeBottomOffsetMm",
        "handleComponentId",
        "handleType",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm"
      ]);
      He0.add(Ze0);
      const ft0 = Ce0 === "left" ? Ue0 / 2 - 0.04 : -Ue0 / 2 + 0.04;
      addHandleOnXFace("doorHandle_front_x", He0, te, be, Ue0, ft0);
      ve(He0, X, Ce0 === "left" ? 1 : -1, Ue0);
      e.add(He0);
    };
    const ce = (Le, X) => {
      const Ee0 = new Se(6e-3, 0.045, 0.014);
      const de0 = -X + 6e-3 / 2 + 4e-3;
      const pe0 = -te / 2 - 0.014 / 2 - 1e-3;
      buildCornerDoorHingeLocalYs(be, re, fe, me, 0.045).forEach((Ce0, Fe0) => {
        const Ne0 = new oe(Ee0, b);
        Ne0.name = `bifold_hinge_${Fe0 + 1}`;
        Ne0.position.set(de0, Ce0, pe0);
        A(Ne0, { width: 6e-3, height: 0.045, depth: 0.014 }, "none");
        Le.add(Ne0);
      });
    };
    const he = (Le, X, Ee0, de0) => {
      const hingeWidth = 0.062;
      const hingeHeight = 0.034;
      const hingeThickness = 25e-4;
      const cupDiameter = 0.026;
      const cupDepth = 0.01;
      const armWidth = 0.011;
      const armHeight = 8e-3;
      const armDepth = 0.012;
      const sideDirection = Ee0;
      const hingeEdgeInset = 6e-3;
      const sideOffset = sideDirection > 0 ? hingeWidth / 2 + hingeEdgeInset : -hingeWidth / 2 - hingeEdgeInset;
      const doorPlateZ = -te / 2 - hingeThickness / 2 - 15e-4;
      const cupZ = -te / 2 + cupDepth / 2 + 3e-4;
      const armZ = -te / 2 - hingeThickness - armDepth / 2 - 15e-4;
      buildCornerDoorHingeLocalYs(be, re, fe, me, hingeHeight).forEach((Fe0, Ne0) => {
        const doorPlate = new oe(new Se(hingeWidth, hingeHeight, hingeThickness), b);
        doorPlate.name = `${X}_${Ne0 + 1}_door_plate`;
        doorPlate.userData.catalogComponentId = hingeCatalogId;
        doorPlate.position.set(sideOffset, Fe0, doorPlateZ);
        A(doorPlate, { width: hingeWidth, height: hingeHeight, depth: hingeThickness }, "none");
        Le.add(doorPlate);
        const hingeCup = new oe(new wt(cupDiameter / 2, cupDiameter / 2, cupDepth, 18), b);
        hingeCup.name = `${X}_${Ne0 + 1}_door_cup`;
        hingeCup.userData.catalogComponentId = hingeCatalogId;
        hingeCup.rotation.x = Math.PI / 2;
        hingeCup.position.set(sideOffset, Fe0, cupZ);
        A(hingeCup, { width: cupDiameter, height: cupDiameter, depth: cupDepth }, "none");
        Le.add(hingeCup);
        const hingeArm = new oe(new Se(armWidth, armHeight, armDepth), b);
        hingeArm.name = `${X}_${Ne0 + 1}_arm`;
        hingeArm.userData.catalogComponentId = hingeCatalogId;
        hingeArm.position.set(sideOffset, Fe0, armZ);
        A(hingeArm, { width: armWidth, height: armHeight, depth: armDepth }, "none");
        Le.add(hingeArm);
      });
    };
    const ve = (Le, X, Ee0, de0) => {
      const hingeWidth = 0.062;
      const hingeHeight = 0.034;
      const hingeThickness = 25e-4;
      const cupDiameter = 0.026;
      const cupDepth = 0.01;
      const armWidth = 0.011;
      const armHeight = 8e-3;
      const armDepth = 0.012;
      const sideDirection = Ee0;
      const hingeEdgeInset = 6e-3;
      const sideOffset = sideDirection > 0 ? hingeWidth / 2 + hingeEdgeInset : -hingeWidth / 2 - hingeEdgeInset;
      const doorPlateX = -te / 2 - hingeThickness / 2 - 15e-4;
      const cupX = -te / 2 + cupDepth / 2 + 3e-4;
      const armX = -te / 2 - hingeThickness - armDepth / 2 - 15e-4;
      buildCornerDoorHingeLocalYs(be, re, fe, me, hingeHeight).forEach((Fe0, Ne0) => {
        const doorPlate = new oe(new Se(hingeThickness, hingeHeight, hingeWidth), b);
        doorPlate.name = `${X}_${Ne0 + 1}_door_plate`;
        doorPlate.userData.catalogComponentId = hingeCatalogId;
        doorPlate.position.set(doorPlateX, Fe0, sideOffset);
        A(doorPlate, { width: hingeThickness, height: hingeHeight, depth: hingeWidth }, "none");
        Le.add(doorPlate);
        const hingeCup = new oe(new wt(cupDiameter / 2, cupDiameter / 2, cupDepth, 18), b);
        hingeCup.name = `${X}_${Ne0 + 1}_door_cup`;
        hingeCup.userData.catalogComponentId = hingeCatalogId;
        hingeCup.rotation.z = Math.PI / 2;
        hingeCup.position.set(cupX, Fe0, sideOffset);
        A(hingeCup, { width: cupDepth, height: cupDiameter, depth: cupDiameter }, "none");
        Le.add(hingeCup);
        const hingeArm = new oe(new Se(armDepth, armHeight, armWidth), b);
        hingeArm.name = `${X}_${Ne0 + 1}_arm`;
        hingeArm.userData.catalogComponentId = hingeCatalogId;
        hingeArm.position.set(armX, Fe0, sideOffset);
        A(hingeArm, { width: armDepth, height: armHeight, depth: armWidth }, "none");
        Le.add(hingeArm);
      });
    };
    const te = R;
    const be = Math.max(0.1, T - z - O);
    const ge = l + O + be / 2;
    const we = n.doorOpen ? Math.PI / 2 : 0;
    const re = N0(n.hingeCountPerDoor, 1, 6);
    const hingeCatalogId = typeof n.hingeComponentId == "string" && n.hingeComponentId.trim().length > 0 ? n.hingeComponentId.trim() : "cmp.hinge.corner.45.softclose";
    const fe = Math.max(0, n.hingeTopOffsetMm) * Qt;
    const me = Math.max(0, n.hingeBottomOffsetMm) * Qt;
    const ke = 2e-4;
    const ae = S + o;
    const y = _ + o;
    const g = Math.max(0, t - o - 2 * I);
    const W = Math.max(0, i - o - 2 * I);
    const cornerDoorRelief = n.doorDouble && g > 1e-4 && W > 1e-4 ? 0.018 : 0;
    const cornerDoorReliefX = cornerDoorRelief;
    if (g > 1e-4) {
      const $ = q(
        "door_front_z",
        "hinge_front_z",
        ae + I + cornerDoorRelief,
        ae + I + g,
        y + te / 2 + ke,
        n.hingeSideFrontZ,
        we
      );
      if (n.doorDouble && W > 1e-4) {
        Y(
          "door_front_x",
          "hinge_front_x",
          y + I + cornerDoorReliefX,
          y + I + W,
          ae + te / 2 + ke,
          n.hingeSideFrontX,
          we,
          we
        );
      }
    }
  }
  return e;
}