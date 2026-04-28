import { chromium } from "playwright";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

const kitchenInputAliases = {
  "Height (mm)": ["Height (mm)", "Výška (mm)"],
  "Worktop depth (mm)": ["Worktop depth (mm)", "Hĺbka pracovnej dosky (mm)"],
  "Worktop front offset (mm)": ["Worktop front offset (mm)", "Predné odsadenie pracovnej dosky (mm)"],
  "Worktop back offset (mm)": ["Worktop back offset (mm)", "Zadné odsadenie pracovnej dosky (mm)"]
};

async function setKitchenInput(page, label, value) {
  const result = await page.evaluate(({ label, value }) => {
    const labels = window.__kitchenInputAliases?.[label] ?? [label];
    const rows = [...document.querySelectorAll("div")];
    const row = rows.find((candidate) => {
      const text = candidate.firstElementChild?.textContent?.trim?.() ?? "";
      if (!labels.includes(text)) return false;
      return !!candidate.querySelector('input[type="number"]');
    });
    if (!row) return { ok: false, reason: `Missing row ${label}`, labels };
    const input = row.querySelector('input[type="number"]');
    if (!(input instanceof HTMLInputElement)) return { ok: false, reason: `Missing input for ${label}` };
    input.focus();
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, actual: input.value };
  }, { label, value });
  if (!result?.ok) {
    throw new Error(JSON.stringify(result, null, 2));
  }
}

