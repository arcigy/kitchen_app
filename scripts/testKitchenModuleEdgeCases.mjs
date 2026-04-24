import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

const drawerCases = [
  { key: "width", next: (inst) => nextNumber(inst.params.width, 120), expectGeometry: true },
  { key: "depth", next: (inst) => nextNumber(inst.params.depth, 80), expectGeometry: true },
  { key: "height", next: (inst) => nextNumber(inst.params.height, 100), expectGeometry: true },
  { key: "heightCarcass", next: (inst) => nextNumber(inst.params.heightCarcass, 80), expectGeometry: true },
  { key: "boardThickness", next: (inst) => nextNumber(inst.params.boardThickness, 2), expectGeometry: true },
  { key: "backThickness", next: (inst) => nextNumber(inst.params.backThickness, 2), expectGeometry: true },
  { key: "frontThicknessMm", next: (inst) => nextNumber(inst.params.frontThicknessMm, 2), expectGeometry: true },
  { key: "drawerCount", next: (inst) => nextNumber(inst.params.drawerCount, 1), expectGeometry: true },
  { key: "handlePositionMm", next: (inst) => nextNumber(inst.params.handlePositionMm, 50, 0), expectGeometry: true },
  { key: "backGrooveDepthMm", next: (inst) => nextNumber(inst.params.backGrooveDepthMm, 2, 0), expectGeometry: true }
];

const cornerCases = [
  { key: "depth", next: (inst) => nextNumber(inst.params.depth, 100), expectGeometry: true },
  { key: "height", next: (inst) => nextNumber(inst.params.height, 100), expectGeometry: true },
  { key: "heightCarcass", next: (inst) => nextNumber(inst.params.heightCarcass, 80), expectGeometry: true },
  { key: "boardThickness", next: (inst) => nextNumber(inst.params.boardThickness, 2), expectGeometry: false },
  { key: "backThickness", next: (inst) => nextNumber(inst.params.backThickness, 2), expectGeometry: false },
  { key: "frontThicknessMm", next: (inst) => nextNumber(inst.params.frontThicknessMm, 2), expectGeometry: true },
  { key: "lengthX", next: (inst) => nextNumber(inst.params.lengthX, 120), expectGeometry: true },
  { key: "lengthZ", next: (inst) => nextNumber(inst.params.lengthZ, 120), expectGeometry: true },
  { key: "shelfCount", next: (inst) => nextNumber(inst.params.shelfCount, 1), expectGeometry: false },
  { key: "plinthHeight", next: (inst) => nextNumber(inst.params.plinthHeight, 20, 0), expectGeometry: true },
  { key: "plinthSetbackMm", next: (inst) => nextNumber(inst.params.plinthSetbackMm, 20, 0), expectGeometry: true },
  { key: "doorOpen", next: (inst) => !inst.params.doorOpen, expectGeometry: false },
  { key: "handlePositionMm", next: (inst) => nextNumber(inst.params.handlePositionMm, 50, 0), expectGeometry: false },
  { key: "backGrooveDepthMm", next: (inst) => nextNumber(inst.params.backGrooveDepthMm, 2, 0), expectGeometry: false }
];

const swingCases = [
  { key: "width", next: (inst) => nextNumber(inst.params.width, 120), expectGeometry: true },
  { key: "depth", next: (inst) => nextNumber(inst.params.depth, 80), expectGeometry: true },
  { key: "height", next: (inst) => nextNumber(inst.params.height, 80), expectGeometry: true },
  { key: "heightCarcass", next: (inst) => nextNumber(inst.params.heightCarcass, 80), expectGeometry: true },
  { key: "frontThicknessMm", next: (inst) => nextNumber(inst.params.frontThicknessMm, 2), expectGeometry: true },
  { key: "shelfCount", next: (inst) => nextNumber(inst.params.shelfCount, 1), expectGeometry: true },
  { key: "handlePositionMm", next: (inst) => nextNumber(inst.params.handlePositionMm, 40, 0), expectGeometry: true }
];

