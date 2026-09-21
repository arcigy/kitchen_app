import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clone(value) {
  return structuredClone(value);
}

function moduleSignature(inst) {
  return JSON.stringify({
    positionM: inst.positionM,
    structuralWorldBoxM: inst.structuralWorldBoxM,
    realizedDepthMm: inst.realizedDepthMm,
    structuralDepthMm: inst.structuralDepthMm,
    parts: (inst.parts ?? [])
      .map((part) => ({
        name: part.name,
        positionM: part.positionM,
        worldPositionM: part.worldPositionM,
        scale: part.scale,
        dimensionsMm: part.dimensionsMm,
        colorHex: part.colorHex
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  });
}

function expect(condition, message, context) {
  if (!condition) {
    const error = new Error(message);
    error.context = context;
    throw error;
  }
}

function dominantFrontAxis(inst) {
  return Math.abs(inst.frontVectorM?.x ?? 0) >= Math.abs(inst.frontVectorM?.z ?? 0) ? "x" : "z";
}

function backLockedDeltaMm(before, after) {
  const axis = dominantFrontAxis(before);
  const beforeValue = axis === "x" ? before.worldBackCenterM.x : before.worldBackCenterM.z;
  const afterValue = axis === "x" ? after.worldBackCenterM.x : after.worldBackCenterM.z;
  return Math.round(Math.abs(afterValue - beforeValue) * 1000);
}

function planFootprintCenterDeltaMm(inst) {
  const points = inst.planPolygonM ?? [];
  const xs = points.map((point) => point.x).filter(Number.isFinite);
  const zs = points.map((point) => point.z).filter(Number.isFinite);
  const box = inst.structuralWorldBoxM ?? inst.worldBoxM;
  if (!xs.length || !zs.length || !box) return Number.POSITIVE_INFINITY;
  const planCenterX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const planCenterZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const boxCenterX = (box.min.x + box.max.x) / 2;
  const boxCenterZ = (box.min.z + box.max.z) / 2;
  return Math.round(Math.max(Math.abs(planCenterX - boxCenterX), Math.abs(planCenterZ - boxCenterZ)) * 1000);
}

function worldBoxCenterXzDeltaMm(before, after) {
  const beforeBox = before.structuralWorldBoxM ?? before.worldBoxM;
  const afterBox = after.structuralWorldBoxM ?? after.worldBoxM;
  if (!beforeBox || !afterBox) return Number.POSITIVE_INFINITY;
  const beforeCenterX = (beforeBox.min.x + beforeBox.max.x) / 2;
  const beforeCenterZ = (beforeBox.min.z + beforeBox.max.z) / 2;
  const afterCenterX = (afterBox.min.x + afterBox.max.x) / 2;
  const afterCenterZ = (afterBox.min.z + afterBox.max.z) / 2;
  return Math.round(Math.max(Math.abs(afterCenterX - beforeCenterX), Math.abs(afterCenterZ - beforeCenterZ)) * 1000);
}

function getLowestDoorHandleClearanceMm(inst) {
  const clearances = (inst.parts ?? []).filter(part => /^door_\d+_handle$/.test(part.name)).map(handle => {
    const front = inst.parts.find(part => part.name === handle.name.replace(/_handle$/, ""));
    if (!front?.dimensionsMm?.height || !handle.dimensionsMm?.height) return Number.NaN;
    return Math.round((handle.positionM.y - front.positionM.y) * 1000 + Number(front.dimensionsMm.height) / 2 - Number(handle.dimensionsMm.height) / 2);
  });
  return clearances.length && clearances.every(Number.isFinite) ? Math.min(...clearances) : null;
}

function getInternalShelfPartCount(inst) {
  return (inst.parts ?? []).filter((item) => /^shelf_\d+$/.test(item.name)).length;
}

function getInternalShelfCentersMm(inst) {
  return (inst.parts ?? [])
    .filter((item) => /^shelf_\d+$/.test(item.name) && item.positionM)
    .map((item) => Math.round(item.positionM.y * 1000))
    .sort((left, right) => left - right);
}

function shelfCentersAreEven(centersMm, toleranceMm = 2) {
  if (centersMm.length < 3) return true;
  const gaps = centersMm.slice(1).map((value, index) => value - centersMm[index]);
  return Math.max(...gaps) - Math.min(...gaps) <= toleranceMm;
}

async function evalApi(page, fn, arg) {
  return await page.evaluate(fn, arg);
}

async function createScenario(page, opts) {
  return await evalApi(
    page,
    (payload) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.createKitchenScenario(payload);
    },
    opts
  );
}

async function addKitchenModule(page, groupId, opts) {
  return await evalApi(
    page,
    ({ groupId, opts }) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.addKitchenModule(groupId, opts);
    },
    { groupId, opts }
  );
}

async function snapshot(page, groupId) {
  return await evalApi(
    page,
    (groupId) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.snapshot(groupId);
    },
    groupId
  );
}

async function layoutSnapshot(page) {
  return await evalApi(page, () => {
    const api = window.__kitchenDebug;
    if (!api) throw new Error("Missing __kitchenDebug");
    return api.layoutSnapshot();
  });
}

async function patchModule(page, instanceId, patch, options) {
  return await evalApi(
    page,
    ({ instanceId, patch, options }) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.patchModuleParams(instanceId, patch, options);
    },
    { instanceId, patch, options }
  );
}

async function detectAdjacency(page, instanceId) {
  return await evalApi(
    page,
    (instanceId) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.detectModuleAdjacency(instanceId);
    },
    instanceId
  );
}

function getPrimaryModule(snap, type) {
  const module = type ? snap.instances.find((item) => item.params.type === type) : snap.instances[0];
  if (!module) throw new Error(`Missing module ${type ?? ""}`);
  return module;
}

function nextNumber(value, delta, min = 1) {
  const current = Number(value ?? 0);
  return Math.max(min, Math.round(current + delta));
}

