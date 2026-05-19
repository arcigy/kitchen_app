import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function expect(condition, message) {
  if (!condition) throw new Error(message);
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await installAuthSession(page);

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const api = window.__kitchenDebug;
      if (!api) throw new Error("Missing __kitchenDebug");
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      api.reset();
      const w1 = api.createWall({ aMm: { x: 0, z: 0 }, bMm: { x: 2000, z: 0 }, thicknessMm: 100 });
      const w2 = api.createWall({ aMm: { x: 0, z: 1000 }, bMm: { x: 2000, z: 1000 }, thicknessMm: 100 });
      if (!w1 || !w2) throw new Error("Failed to create test walls.");

      const measure = api.createMeasure({ aMm: { x: 1000, z: 0 }, bMm: { x: 1000, z: 1000 } });
      const before = api.measureState();

      api.moveWall(w2.id, { x: 0, z: 200 });
      await nextFrame();
      await nextFrame();
      const afterMove = api.measureState();

      api.commitWallMeasureValue(w2.id, measure.id, 900);
      await nextFrame();
      await nextFrame();
      const afterEdit = api.measureState();
      const walls = api.viewState().walls;

      const normal = api.createMeasure({ aMm: { x: 1000, z: 0 }, bMm: { x: 1500, z: 0 }, normal: true });
      await nextFrame();
      const snapped = api.planSnap({ x: 1004, z: 954 });
      const afterNormal = api.measureState();

      return { w1, w2, before, afterMove, afterEdit, afterNormal, walls, measureId: measure.id, normalId: normal.id, snapped };
    });

    const baseMeasure = result.before.measures.find((item) => item.id === result.measureId);
    expect(baseMeasure, "Missing stored measure");
    expectEqual(baseMeasure.kind, "distance", "measure kind");
    expectEqual(baseMeasure.aBinding.type, "wallCenterline", "measure binding A");
    expectEqual(baseMeasure.bBinding.type, "wallCenterline", "measure binding B");
    expectEqual(baseMeasure.aMm.z, 0, "initial measure start z");
    expectEqual(baseMeasure.bMm.z, 1000, "initial measure end z");

    const movedMeasure = result.afterMove.measures.find((item) => item.kind === "distance");
    expect(movedMeasure, "Missing measure after wall move");
    expectEqual(movedMeasure.bMm.z, 1200, "measure follows moved wall");

    const editedMeasure = result.afterEdit.measures.find((item) => item.kind === "distance");
    expect(editedMeasure, "Missing measure after edit");
    expectEqual(editedMeasure.bMm.z, 900, "measure edit moved wall to requested distance");
    const movedWall = result.walls.find((item) => item.id === result.w2.id);
    expect(movedWall, "Missing moved wall state");
    expectEqual(movedWall.aMm.z, 900, "wall endpoint a after measure edit");
    expectEqual(movedWall.bMm.z, 900, "wall endpoint b after measure edit");

    const normalGuide = result.afterNormal.measures.find((item) => item.id === result.normalId);
    expect(normalGuide, "Missing normal guide");
    expectEqual(normalGuide.kind, "normalGuide", "normal guide kind");
    expectNear(result.snapped.pointMm.x, 1000, 2, "normal guide intersection x");
    expectNear(result.snapped.pointMm.z, 950, 2, "normal guide intersection z");
    expect(result.snapped.kind === "corner" || result.snapped.kind === "endpoint", `Unexpected snap kind ${result.snapped.kind}`);

    console.log(JSON.stringify({ ok: true, result }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
