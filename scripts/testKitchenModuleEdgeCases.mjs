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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

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

    const failures = [...drawerFailures, ...cornerFailures, ...adjacencyFailures];
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
            adjacencyCases: [
              "drawer_width_growth_next_to_corner_grows_away",
              "corner_lengthX_growth_pushes_attached_drawer",
              "drawer_width_growth_keeps_adjacent_drawer_fixed"
            ]
          }
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