const dimensionCases = [
  { key: "width", next: inst => nextNumber(inst.params.width, 120), expectGeometry: true },
  { key: "depth", next: inst => nextNumber(inst.params.depth, 80), expectGeometry: true },
  { key: "height", next: inst => nextNumber(inst.params.height, 80), expectGeometry: true },
  { key: "boardThickness", next: inst => nextNumber(inst.params.boardThickness, 2), expectGeometry: true }
];
const drawerCases = [
  ...dimensionCases,
  { key: "heightCarcass", next: inst => nextNumber(inst.params.heightCarcass, 80), expectGeometry: true },
  { key: "frontThicknessMm", next: inst => nextNumber(inst.params.frontThicknessMm, 2), expectGeometry: true },
  { key: "drawerCount", next: inst => nextNumber(inst.params.drawerCount, 1), expectGeometry: true },
  { key: "opened", next: inst => !inst.params.opened, expectGeometry: true }
];
const cornerCases = [
  ...dimensionCases,
  { key: "heightCarcass", next: inst => nextNumber(inst.params.heightCarcass, 80), expectGeometry: true },
  { key: "plinthHeight", next: inst => nextNumber(inst.params.plinthHeight, 20), expectGeometry: true },
  { key: "plinthSetbackMm", next: inst => nextNumber(inst.params.plinthSetbackMm, 20), expectGeometry: true },
  { key: "opened", next: inst => !inst.params.opened, expectGeometry: true }
];
const swingCases = [
  ...dimensionCases,
  { key: "heightCarcass", next: inst => nextNumber(inst.params.heightCarcass, 80), expectGeometry: true },
  { key: "shelfCount", next: inst => nextNumber(inst.params.shelfCount, 1), expectGeometry: true },
  { key: "opened", next: inst => !inst.params.opened, expectGeometry: true }
];
const tallCases = [
  ...dimensionCases,
  { key: "tallSlot1HeightMm", next: inst => nextNumber(inst.params.tallSlot1HeightMm, 40), expectGeometry: true },
  { key: "tallSlot2HeightMm", next: inst => nextNumber(inst.params.tallSlot2HeightMm, 40), expectGeometry: true },
  { key: "opened", next: inst => !inst.params.opened, expectGeometry: true }
];

async function runMatrix(page, name, scenarioOpts, moduleType, cases) {
  const failures = [];
  for (const testCase of cases) {
    const created = await createScenario(page, {
      ...scenarioOpts,
      addModule: true,
      moduleType
    });
    const groupId = created.group?.id;
    expect(groupId, `${name}:${testCase.key} missing group`, created);
    if (moduleType === "fwm_catalog_tall_cabinet") {
      const initial = getPrimaryModule(await snapshot(page, groupId), moduleType);
      await patchModule(page, initial.id, { tallSlotCount: 2, tallSlot1Type: "drawer", tallSlot1HeightMm: 300, tallSlot2Type: "door", tallSlot2HeightMm: 600 }, { sourceKey: "tallSlotCount", preserveBackAnchor: true });
    }
    const beforeSnap = await snapshot(page, groupId);
    const beforeModule = getPrimaryModule(beforeSnap, moduleType);
    const beforeValue = clone(beforeModule.params[testCase.key]);
    const nextValue = testCase.next(beforeModule);
    const patch = { [testCase.key]: nextValue };
    // External-worktop families store the complete height and the cabinet
    // height separately. Keep both inputs consistent for this dimension edit.
    if (testCase.key === "height" && beforeModule.params.requiresWorktop !== false && Number(beforeModule.params.worktopThicknessMm) > 0) {
      patch.heightCarcass = Number(nextValue) - Number(beforeModule.params.worktopThicknessMm);
    }
    const result = await patchModule(page, beforeModule.id, patch, { sourceKey: testCase.key, preserveBackAnchor: true });
    const afterModule = result.instance;
    const changedValue = !deepEqual(afterModule.params[testCase.key], beforeValue);
    const geometryChanged = moduleSignature(beforeModule) !== moduleSignature(afterModule);
    const shouldChangeValue = testCase.expectValueChange !== false;
    if (!result.ok || (shouldChangeValue && !changedValue) || (testCase.expectGeometry && !geometryChanged)) {
      failures.push({
        case: `${name}.${testCase.key}`,
        ok: result.ok,
        beforeValue,
        requestedValue: nextValue,
        afterValue: afterModule.params[testCase.key],
        geometryChanged
      });
    }
  }
  return failures;
}

