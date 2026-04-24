function swingShelvesLowDefaultsV2() {
  const n = {
    type: "swing_shelves_low",
    width: 800,
    height: 700,
    heightCarcass: 662,
    worktopThicknessMm: 38,
    depth: 560,
    boardThickness: 18,
    shelfThickness: 18,
    backThickness: 6,
    backGrooveDepthMm: 8,
    backGrooveWidthMm: 8,
    backGrooveOffsetMm: 12,
    backGrooveClearanceMm: 1,
    plinthHeight: 100,
    plinthSetbackMm: 60,
    frontGap: 2,
    sideGap: 2,
    topGap: 2,
    bottomGap: 2,
    frontThicknessMm: 19,
    shelfCount: 4,
    shelfAutoFit: true,
    shelfGaps: [],
    doorDouble: true,
    doorOpen: false,
    hingeCountPerDoor: 2,
    hingeComponentId: "cmp.hinge.clip_on.softclose",
    hingeTopOffsetMm: 110,
    hingeBottomOffsetMm: 110,
    clipComponentId: "cmp.clip.plinth.standard",
    handleComponentId: "cmp.handle.bar.160.black",
    handleType: "bar",
    handlePositionMm: 60,
    handleLengthMm: 160,
    handleSizeMm: 12,
    handleProjectionMm: 14,
    assemblyContext: "kitchen",
    kitchenModuleRole: "base",
    legComponentId: "cmp.leg.adjustable.100.black",
    requiresWorktop: true,
    materials: Vn()
  };
  const worktopThickness = typeof n.worktopThicknessMm === "number" ? n.worktopThicknessMm : 0;
  n.heightCarcass = Math.max(50, Math.round(Number(n.height ?? 700) - worktopThickness));
  n.shelfGaps = wn({
    ...n,
    height: Math.max(50, n.heightCarcass),
    worktopThicknessMm: 0
  });
  return n;
}