function mmFromM(value) {
  return Math.round(value * 1000);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function expectNear(actual, expected, tolerance, label) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected}±${tolerance}, got ${actual}`);
  }
}

async function snapshot(page, groupId) {
  return await page.evaluate((id) => {
    const api = window.__kitchenDebug;
    if (!api) throw new Error("Missing __kitchenDebug");
    return api.snapshot(id);
  }, groupId);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate((aliases) => {
      window.__kitchenInputAliases = aliases;
    }, kitchenInputAliases);

    const initial = await page.evaluate(() => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      return api.createKitchenScenario({
        path: [
          { x: 0, z: 0 },
          { x: 2400, z: 0 }
        ],
        justification: "back",
        mirrored: false,
        addModule: true,
        moduleType: "drawer_low",
        segmentIndex: 0,
        offsetAlongMm: 800
      });
    });

    const groupId = initial.group?.id;
    if (!groupId) {
      throw new Error(`Missing group id: ${JSON.stringify(initial, null, 2)}`);
    }

    const getPrimaryModule = (snap) => {
      const module = snap.instances?.[0];
      if (!module) throw new Error(`Missing module in snapshot: ${JSON.stringify(snap, null, 2)}`);
      return module;
    };

    const getPrimaryWorktop = (snap) => {
      const worktop = snap.worktops?.[0];
      if (!worktop) throw new Error(`Missing worktop in snapshot: ${JSON.stringify(snap, null, 2)}`);
      return worktop;
    };

    const before = await snapshot(page, groupId);
    const beforeModule = getPrimaryModule(before);
    const beforeWorktop = getPrimaryWorktop(before);
    if (!beforeModule.kitchenPlacement) throw new Error("Initial module missing kitchenPlacement binding");
    const beforeBackZ = mmFromM(beforeModule.worldBackCenterM.z);
    const beforeGuideZ = mmFromM(beforeWorktop.guidePathM[0].z);
    const beforePos = {
      x: mmFromM(beforeModule.positionM.x),
      z: mmFromM(beforeModule.positionM.z)
    };

    expectEqual(before.group.ctx.heightMm, 820, "initial kitchen height");
    expectEqual(before.group.ctx.worktopDepthMm, 620, "initial kitchen worktop depth");
    expectEqual(before.group.ctx.worktopFrontOffsetMm, 20, "initial kitchen front offset");
    expectEqual(before.group.ctx.worktopBackOffsetMm, 20, "initial kitchen back offset");
    expectEqual(beforeModule.params.height, 820, "initial module height");
    expectEqual(beforeModule.params.heightCarcass, 782, "initial module carcass height");
    expectEqual(beforeModule.params.depth, 580, "initial module depth");
    expectEqual(beforeModule.structuralDepthMm, 580, "initial structural module depth");
    expectNear(beforeBackZ, beforeGuideZ, 1, "initial module back on guide");

    await setKitchenInput(page, "Height (mm)", 900);
    const afterHeight = await snapshot(page, groupId);
    const heightModule = getPrimaryModule(afterHeight);
    const heightWorktop = getPrimaryWorktop(afterHeight);
    expectEqual(afterHeight.group.ctx.heightMm, 900, "height ctx");
    expectEqual(afterHeight.group.ctx.moduleHeightMm, 862, "height ctx moduleHeight");
    expectEqual(heightWorktop.params.heightMm, 900, "height worktop");
    expectEqual(heightModule.params.height, 900, "height module");
    expectEqual(heightModule.params.heightCarcass, 862, "height module carcass");
    expectNear(mmFromM(heightModule.worldBackCenterM.z), beforeGuideZ, 1, "height preserves back anchor");

    await setKitchenInput(page, "Worktop depth (mm)", 700);
    const afterDepth = await snapshot(page, groupId);
    const depthModule = getPrimaryModule(afterDepth);
    const depthWorktop = getPrimaryWorktop(afterDepth);
    expectEqual(afterDepth.group.ctx.worktopDepthMm, 700, "depth ctx");
    expectEqual(afterDepth.group.ctx.moduleDepthMm, 660, "depth ctx moduleDepth");
    expectEqual(depthWorktop.params.depthMm, 700, "depth worktop");
    expectEqual(depthModule.params.depth, 660, "depth module param");
    expectEqual(depthModule.structuralDepthMm, 660, "depth structural");
    expectNear(mmFromM(depthModule.worldBackCenterM.z), beforeGuideZ, 1, "depth preserves back anchor");
    expectNear(mmFromM(depthModule.positionM.x), beforePos.x, 1, "depth preserves module root x");
    expectNear(mmFromM(depthModule.positionM.z), beforePos.z, 1, "depth preserves module root z");
    expectEqual(depthModule.kitchenPlacement.worktopId, beforeModule.kitchenPlacement.worktopId, "depth keeps worktop binding");
    expectEqual(depthModule.kitchenPlacement.segmentIndex, beforeModule.kitchenPlacement.segmentIndex, "depth keeps segment binding");
    expectNear(depthModule.kitchenPlacement.offsetAlongM, beforeModule.kitchenPlacement.offsetAlongM, 0.001, "depth keeps offset binding");

    await setKitchenInput(page, "Worktop front offset (mm)", 50);
    const afterFront = await snapshot(page, groupId);
    const frontModule = getPrimaryModule(afterFront);
    const frontWorktop = getPrimaryWorktop(afterFront);
    const frontBackZ = mmFromM(frontModule.worldBackCenterM.z);
    const frontGuideZ = mmFromM(frontWorktop.guidePathM[0].z);
    expectEqual(afterFront.group.ctx.worktopFrontOffsetMm, 50, "front offset ctx");
    expectEqual(afterFront.group.ctx.worktopBackOffsetMm, 20, "front offset does not mutate back offset");
    expectEqual(afterFront.group.ctx.moduleDepthMm, 630, "front offset ctx moduleDepth");
    expectEqual(frontWorktop.params.depthMm, 700, "front offset leaves worktop depth");
    expectEqual(frontModule.params.depth, 630, "front offset module depth");
    expectEqual(frontModule.structuralDepthMm, 630, "front offset structural depth");
    expectNear(frontBackZ, frontGuideZ, 1, "front offset keeps module back on guide");
    expectNear(frontBackZ, beforeGuideZ, 1, "front offset keeps same guide when back offset unchanged");
    expectEqual(frontModule.kitchenPlacement.worktopId, beforeModule.kitchenPlacement.worktopId, "front offset keeps worktop binding");
    expectEqual(frontModule.kitchenPlacement.segmentIndex, beforeModule.kitchenPlacement.segmentIndex, "front offset keeps segment binding");
    expectNear(frontModule.kitchenPlacement.offsetAlongM, beforeModule.kitchenPlacement.offsetAlongM, 0.001, "front offset keeps offset binding");

    await setKitchenInput(page, "Worktop back offset (mm)", 40);
    const afterBack = await snapshot(page, groupId);
    const backModule = getPrimaryModule(afterBack);
    const backWorktop = getPrimaryWorktop(afterBack);
    const backBackZ = mmFromM(backModule.worldBackCenterM.z);
    const backGuideZ = mmFromM(backWorktop.guidePathM[0].z);
    expectEqual(afterBack.group.ctx.worktopFrontOffsetMm, 50, "back offset leaves front offset");
    expectEqual(afterBack.group.ctx.worktopBackOffsetMm, 40, "back offset ctx");
    expectEqual(afterBack.group.ctx.moduleDepthMm, 610, "back offset ctx moduleDepth");
    expectEqual(backModule.params.depth, 610, "back offset module depth");
    expectEqual(backModule.structuralDepthMm, 610, "back offset structural depth");
    expectNear(backBackZ, backGuideZ, 1, "back offset keeps module back on moved guide");
    expectEqual(backGuideZ - frontGuideZ, 20, "back offset moves guide by delta");
    expectEqual(backModule.kitchenPlacement.worktopId, beforeModule.kitchenPlacement.worktopId, "back offset keeps worktop binding");
    expectEqual(backModule.kitchenPlacement.segmentIndex, beforeModule.kitchenPlacement.segmentIndex, "back offset keeps segment binding");
    expectNear(backModule.kitchenPlacement.offsetAlongM, beforeModule.kitchenPlacement.offsetAlongM, 0.001, "back offset keeps offset binding");

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          groupId,
          checks: {
            before: {
              kitchen: before.group.ctx,
              worktop: beforeWorktop.params,
              module: {
                height: beforeModule.params.height,
                heightCarcass: beforeModule.params.heightCarcass,
                depth: beforeModule.params.depth,
                structuralDepthMm: beforeModule.structuralDepthMm,
                realizedDepthMm: beforeModule.realizedDepthMm,
                kitchenPlacement: beforeModule.kitchenPlacement,
                backZMm: beforeBackZ,
                guideZMm: beforeGuideZ
              }
            },
            afterHeight: {
              kitchen: afterHeight.group.ctx,
              module: {
                height: heightModule.params.height,
                heightCarcass: heightModule.params.heightCarcass,
                backZMm: mmFromM(heightModule.worldBackCenterM.z)
              }
            },
            afterDepth: {
              kitchen: afterDepth.group.ctx,
              module: {
                depth: depthModule.params.depth,
                structuralDepthMm: depthModule.structuralDepthMm,
                realizedDepthMm: depthModule.realizedDepthMm,
                kitchenPlacement: depthModule.kitchenPlacement,
                backZMm: mmFromM(depthModule.worldBackCenterM.z),
                positionMm: {
                  x: mmFromM(depthModule.positionM.x),
                  z: mmFromM(depthModule.positionM.z)
                }
              }
            },
            afterFrontOffset: {
              kitchen: afterFront.group.ctx,
              module: {
                depth: frontModule.params.depth,
                structuralDepthMm: frontModule.structuralDepthMm,
                realizedDepthMm: frontModule.realizedDepthMm,
                kitchenPlacement: frontModule.kitchenPlacement,
                backZMm: frontBackZ,
                guideZMm: frontGuideZ
              }
            },
            afterBackOffset: {
              kitchen: afterBack.group.ctx,
              module: {
                depth: backModule.params.depth,
                structuralDepthMm: backModule.structuralDepthMm,
                realizedDepthMm: backModule.realizedDepthMm,
                kitchenPlacement: backModule.kitchenPlacement,
                backZMm: backBackZ,
                guideZMm: backGuideZ
              }
            }
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