async function runAdjacencyCases(page) {
  const failures = [];

  const lPath = [
    { x: 0, z: 0 },
    { x: 2400, z: 0 },
    { x: 2400, z: 2000 }
  ];

  {
    const created = await createScenario(page, { path: lPath, addModule: true, moduleType: "fwm_catalog_base_corner" });
    const groupId = created.group.id;
    await addKitchenModule(page, groupId, { type: "fwm_catalog_base_drawers", segmentIndex: 0, offsetAlongMm: 980 });
    const snapBefore = await snapshot(page, groupId);
    const corner = snapBefore.instances.find((item) => item.params.type === "fwm_catalog_base_corner");
    const drawer = snapBefore.instances.find((item) => item.params.type === "fwm_catalog_base_drawers");
    expect(corner && drawer, "corner adjacency scenario missing modules", snapBefore);
    const beforeAdj = await detectAdjacency(page, drawer.id);
    if (beforeAdj.length > 0) {
      const result = await patchModule(page, drawer.id, { width: Number(drawer.params.width ?? 600) + 120 }, { sourceKey: "width", preserveBackAnchor: true });
      const afterAdj = await detectAdjacency(page, drawer.id);
      const afterDrawer = result.instance;
      const snapAfter = await snapshot(page, groupId);
      const afterCorner = snapAfter.instances.find((item) => item.id === corner.id);
      const drawerMoved = Math.abs(afterDrawer.positionM.x - drawer.positionM.x) > 0.0005 || Math.abs(afterDrawer.positionM.z - drawer.positionM.z) > 0.0005;
      const cornerMoved =
        Math.abs(afterCorner.positionM.x - corner.positionM.x) > 0.0005 || Math.abs(afterCorner.positionM.z - corner.positionM.z) > 0.0005;
      const seamStable =
        afterAdj.length > 0 &&
        Math.abs((afterAdj[0]?.seamMm ?? 0) - (beforeAdj[0]?.seamMm ?? 0)) <= 1;
      if (!result.ok || Number(afterDrawer.params.width) <= Number(drawer.params.width) || !drawerMoved || cornerMoved || !seamStable) {
        failures.push({
          case: "drawer_width_growth_next_to_corner_grows_away",
          ok: result.ok,
          beforeWidth: drawer.params.width,
          afterWidth: afterDrawer.params.width,
          beforeAdj,
          afterAdj,
          drawerMoved,
          cornerMoved,
          seamStable,
          beforeCornerPos: corner.positionM,
          afterCornerPos: afterCorner?.positionM
        });
      }
    }
  }

  {
    const created = await createScenario(page, { path: lPath, addModule: true, moduleType: "fwm_catalog_base_corner" });
    const groupId = created.group.id;
    await addKitchenModule(page, groupId, { type: "fwm_catalog_base_drawers", segmentIndex: 0, offsetAlongMm: 1080 });
    const before = await snapshot(page, groupId);
    const corner = before.instances.find((item) => item.params.type === "fwm_catalog_base_corner");
    const drawer = before.instances.find((item) => item.params.type === "fwm_catalog_base_drawers");
    expect(corner && drawer, "corner width adjacency scenario missing modules", before);
    const beforeAdj = await detectAdjacency(page, drawer.id);
    const result = await patchModule(
      page,
      corner.id,
      { width: Number(corner.params.width ?? 1000) + 120 },
      { sourceKey: "width", preserveBackAnchor: true }
    );
    const after = await snapshot(page, groupId);
    const afterAdj = await detectAdjacency(page, drawer.id);
    const afterCorner = after.instances.find((item) => item.id === corner.id);
    const afterDrawer = after.instances.find((item) => item.id === drawer.id);
    const drawerMoved =
      Math.abs(afterDrawer.positionM.x - drawer.positionM.x) > 0.0005 || Math.abs(afterDrawer.positionM.z - drawer.positionM.z) > 0.0005;
    const drawerAttachmentRespected =
      beforeAdj.length > 0
        ? afterAdj.length > 0 &&
          Math.abs((afterAdj[0]?.gapMm ?? 0) - (beforeAdj[0]?.gapMm ?? 0)) <= 1 &&
          Math.abs((afterAdj[0]?.seamMm ?? 0) - (beforeAdj[0]?.seamMm ?? 0)) <= 1
        : !drawerMoved;
    if (!result.ok || Number(afterCorner.params.width) <= Number(corner.params.width) || !drawerAttachmentRespected) {
      failures.push({
        case: "corner_width_growth_respects_drawer_attachment",
        ok: result.ok,
        beforeWidth: corner.params.width,
        afterWidth: afterCorner.params.width,
        drawerMoved,
        drawerAttachmentRespected,
        beforeCornerPos: corner.positionM,
        afterCornerPos: afterCorner.positionM,
        beforeDrawerPos: drawer.positionM,
        afterDrawerPos: afterDrawer.positionM,
        beforeAdj,
        afterAdj,
        debug: result.debug
      });
    }
  }

  {
    const created = await createScenario(page, {
      path: [{ x: 0, z: 0 }, { x: 3200, z: 0 }],
      addModule: true,
      moduleType: "fwm_catalog_base_drawers",
      offsetAlongMm: 700
    });
    const groupId = created.group.id;
    const firstDrawer = getPrimaryModule(await snapshot(page, groupId), "fwm_catalog_base_drawers");
    const adjacentOffset = firstDrawer.kitchenPlacement.offsetAlongM * 1000 + Number(firstDrawer.params.width) + 2;
    await addKitchenModule(page, groupId, { type: "fwm_catalog_base_drawers", segmentIndex: 0, offsetAlongMm: adjacentOffset });
    const before = await snapshot(page, groupId);
    const drawers = before.instances.filter((item) => item.params.type === "fwm_catalog_base_drawers");
    expect(drawers.length >= 2, "drawer adjacency scenario missing modules", before);
    const left = drawers.slice().sort((a, b) => a.positionM.x - b.positionM.x)[0];
    const right = drawers.slice().sort((a, b) => a.positionM.x - b.positionM.x)[1];
    const beforeAdj = await detectAdjacency(page, left.id);
    const result = await patchModule(page, left.id, { width: Number(left.params.width ?? 600) + 120 }, { sourceKey: "width", preserveBackAnchor: true });
    const after = await snapshot(page, groupId);
    const afterLeft = after.instances.find((item) => item.id === left.id);
    const afterRight = after.instances.find((item) => item.id === right.id);
    const leftMoved = Math.abs(afterLeft.positionM.x - left.positionM.x) > 0.0005 || Math.abs(afterLeft.positionM.z - left.positionM.z) > 0.0005;
    const rightMoved = Math.abs(afterRight.positionM.x - right.positionM.x) > 0.0005 || Math.abs(afterRight.positionM.z - right.positionM.z) > 0.0005;
    const afterAdj = await detectAdjacency(page, left.id);
    const seamStable =
      afterAdj.length > 0 &&
      beforeAdj.length > 0 &&
      Math.abs((afterAdj[0]?.seamMm ?? 0) - (beforeAdj[0]?.seamMm ?? 0)) <= 1;
    if (!result.ok || rightMoved || !leftMoved || Number(afterLeft.params.width) <= Number(left.params.width) || beforeAdj.length === 0 || !seamStable) {
      failures.push({
        case: "drawer_width_growth_keeps_adjacent_drawer_fixed",
        ok: result.ok,
        beforeAdj,
        afterAdj,
        beforeWidth: left.params.width,
        afterWidth: afterLeft.params.width,
        leftMoved,
        rightMoved,
        seamStable,
        beforeRightPos: right.positionM,
        afterRightPos: afterRight.positionM
      });
    }
  }

  return failures;
}

