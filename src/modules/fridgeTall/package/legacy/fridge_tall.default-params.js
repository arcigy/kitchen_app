function fridgeTallDefaultsV2() {
  const n = fridgeTallSanitizeLegacyParamsV2(u0());
  n.assemblyContext = "kitchen";
  n.kitchenModuleRole = "tall";
  n.requiresWorktop = false;
  n.worktopThicknessMm = 0;
  n.height = typeof n.height === "number" && Number.isFinite(n.height) && n.height > 1816 ? n.height : 1916;
  n.plinthHeight = typeof n.plinthHeight === "number" && Number.isFinite(n.plinthHeight) && n.plinthHeight > 0 ? n.plinthHeight : 100;
  n.plinthSetbackMm = typeof n.plinthSetbackMm === "number" && Number.isFinite(n.plinthSetbackMm) && n.plinthSetbackMm >= 0 ? n.plinthSetbackMm : 60;
  n.legComponentId = typeof n.legComponentId === "string" && n.legComponentId.length > 0 ? n.legComponentId : "cmp.leg.adjustable.100.black";
  n.sideGap = 0;
  n.topGap = 0;
  n.bottomGap = 0;
  n.doorOpen = typeof n.doorOpen === "boolean" ? n.doorOpen : false;
  n.doorHandleOffsetFromSplitMm = 0;
  n.__fridgeHandleSplitScaleVersion = FRIDGE_HANDLE_SPLIT_SCALE_VERSION;
  n.materials ??= {};
  delete n.materials.drawerKey;
  delete n.materials.drawerColor;
  typeof n.materials.bodyColor === "string" && /^#[0-9a-fA-F]{6}$/.test(n.materials.bodyColor) || (n.materials.bodyColor = "#f3f3ef");
  typeof n.materials.frontColor === "string" && /^#[0-9a-fA-F]{6}$/.test(n.materials.frontColor) || (n.materials.frontColor = "#d7d9dd");
  n.frontThicknessMm = fridgeTallResolveFrontThicknessMm(n.frontThicknessMm);
  n.backThickness = fridgeTallResolveBackThicknessMm(n.backThickness);
  n.hingeComponentId = typeof n.hingeComponentId === "string" && n.hingeComponentId.length > 0 ? n.hingeComponentId : "cmp.hinge.fridge_integrated.softclose";
  fridgeTallNormalizeApplianceDrivenLayout(n);
  return n;
}