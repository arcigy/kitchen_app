function cornerShelfLowerDefaultsV2() {
  const n = {
    type: "corner_shelf_lower",
    lengthX: 1e3,
    lengthZ: 1e3,
    depth: 560,
    height: 720,
    heightCarcass: 682,
    boardThickness: 18,
    backThickness: 6,
    backGrooveDepthMm: 8,
    backGrooveWidthMm: 8,
    backGrooveOffsetMm: 12,
    backGrooveClearanceMm: 1,
    plinthHeight: 100,
    plinthSetbackMm: 60,
    shelfCount: 4,
    shelfAutoFit: true,
    shelfGaps: [],
    doorDouble: true,
    doorOpen: false,
    hingeCountPerDoor: 2,
    hingeComponentId: "cmp.hinge.corner.45.softclose",
    hingeTopOffsetMm: 110,
    hingeBottomOffsetMm: 110,
    clipComponentId: "cmp.clip.plinth.standard",
    frontThicknessMm: 19,
    sideGap: 2,
    topGap: 2,
    bottomGap: 2,
    handleComponentId: "cmp.handle.bar.160.inox",
    handleType: "bar",
    handlePositionMm: 60,
    handleLengthMm: 160,
    handleSizeMm: 12,
    handleProjectionMm: 14,
    legInsetMm: 30,
    legDiameterMm: 40,
    assemblyContext: "kitchen",
    kitchenModuleRole: "base",
    legComponentId: "cmp.leg.adjustable.100.black",
    requiresWorktop: true,
    worktopThicknessMm: 38,
    materials: Vn({
      drawerKey: "drawer_unused",
      bodyPbr: {
        id: "wood_veneer_oak_7760_1k",
        rotationDeg: 0,
        tintStrength: 0
      }
    })
  };
  const cornerDefaultWorktopThickness = typeof n.worktopThicknessMm === "number" ? n.worktopThicknessMm : 0;
  n.heightCarcass = Math.max(50, Math.round(Number(n.height ?? 720) - cornerDefaultWorktopThickness));
  return n.shelfGaps = wn({
    ...n,
    height: Math.max(50, Number(n.heightCarcass || Number(n.height || 720) - Number(n.worktopThicknessMm || 0))),
    worktopThicknessMm: 0
  }), n;
}