async function runClusterCases(page) {
  const failures = [];
  const created = await createScenario(page, {
    path: [{ x: 0, z: 0 }, { x: 4200, z: 0 }],
    addModule: true,
    moduleType: "fwm_catalog_base_drawers",
    offsetAlongMm: 700
  });
  const groupId = created.group.id;
  await addKitchenModule(page, groupId, { type: "fwm_catalog_base_doors", segmentIndex: 0, offsetAlongMm: 1550 });
  await addKitchenModule(page, groupId, { type: "fwm_catalog_base_drawers", segmentIndex: 0, offsetAlongMm: 2550 });

  const before = await snapshot(page, groupId);
  const ordered = before.instances.slice().sort((a, b) => a.positionM.x - b.positionM.x);
  const leftDrawer = ordered.find((item) => item.params.type === "fwm_catalog_base_drawers");
  const swing = ordered.find((item) => item.params.type === "fwm_catalog_base_doors");
  const rightDrawer = ordered.slice().reverse().find((item) => item.params.type === "fwm_catalog_base_drawers");
  expect(leftDrawer && swing && rightDrawer, "cluster scenario missing modules", before);

  {
    const result = await patchModule(
      page,
      swing.id,
      { heightCarcass: Number(swing.params.heightCarcass ?? 662) + 80 },
      { sourceKey: "heightCarcass", preserveBackAnchor: true }
    );
    const after = await snapshot(page, groupId);
    const nextSwing = after.instances.find((item) => item.id === swing.id);
    const nextLeft = after.instances.find((item) => item.id === leftDrawer.id);
    const nextRight = after.instances.find((item) => item.id === rightDrawer.id);
    const swingMoved =
      Math.abs(nextSwing.positionM.x - swing.positionM.x) > 0.0005 || Math.abs(nextSwing.positionM.z - swing.positionM.z) > 0.0005;
    const neighborMoved =
      Math.abs(nextLeft.positionM.x - leftDrawer.positionM.x) > 0.0005 ||
      Math.abs(nextLeft.positionM.z - leftDrawer.positionM.z) > 0.0005 ||
      Math.abs(nextRight.positionM.x - rightDrawer.positionM.x) > 0.0005 ||
      Math.abs(nextRight.positionM.z - rightDrawer.positionM.z) > 0.0005;
    if (!result.ok || Number(nextSwing.params.heightCarcass) <= Number(swing.params.heightCarcass) || swingMoved || neighborMoved) {
      failures.push({
        case: "cluster_swing_heightCarcass_commits_without_shift",
        ok: result.ok,
        beforeHeightCarcass: swing.params.heightCarcass,
        afterHeightCarcass: nextSwing.params.heightCarcass,
        swingMoved,
        neighborMoved,
        beforeSwingPos: swing.positionM,
        afterSwingPos: nextSwing.positionM
      });
    }
  }

  {
    const snapMid = await snapshot(page, groupId);
    const currentLeft = snapMid.instances.find((item) => item.id === leftDrawer.id);
    const currentSwing = snapMid.instances.find((item) => item.id === swing.id);
    const currentRight = snapMid.instances.find((item) => item.id === rightDrawer.id);
    const result = await patchModule(
      page,
      currentLeft.id,
      { frontThicknessMm: Number(currentLeft.params.frontThicknessMm ?? 18) + 2 },
      { sourceKey: "frontThicknessMm", preserveBackAnchor: true }
    );
    const after = await snapshot(page, groupId);
    const nextLeft = after.instances.find((item) => item.id === leftDrawer.id);
    const nextSwing = after.instances.find((item) => item.id === swing.id);
    const nextRight = after.instances.find((item) => item.id === rightDrawer.id);
    const leftMoved =
      Math.abs(nextLeft.positionM.x - currentLeft.positionM.x) > 0.0005 || Math.abs(nextLeft.positionM.z - currentLeft.positionM.z) > 0.0005;
    const othersMoved =
      Math.abs(nextSwing.positionM.x - currentSwing.positionM.x) > 0.0005 ||
      Math.abs(nextSwing.positionM.z - currentSwing.positionM.z) > 0.0005 ||
      Math.abs(nextRight.positionM.x - currentRight.positionM.x) > 0.0005 ||
      Math.abs(nextRight.positionM.z - currentRight.positionM.z) > 0.0005;
    if (!result.ok || Number(nextLeft.params.frontThicknessMm) <= Number(currentLeft.params.frontThicknessMm) || leftMoved || othersMoved) {
      failures.push({
        case: "cluster_drawer_frontThickness_commits_without_shift",
        ok: result.ok,
        beforeFrontThickness: currentLeft.params.frontThicknessMm,
        afterFrontThickness: nextLeft.params.frontThicknessMm,
        leftMoved,
        othersMoved,
        beforeLeftPos: currentLeft.positionM,
        afterLeftPos: nextLeft.positionM
      });
    }
  }

  {
    const snapMid = await snapshot(page, groupId);
    const currentLeft = snapMid.instances.find((item) => item.id === leftDrawer.id);
    const currentSwing = snapMid.instances.find((item) => item.id === swing.id);
    const currentRight = snapMid.instances.find((item) => item.id === rightDrawer.id);
    const result = await patchModule(
      page,
      currentRight.id,
      { width: Number(currentRight.params.width ?? 800) + 80 },
      { sourceKey: "width", preserveBackAnchor: true }
    );
    const after = await snapshot(page, groupId);
    const nextLeft = after.instances.find((item) => item.id === leftDrawer.id);
    const nextSwing = after.instances.find((item) => item.id === swing.id);
    const nextRight = after.instances.find((item) => item.id === rightDrawer.id);
    const othersMoved =
      Math.abs(nextLeft.positionM.x - currentLeft.positionM.x) > 0.0005 ||
      Math.abs(nextLeft.positionM.z - currentLeft.positionM.z) > 0.0005 ||
      Math.abs(nextSwing.positionM.x - currentSwing.positionM.x) > 0.0005 ||
      Math.abs(nextSwing.positionM.z - currentSwing.positionM.z) > 0.0005;
    if (!result.ok || Number(nextRight.params.width) <= Number(currentRight.params.width) || othersMoved) {
      failures.push({
        case: "cluster_edge_drawer_width_grows_without_shifting_neighbors",
        ok: result.ok,
        beforeWidth: currentRight.params.width,
        afterWidth: nextRight.params.width,
        othersMoved,
        beforeRightPos: currentRight.positionM,
        afterRightPos: nextRight.positionM
      });
    }
  }

  return failures;
}