const fridgeCases = [
  { key: "width", next: (inst) => nextNumber(inst.params.width, 120), expectGeometry: true },
  { key: "height", next: (inst) => nextNumber(inst.params.height, 120), expectGeometry: true },
  { key: "depth", next: (inst) => nextNumber(inst.params.depth, 60), expectGeometry: true },
  { key: "frontThicknessMm", next: (inst) => nextNumber(inst.params.frontThicknessMm, 2), expectGeometry: true },
  { key: "fridgeWidthMm", next: (inst) => nextNumber(inst.params.fridgeWidthMm, 20), expectGeometry: true },
  { key: "fridgeHeightMm", next: (inst) => Math.max(100, Math.round(Number(inst.params.fridgeHeightMm ?? 1730) - 40)), expectGeometry: true },
  { key: "freezerDoorHeightMm", next: (inst) => nextNumber(inst.params.freezerDoorHeightMm, 40), expectGeometry: true },
  { key: "handlePositionMm", next: (inst) => nextNumber(inst.params.handlePositionMm, 40, 0), expectGeometry: true },
  { key: "doorOpen", next: (inst) => !inst.params.doorOpen, expectGeometry: true }
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
    const beforeSnap = await snapshot(page, groupId);
    const beforeModule = getPrimaryModule(beforeSnap, moduleType);
    const beforeValue = clone(beforeModule.params[testCase.key]);
    const nextValue = testCase.next(beforeModule);
    const result = await patchModule(page, beforeModule.id, { [testCase.key]: nextValue }, { sourceKey: testCase.key, preserveBackAnchor: true });
    const afterModule = result.instance;
    const changedValue = !deepEqual(afterModule.params[testCase.key], beforeValue);
    const geometryChanged = moduleSignature(beforeModule) !== moduleSignature(afterModule);
    if (!result.ok || !changedValue || (testCase.expectGeometry && !geometryChanged)) {
      failures.push({
        case: testCase.key,
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
    const created = await createScenario(page, { path: lPath, addModule: true, moduleType: "corner_shelf_lower" });
    const groupId = created.group.id;
    await addKitchenModule(page, groupId, { type: "drawer_low", segmentIndex: 0, offsetAlongMm: 980 });
    const snapBefore = await snapshot(page, groupId);
    const corner = snapBefore.instances.find((item) => item.params.type === "corner_shelf_lower");
    const drawer = snapBefore.instances.find((item) => item.params.type === "drawer_low");
    expect(corner && drawer, "corner adjacency scenario missing modules", snapBefore);
    const beforeAdj = await detectAdjacency(page, drawer.id);
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
      beforeAdj.length > 0 &&
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

  {
    const created = await createScenario(page, { path: lPath, addModule: true, moduleType: "corner_shelf_lower" });
    const groupId = created.group.id;
    await addKitchenModule(page, groupId, { type: "drawer_low", segmentIndex: 1, offsetAlongMm: 700 });
    const before = await snapshot(page, groupId);
    const corner = before.instances.find((item) => item.params.type === "corner_shelf_lower");
    const drawer = before.instances.find((item) => item.params.type === "drawer_low");
    expect(corner && drawer, "corner lengthX adjacency scenario missing modules", before);
    const result = await patchModule(
      page,
      corner.id,
      { lengthX: Number(corner.params.lengthX ?? 1000) + 120 },
      { sourceKey: "lengthX", preserveBackAnchor: true }
    );
    const after = await snapshot(page, groupId);
    const afterCorner = after.instances.find((item) => item.id === corner.id);
    const afterDrawer = after.instances.find((item) => item.id === drawer.id);
    const drawerMoved =
      Math.abs(afterDrawer.positionM.x - drawer.positionM.x) > 0.0005 || Math.abs(afterDrawer.positionM.z - drawer.positionM.z) > 0.0005;
    if (!result.ok || Number(afterCorner.params.lengthX) <= Number(corner.params.lengthX) || !drawerMoved) {
      failures.push({
        case: "corner_lengthX_growth_pushes_attached_drawer",
        ok: result.ok,
        beforeLengthX: corner.params.lengthX,
        afterLengthX: afterCorner.params.lengthX,
        drawerMoved,
        beforeCornerPos: corner.positionM,
        afterCornerPos: afterCorner.positionM,
        beforeDrawerPos: drawer.positionM,
        afterDrawerPos: afterDrawer.positionM
      });
    }
  }

  {
    const created = await createScenario(page, {
      path: [{ x: 0, z: 0 }, { x: 3200, z: 0 }],
      addModule: true,
      moduleType: "drawer_low",
      offsetAlongMm: 700
    });
    const groupId = created.group.id;
    await addKitchenModule(page, groupId, { type: "drawer_low", segmentIndex: 0, offsetAlongMm: 1500 });
    const before = await snapshot(page, groupId);
    const drawers = before.instances.filter((item) => item.params.type === "drawer_low");
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
    moduleType: "drawer_low",
    offsetAlongMm: 700
  });
  const groupId = created.group.id;
  await addKitchenModule(page, groupId, { type: "swing_shelves_low", segmentIndex: 0, offsetAlongMm: 1550 });
  await addKitchenModule(page, groupId, { type: "drawer_low", segmentIndex: 0, offsetAlongMm: 2550 });

  const before = await snapshot(page, groupId);
  const ordered = before.instances.slice().sort((a, b) => a.positionM.x - b.positionM.x);
  const leftDrawer = ordered.find((item) => item.params.type === "drawer_low");
  const swing = ordered.find((item) => item.params.type === "swing_shelves_low");
  const rightDrawer = ordered.slice().reverse().find((item) => item.params.type === "drawer_low");
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
      { frontThicknessMm: Number(currentLeft.params.frontThicknessMm ?? 19) + 2 },
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
      { width: Number(currentRight.params.width ?? 800) + 120 },
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    serviceWorkers: "block"
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const drawerFailures = await runMatrix(
      page,
      "drawer",
      {
        path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }]
      },
      "drawer_low",
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
      "corner_shelf_lower",
      cornerCases
    );

    const adjacencyFailures = await runAdjacencyCases(page);
    const swingFailures = await runMatrix(
      page,
      "swing",
      {
        path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }]
      },
      "swing_shelves_low",
      swingCases
    );

    const fridgeFailures = await runMatrix(
      page,
      "fridge",
      {
        path: [{ x: 0, z: 0 }, { x: 2600, z: 0 }]
      },
      "fridge_tall",
      fridgeCases
    );

    const clusterFailures = await runClusterCases(page);

    const failures = [...drawerFailures, ...cornerFailures, ...swingFailures, ...fridgeFailures, ...adjacencyFailures, ...clusterFailures];
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
            fridgeCases: fridgeCases.map((item) => item.key),
            adjacencyCases: [
              "drawer_width_growth_next_to_corner_grows_away",
              "corner_lengthX_growth_pushes_attached_drawer",
              "drawer_width_growth_keeps_adjacent_drawer_fixed"
            ],
            clusterCases: [
              "cluster_swing_heightCarcass_commits_without_shift",
              "cluster_drawer_frontThickness_commits_without_shift",
              "cluster_edge_drawer_width_grows_without_shifting_neighbors"
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