async function runBackAnchorLockCases(page) {
  const failures = [];

  {
    const created = await createScenario(page, {
      path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }],
      addModule: true,
      moduleType: "fwm_catalog_base_drawers",
      offsetAlongMm: 700
    });
    const groupId = created.group.id;
    const before = getPrimaryModule(await snapshot(page, groupId), "fwm_catalog_base_drawers");
    const result = await patchModule(
      page,
      before.id,
      { width: Number(before.params.width ?? 800) + 120 },
      { sourceKey: "width", preserveBackAnchor: true }
    );
    const after = result.instance;
    const backDeltaMm = backLockedDeltaMm(before, after);
    if (!result.ok || backDeltaMm > 1) {
      failures.push({
        case: "drawer_width_keeps_back_anchor_straight",
        ok: result.ok,
        backDeltaMm,
        beforeBackCenter: before.worldBackCenterM,
        afterBackCenter: after.worldBackCenterM
      });
    }
  }

  {
    const created = await createScenario(page, {
      path: [
        { x: 0, z: 0 },
        { x: 2400, z: 0 },
        { x: 2400, z: 1800 }
      ],
      addModule: true,
      moduleType: "fwm_catalog_base_drawers",
      segmentIndex: 1,
      offsetAlongMm: 700
    });
    const groupId = created.group.id;
    const before = getPrimaryModule(await snapshot(page, groupId), "fwm_catalog_base_drawers");
    const result = await patchModule(
      page,
      before.id,
      { width: Number(before.params.width ?? 800) + 120 },
      { sourceKey: "width", preserveBackAnchor: true }
    );
    const after = result.instance;
    const backDeltaMm = backLockedDeltaMm(before, after);
    if (!result.ok || backDeltaMm > 1) {
      failures.push({
        case: "drawer_width_keeps_back_anchor_rotated",
        ok: result.ok,
        backDeltaMm,
        beforeBackCenter: before.worldBackCenterM,
        afterBackCenter: after.worldBackCenterM
      });
    }
  }

  {
    const created = await createScenario(page, {
      path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }],
      addModule: true,
      moduleType: "fwm_catalog_base_doors",
      offsetAlongMm: 700
    });
    const groupId = created.group.id;
    const before = getPrimaryModule(await snapshot(page, groupId), "fwm_catalog_base_doors");
    const result = await patchModule(
      page,
      before.id,
      { width: Number(before.params.width ?? 800) + 120 },
      { sourceKey: "width", preserveBackAnchor: true }
    );
    const after = result.instance;
    const backDeltaMm = backLockedDeltaMm(before, after);
    if (!result.ok || backDeltaMm > 1) {
      failures.push({
        case: "swing_width_keeps_back_anchor",
        ok: result.ok,
        backDeltaMm,
        beforeBackCenter: before.worldBackCenterM,
        afterBackCenter: after.worldBackCenterM
      });
    }
  }

  {
    const created = await createScenario(page, {
      path: [
        { x: 0, z: 0 },
        { x: 2400, z: 0 },
        { x: 2400, z: 1600 }
      ],
      addModule: true,
      moduleType: "fwm_catalog_base_corner",
      cornerIndex: 1
    });
    const groupId = created.group.id;
    let before = getPrimaryModule(await snapshot(page, groupId), "fwm_catalog_base_corner");

    for (const key of ["width", "depth"]) {
      const beforeAnchor = before.worldKitchenAnchorM;
      const result = await patchModule(
        page,
        before.id,
        { [key]: Number(before.params[key] ?? 1000) + 120 },
        { sourceKey: key, preserveBackAnchor: true }
      );
      const after = result.instance;
      const anchorDeltaMm = Math.round(
        Math.hypot((after.worldKitchenAnchorM.x - beforeAnchor.x) * 1000, (after.worldKitchenAnchorM.z - beforeAnchor.z) * 1000)
      );
      if (!result.ok || anchorDeltaMm > 1) {
        failures.push({
          case: `corner_${key}_keeps_corner_anchor`,
          ok: result.ok,
          anchorDeltaMm,
          beforeAnchor,
          afterAnchor: after.worldKitchenAnchorM
        });
      }
      before = after;
    }
  }

  return failures;
}

async function runKitchenMaterialResyncCases(page) {
  const failures = [];

  const created = await createScenario(page, {
    path: [
      { x: 0, z: 0 },
      { x: 3200, z: 0 },
      { x: 3200, z: 2200 },
      { x: 0, z: 2200 }
    ],
    addModule: false
  });
  const groupId = created.group.id;

  await addKitchenModule(page, groupId, { type: "fwm_catalog_tall_cabinet", segmentIndex: 0, offsetAlongMm: 350 });
  await addKitchenModule(page, groupId, { type: "fwm_catalog_base_corner", cornerIndex: 1 });
  await addKitchenModule(page, groupId, { type: "fwm_catalog_base_corner", cornerIndex: 2 });
  await addKitchenModule(page, groupId, { type: "fwm_catalog_base_doors", segmentIndex: 0, offsetAlongMm: 1450 });
  await addKitchenModule(page, groupId, { type: "fwm_catalog_base_drawers", segmentIndex: 2, offsetAlongMm: 1100 });
  await evalApi(
    page,
    ({ groupId }) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.patchKitchenContext(groupId, { frontsMaterialId: "mat.demos.229570" });
    },
    { groupId }
  );

  const afterMaterial = await snapshot(page, groupId);
  for (const inst of afterMaterial.instances) {
    let patch = null;
    let sourceKey = null;
    if (inst.params.type === "fwm_catalog_tall_cabinet") {
      patch = { width: Number(inst.params.width ?? 600) + 1 };
      sourceKey = "width";
    } else if (inst.params.type === "fwm_catalog_base_corner") {
      patch = { width: Number(inst.params.width ?? 1000) + 1 };
      sourceKey = "width";
    } else if (inst.params.type === "fwm_catalog_base_doors") {
      patch = { width: Number(inst.params.width ?? 800) + 1 };
      sourceKey = "width";
    } else if (inst.params.type === "fwm_catalog_base_drawers") {
      patch = { width: Number(inst.params.width ?? 800) + 1 };
      sourceKey = "width";
    }

    if (!patch || !sourceKey) continue;
    const result = await patchModule(page, inst.id, patch, { sourceKey, preserveBackAnchor: true });
    if (!result.ok) {
      failures.push({
        case: `material_resync_${inst.params.type}_${sourceKey}`,
        ok: result.ok,
        debug: result.debug ?? null
      });
    }
  }

  return failures;
}

async function runUpperFlapContextCases(page) {
  const failures = [];
  const created = await createScenario(page, {
    path: [
      { x: 0, z: 0 },
      { x: 2600, z: 0 }
    ],
    addModule: false
  });
  const groupId = created.group.id;
  await page.evaluate(() => window.__kitchenDebug.createWall({ aMm: { x: -2000, z: -50 }, bMm: { x: 6000, z: -50 }, thicknessMm: 100 }));
  await addKitchenModule(page, groupId, { type: "fwm_catalog_wall_cabinet", segmentIndex: 0, offsetAlongMm: 1300 });
  await evalApi(
    page,
    ({ groupId }) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.patchKitchenContext(groupId, {
        frontsMaterialId: "mat.demos.229570",
        upperStartHeightMm: 1600,
        upperHeightMm: 640
      });
    },
    { groupId }
  );

  const snap = await snapshot(page, groupId);
  const flap = snap.instances.find((inst) => inst.params.type === "fwm_catalog_wall_cabinet");
  if (!flap) {
    failures.push({ case: "upper_cabinet_inserted", ok: false, reason: "Missing fwm_catalog_wall_cabinet after addKitchenModule" });
    return failures;
  }
  if (!flap.kitchenPlacement) {
    failures.push({ case: "upper_cabinet_kitchen_placement", ok: false, reason: "Missing kitchenPlacement", flap });
  }
  if (Math.round(flap.positionM.y * 1000) !== 1600) {
    failures.push({ case: "upper_cabinet_position_y", ok: false, expected: 1600, actual: Math.round(flap.positionM.y * 1000), flap });
  }
  if (flap.params.height !== 640) {
    failures.push({ case: "upper_cabinet_height", ok: false, expected: 640, actual: flap.params.height, flap });
  }
  if (flap.params.frontMaterialId !== "mat.demos.229570" && flap.params.materials?.frontKey !== "mat.demos.229570") {
    failures.push({ case: "upper_cabinet_front_material", ok: false, expected: "mat.demos.229570", flap });
  }
  if (!Number.isFinite(flap.worldBoxM?.min?.x) || !Number.isFinite(flap.worldBoxM?.max?.y) || (flap.parts?.length ?? 0) === 0) {
    failures.push({ case: "upper_cabinet_3d_geometry", ok: false, reason: "Invalid or empty 3D geometry", flap });
  }
  const shelfPartCount = getInternalShelfPartCount(flap);
  if (shelfPartCount !== Number(flap.params.shelfCount ?? 0)) {
    failures.push({
      case: "upper_cabinet_shelf_count_geometry",
      ok: false,
      expected: Number(flap.params.shelfCount ?? 0),
      actual: shelfPartCount,
      flap
    });
  }
  const shelfCentersMm = getInternalShelfCentersMm(flap);
  if (!shelfCentersAreEven(shelfCentersMm)) {
    failures.push({
      case: "upper_cabinet_initial_shelves_auto_fit",
      ok: false,
      expected: { shelfAutoFit: true, evenCenters: true },
      actual: { shelfAutoFit: flap.params.shelfAutoFit, shelfCentersMm },
      flap
    });
  }
  const handleClearance = getLowestDoorHandleClearanceMm(flap);
  if (handleClearance == null || handleClearance < 20) failures.push({ case: "upper_door_handle_inside_front", handleClearance });
  const doubleDoorResult = await patchModule(page, flap.id, { doorCount: 2 }, { sourceKey: "doorCount", preserveBackAnchor: true });
  const doubleDoorClearanceMm = getLowestDoorHandleClearanceMm(doubleDoorResult.instance);
  const fronts = doubleDoorResult.instance.parts.filter(part => /^door_\d+$/.test(part.name));
  if (!doubleDoorResult.ok || fronts.length !== 2 || doubleDoorClearanceMm == null || doubleDoorClearanceMm < 20) {
    failures.push({ case: "upper_double_door_handles_inside_front", ok: doubleDoorResult.ok, fronts: fronts.length, doubleDoorClearanceMm });
  }

  const result = await patchModule(page, doubleDoorResult.instance.id, { width: Number(doubleDoorResult.instance.params.width ?? 900) + 1 }, { sourceKey: "width", preserveBackAnchor: true });
  if (!result.ok) {
    failures.push({
      case: "material_resync_fwm_catalog_wall_cabinet_width",
      ok: result.ok,
      debug: result.debug ?? null
    });
  }
  return failures;
}

async function runUpperFlapUiPlacementCases(page) {
  const failures = [];
  const created = await createScenario(page, {
    path: [
      { x: 0, z: 0 },
      { x: 2600, z: 0 }
    ],
    addModule: false
  });
  const groupId = created.group.id;

  await page.getByRole("button", { name: "Upraviť kuchyňu" }).click();
  await page.getByRole("button", { name: "Zobrazenie", exact: true }).click();
  await page.getByRole("button", { name: /^(2D pohľad|2D View)$/ }).click();
  await page.getByRole("button", { name: "Kuchyňa", exact: true }).click();
  await page.getByRole("button", { name: /^(Upravovať vrchné moduly|Edit upper modules)$/ }).click();
  await page.locator('#moduleCatalog button[data-module-type="fwm_catalog_wall_cabinet"]').first().click();
  const target = await evalApi(page, () => {
    const api = window.__kitchenDebug;
    if (!api) throw new Error("Missing __kitchenDebug");
    return api.projectPlanPoint({ x: 1300, z: 250 });
  });
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(120);
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(300);

  const placedSnap = await snapshot(page, groupId);
  const placedFlap = placedSnap.instances.find((inst) => inst.params.type === "fwm_catalog_wall_cabinet");
  if (!placedFlap) {
    failures.push({ case: "upper_cabinet_ui_inserted", ok: false, reason: "Missing fwm_catalog_wall_cabinet after UI placement" });
    return failures;
  }
  if (!placedFlap.kitchenPlacement) {
    failures.push({ case: "upper_cabinet_ui_keeps_binding", ok: false, reason: "UI placement lost kitchenPlacement", placedFlap });
  }
  if (Math.round(placedFlap.positionM.y * 1000) !== 1400) {
    failures.push({ case: "upper_cabinet_ui_initial_position_y", ok: false, expected: 1400, actual: Math.round(placedFlap.positionM.y * 1000), placedFlap });
  }
  if (Math.round(placedFlap.worldBoxM.min.y * 1000) !== 1400) {
    failures.push({ case: "upper_cabinet_ui_initial_world_bottom_y", ok: false, expected: 1400, actual: Math.round(placedFlap.worldBoxM.min.y * 1000), placedFlap });
  }
  if (placedFlap.moduleVisible !== false || placedFlap.outlineVisible !== true || placedFlap.pickVisible !== true) {
    failures.push({
      case: "upper_cabinet_ui_floorplan_visibility",
      ok: false,
      expected: { moduleVisible: false, outlineVisible: true, pickVisible: true },
      actual: {
        moduleVisible: placedFlap.moduleVisible,
        outlineVisible: placedFlap.outlineVisible,
        pickVisible: placedFlap.pickVisible
      }
    });
  }
  if (
    !Array.isArray(placedFlap.planPolygonM) ||
    placedFlap.planPolygonM.length < 4 ||
    placedFlap.planPolygonM.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))
  ) {
    failures.push({ case: "upper_cabinet_ui_plan_footprint", ok: false, reason: "Invalid plan footprint", placedFlap });
  }
  const footprintDeltaMm = planFootprintCenterDeltaMm(placedFlap);
  if (footprintDeltaMm > 30) {
    failures.push({ case: "upper_cabinet_ui_plan_footprint_matches_3d", ok: false, expectedMaxDeltaMm: 30, actualDeltaMm: footprintDeltaMm, placedFlap });
  }

  await evalApi(
    page,
    ({ groupId }) => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.patchKitchenContext(groupId, { upperStartHeightMm: 1700, upperHeightMm: 650 });
    },
    { groupId }
  );
  const movedSnap = await snapshot(page, groupId);
  const movedFlap = movedSnap.instances.find((inst) => inst.id === placedFlap.id);
  if (!movedFlap || Math.round(movedFlap.positionM.y * 1000) !== 1700) {
    failures.push({
      case: "upper_cabinet_ui_group_position_updates",
      ok: false,
      expected: 1700,
      actual: movedFlap ? Math.round(movedFlap.positionM.y * 1000) : null,
      movedFlap
    });
  }
  if (!movedFlap || Math.round(movedFlap.worldBoxM.min.y * 1000) !== 1700) {
    failures.push({
      case: "upper_cabinet_ui_group_world_bottom_updates",
      ok: false,
      expected: 1700,
      actual: movedFlap ? Math.round(movedFlap.worldBoxM.min.y * 1000) : null,
      movedFlap
    });
  }
  if (movedFlap) {
    const boxCenterDeltaMm = worldBoxCenterXzDeltaMm(placedFlap, movedFlap);
    if (boxCenterDeltaMm > 1) {
      failures.push({
        case: "upper_cabinet_ui_group_position_keeps_xz",
        ok: false,
        expectedMaxDeltaMm: 1,
        actualDeltaMm: boxCenterDeltaMm,
        before: placedFlap,
        after: movedFlap
      });
    }
    const movedFootprintDeltaMm = planFootprintCenterDeltaMm(movedFlap);
    if (movedFootprintDeltaMm > 30) {
      failures.push({
        case: "upper_cabinet_ui_group_footprint_keeps_3d_alignment",
        ok: false,
        expectedMaxDeltaMm: 30,
        actualDeltaMm: movedFootprintDeltaMm,
        movedFlap
      });
    }
  }
  if (!movedFlap || movedFlap.params.height !== 650) {
    failures.push({ case: "upper_cabinet_ui_group_height_updates", ok: false, expected: 650, actual: movedFlap?.params.height ?? null, movedFlap });
  }
  if (movedFlap) {
    await evalApi(
      page,
      ({ groupId }) => {
        const api = window.__kitchenDebug;
        if (!api) throw new Error("Missing __kitchenDebug");
        return api.patchKitchenContext(groupId, { upperDepthMm: 410 });
      },
      { groupId }
    );
    const depthSnap = await snapshot(page, groupId);
    const depthFlap = depthSnap.instances.find((inst) => inst.id === placedFlap.id);
    if (!depthFlap || depthFlap.params.depth !== 410) {
      failures.push({ case: "upper_cabinet_ui_group_depth_updates", ok: false, expected: 410, actual: depthFlap?.params.depth ?? null, depthFlap });
    }
    if (depthFlap && backLockedDeltaMm(movedFlap, depthFlap) > 1) {
      failures.push({
        case: "upper_cabinet_ui_group_depth_keeps_back_anchor",
        ok: false,
        expectedMaxDeltaMm: 1,
        actualDeltaMm: backLockedDeltaMm(movedFlap, depthFlap),
        before: movedFlap,
        after: depthFlap
      });
    }
  }
  const savedSnap = await layoutSnapshot(page);
  const savedFlap = savedSnap.instances.find((inst) => inst.id === placedFlap.id);
  if (!savedFlap || savedFlap.positionMm.y !== 1700) {
    failures.push({
      case: "upper_cabinet_ui_snapshot_saves_y",
      ok: false,
      expected: 1700,
      actual: savedFlap?.positionMm?.y ?? null,
      savedFlap
    });
  }

  return failures;
}

async function runUpperFlapModuleParameterCases(page) {
  const failures = [];
  const cases = [
    { key: "width", patch: inst => ({ width: Number(inst.params.width) + 120 }) },
    { key: "height", patch: inst => ({ height: Number(inst.params.height) - 80 }) },
    { key: "depth", patch: inst => ({ depth: Number(inst.params.depth) + 80 }) },
    { key: "frontGap", patch: inst => ({ frontGap: Number(inst.params.frontGap) + 4 }) },
    { key: "sideGap", patch: inst => ({ sideGap: Number(inst.params.sideGap) + 4 }) },
    { key: "shelfCount", patch: inst => ({ shelfCount: Number(inst.params.shelfCount) + 1 }) },
    { key: "shelfGaps", patch: () => ({ shelfGaps: "100,160,200" }) },
    { key: "doorCount", patch: () => ({ doorCount: 2 }) },
    { key: "opened", patch: () => ({ opened: true }) },
    { key: "hasDoors", patch: () => ({ hasDoors: false }) },
    { key: "handleComponentId", patch: () => ({ handleComponentId: "cmp.handle.knob.round.black" }) },
    { key: "hangingBracketComponentId", patch: () => ({ hangingBracketComponentId: "cmp.hanging_bracket.wall.heavy" }) },
    { key: "shelfSupportComponentId", patch: () => ({ shelfSupportComponentId: "cmp.shelf_support.glass.nickel" }) }
  ];

  for (const testCase of cases) {
    const created = await createScenario(page, {
      path: [
        { x: 0, z: 0 },
        { x: 2600, z: 0 }
      ],
      addModule: false
    });
    const groupId = created.group.id;
    await page.evaluate(() => window.__kitchenDebug.createWall({ aMm: { x: -2000, z: -50 }, bMm: { x: 6000, z: -50 }, thicknessMm: 100 }));
    await addKitchenModule(page, groupId, { type: "fwm_catalog_wall_cabinet", segmentIndex: 0, offsetAlongMm: 1300 });
    const beforeSnap = await snapshot(page, groupId);
    const beforeFlap = beforeSnap.instances.find((inst) => inst.params.type === "fwm_catalog_wall_cabinet");
    if (!beforeFlap) {
      failures.push({ case: `upper_cabinet_param_${testCase.key}`, ok: false, reason: "Missing flap before patch" });
      continue;
    }
    const patch = testCase.patch(beforeFlap);
    const result = await patchModule(page, beforeFlap.id, patch, { sourceKey: testCase.key, preserveBackAnchor: true });
    const afterFlap = result.instance;
    const changed = Object.entries(patch).every(([key, value]) => deepEqual(afterFlap.params[key], value) || testCase.expect?.(afterFlap));
    const anchorDeltaMm = backLockedDeltaMm(beforeFlap, afterFlap);
    const shelfPartCount = getInternalShelfPartCount(afterFlap);
    const shelfCountMismatch = testCase.key === "shelfCount" && shelfPartCount !== Number(afterFlap.params.shelfCount ?? 0);
    if (!result.ok || !changed || anchorDeltaMm > 1 || !afterFlap.kitchenPlacement || shelfCountMismatch) {
      failures.push({
        case: `upper_cabinet_param_${testCase.key}`,
        ok: result.ok,
        patch,
        afterValue: Object.fromEntries(Object.keys(patch).map((key) => [key, afterFlap.params[key]])),
        changed,
        anchorDeltaMm,
        shelfPartCount,
        kitchenPlacement: afterFlap.kitchenPlacement
      });
    }
  }

  return failures;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  await installAuthSession(page);

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 30000 });

    const drawerFailures = await runMatrix(
      page,
      "drawer",
      {
        path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }]
      },
      "fwm_catalog_base_drawers",
      drawerCases
    );

    const cornerFailures = await runMatrix(
      page,
      "corner",
      {
        path: [
          { x: 0, z: 0 },
          { x: 2400, z: 0 },
          { x: 2400, z: 1400 }
        ]
      },
      "fwm_catalog_base_corner",
      cornerCases
    );

    const adjacencyFailures = await runAdjacencyCases(page);
    const swingFailures = await runMatrix(
      page,
      "swing",
      {
        path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }]
      },
      "fwm_catalog_base_doors",
      swingCases
    );

    const tallFailures = await runMatrix(
      page,
      "tall",
      {
        path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }]
      },
      "fwm_catalog_tall_cabinet",
      tallCases
    );

    const clusterFailures = await runClusterCases(page);
    const backAnchorFailures = await runBackAnchorLockCases(page);
    const materialResyncFailures = await runKitchenMaterialResyncCases(page);
    const upperFlapFailures = await runUpperFlapContextCases(page);
    const upperFlapUiFailures = await runUpperFlapUiPlacementCases(page);
    const upperFlapModuleParamFailures = await runUpperFlapModuleParameterCases(page);

    const failures = [
      ...drawerFailures,
      ...cornerFailures,
      ...swingFailures,
      ...tallFailures,
      ...adjacencyFailures,
      ...clusterFailures,
      ...backAnchorFailures,
      ...materialResyncFailures,
      ...upperFlapFailures,
      ...upperFlapUiFailures,
      ...upperFlapModuleParamFailures
    ];
    if (failures.length > 0) {
      throw new Error(JSON.stringify({ ok: false, baseUrl, failures }, null, 2));
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          coverage: {
            drawerCases: drawerCases.map((item) => item.key),
            cornerCases: cornerCases.map((item) => item.key),
            swingCases: swingCases.map((item) => item.key),
            tallCases: tallCases.map((item) => item.key),
            adjacencyCases: [
              "drawer_width_growth_next_to_corner_grows_away",
              "corner_width_growth_respects_drawer_attachment",
              "drawer_width_growth_keeps_adjacent_drawer_fixed"
            ],
            clusterCases: [
              "cluster_swing_heightCarcass_commits_without_shift",
              "cluster_drawer_frontThickness_commits_without_shift",
              "cluster_edge_drawer_width_grows_without_shifting_neighbors"
            ],
            backAnchorCases: [
              "drawer_width_keeps_back_anchor_straight",
              "drawer_width_keeps_back_anchor_rotated",
              "swing_width_keeps_back_anchor",
              "corner_width_keeps_corner_anchor",
              "corner_depth_keeps_corner_anchor"
            ],
            materialResyncCases: [
              "material_resync_fwm_catalog_tall_cabinet_width",
              "material_resync_fwm_catalog_base_corner_width",
              "material_resync_fwm_catalog_base_doors_width",
              "material_resync_fwm_catalog_base_drawers_width"
            ],
            upperFlapCases: [
              "material_resync_fwm_catalog_wall_cabinet_width",
              "upper_cabinet_kitchen_placement",
              "upper_cabinet_position_y",
              "upper_cabinet_height",
              "upper_cabinet_front_material",
              "upper_cabinet_3d_geometry",
              "upper_cabinet_shelf_count_geometry",
              "upper_cabinet_initial_shelves_auto_fit",
              "upper_door_handle_inside_front",
              "upper_double_door_handles_inside_front",
              "upper_cabinet_ui_inserted",
              "upper_cabinet_ui_keeps_binding",
              "upper_cabinet_ui_initial_position_y",
              "upper_cabinet_ui_initial_world_bottom_y",
              "upper_cabinet_ui_floorplan_visibility",
              "upper_cabinet_ui_plan_footprint",
              "upper_cabinet_ui_plan_footprint_matches_3d",
              "upper_cabinet_ui_group_position_updates",
              "upper_cabinet_ui_group_world_bottom_updates",
              "upper_cabinet_ui_group_position_keeps_xz",
              "upper_cabinet_ui_group_footprint_keeps_3d_alignment",
              "upper_cabinet_ui_snapshot_saves_y",
              "upper_cabinet_ui_group_height_updates",
              "upper_cabinet_ui_group_depth_updates",
              "upper_cabinet_ui_group_depth_keeps_back_anchor",
              "upper_cabinet_module_parameters_keep_back_anchor"
            ]
          }
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
