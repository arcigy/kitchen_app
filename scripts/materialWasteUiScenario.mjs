import { isDeepStrictEqual } from "node:util";
import { mkdir } from "node:fs/promises";

/** Used by the existing isolated pricing UI journey. All writes target its QA project. */
export async function verifyMaterialWasteUi(page, baseUrl, assert) {
  const marginResponse = method => page.waitForResponse(response => /\/api\/projects\/[^/]+\/margins$/.test(new URL(response.url()).pathname) && response.request().method() === method);
  const saveManufacturing = async () => {
    const response = marginResponse("PUT");
    await page.locator("[data-manufacturing-save]").click();
    const result = await response;
    assert(result.ok(), "Manufacturing settings save from Margins");
    await page.waitForFunction(() => !document.querySelector("[data-manufacturing-save]")?.disabled);
    return (await result.json()).view;
  };
  const openMaterials = async () => {
    const response = marginResponse("GET");
    await page.locator('[data-workspace-nav="materials"]').click();
    const result = await response;
    assert(result.ok(), "Materials loads the authoritative waste settings");
    await page.locator("[data-material-waste-form]").waitFor();
    return { view: (await result.json()).view, projectId: new URL(result.url()).pathname.split("/")[3] };
  };
  const openMargins = async () => {
    const response = marginResponse("GET");
    await page.locator('[data-workspace-nav="margins"]').click();
    const result = await response;
    assert(result.ok(), "Margins reopens after changing waste in Materials");
    await page.locator("[data-manufacturing-save]").waitFor();
    return (await result.json()).view;
  };

  // Establish a zero-waste baseline with explicit cabinet labor. UI writes must
  // retain these rates and the pre-existing project labor/margin overrides.
  await page.locator("[data-manufacturing-enabled]").check();
  await page.locator("[data-manufacturing-board-waste]").fill("0");
  await page.locator("[data-manufacturing-edge-waste]").fill("0");
  for (const input of await page.locator("[data-preassembly-instance]").all()) await input.fill("7.5");
  const baseline = await saveManufacturing();
  const { projectId } = await openMaterials();
  const checkbox = await page.locator("[data-material-waste-enabled]").boundingBox();
  assert(checkbox && checkbox.width <= 24 && checkbox.height <= 24, "Manufacturing toggle keeps its compact checkbox size");
  assert(await page.getByRole("textbox", { name: "Prerez dosiek (%)", exact: true }).inputValue() === "0", "Zero board waste is visible in Materials");
  assert(await page.getByRole("textbox", { name: "Prerez hrán (%)", exact: true }).inputValue() === "0", "Zero edge waste is visible in Materials");
  await page.getByRole("textbox", { name: "Prerez dosiek (%)", exact: true }).fill("30");
  await page.getByRole("textbox", { name: "Prerez hrán (%)", exact: true }).fill("12,5");
  const response = marginResponse("PUT");
  await page.getByRole("button", { name: "Uložiť prerezy", exact: true }).click();
  const result = await response;
  assert(result.ok(), "Waste rates save from Materials through the existing pricing API");
  const changed = (await result.json()).view;
  await page.locator("[data-material-waste-status]").filter({ hasText: "Prerezy sú uložené" }).waitFor();
  assert(isDeepStrictEqual(changed.settings.manufacturing, { ...baseline.settings.manufacturing, boardWastePercent: 30, edgeWastePercent: 12.5 }), "Materials changes only the two requested waste percentages");
  assert(changed.settings.defaultMarginPercent === baseline.settings.defaultMarginPercent
    && changed.settings.additionalLaborCost === baseline.settings.additionalLaborCost, "Changing waste preserves margin and project labor");
  const changedRows = new Map(changed.groups.flatMap(group => group.items).map(item => [item.targetId, item]));
  let pricedBoards = 0;
  for (const group of baseline.groups) for (const item of group.items) {
    const updated = changedRows.get(item.targetId);
    assert(!!updated, "Waste edit preserves quotation rows");
    const factor = item.unit === "m2" ? 1.3 : item.category.startsWith("edge_") ? 1.125 : 1;
    if (item.unit === "m2" && item.baseCost > 0) pricedBoards++;
    assert(Math.abs(updated.baseCost - item.baseCost * factor) <= .02, "Board/edge costs include waste once; hardware and labor retain their costs");
  }
  assert(pricedBoards > 0, "The UI waste check exercises actual priced board usage");
  await mkdir(".tmp/material-waste-ui", { recursive: true });
  await page.screenshot({ path: ".tmp/material-waste-ui/desktop.png" });
  await page.setViewportSize({ width: 1080, height: 900 });
  const box = await page.locator(".material-waste").boundingBox();
  assert(box && box.x >= 0 && box.x + box.width <= 1080, "Waste controls fit a compact viewport");
  await page.screenshot({ path: ".tmp/material-waste-ui/compact.png" });
  await page.setViewportSize({ width: 1600, height: 1000 });

  const reopened = await openMargins();
  assert(isDeepStrictEqual(reopened.settings.manufacturing, changed.settings.manufacturing), "Materials changes are immediately reflected in Margins");
  assert(isDeepStrictEqual(reopened.summary, changed.summary), "Leaving Materials and saving the project does not revert or multiply waste");
  await page.locator("[data-manufacturing-board-waste]").fill("8");
  const fromMargins = await saveManufacturing();
  await openMaterials();
  assert(await page.getByRole("textbox", { name: "Prerez dosiek (%)", exact: true }).inputValue() === "8", "Edits in Margins appear back in Materials");
  assert(await page.getByRole("textbox", { name: "Prerez hrán (%)", exact: true }).inputValue() === "12.5", "Editing one rate preserves the other");

  const exported = await page.context().request.get(new URL(`/api/projects/${projectId}/download`, baseUrl).toString());
  assert(exported.ok(), "Project with material waste settings exports to FQP");
  const imported = await page.context().request.post(new URL("/api/projects/import", baseUrl).toString(), { data: { envelope: await exported.text() } });
  assert(imported.ok(), "Project with material waste settings imports from FQP");
  const importedSave = (await imported.json()).save;
  assert(isDeepStrictEqual(importedSave.appState.quoteSettings.manufacturing, fromMargins.settings.manufacturing), "FQP retains the exact waste settings and preassembly rates");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__kitchenDebug);
  await openMaterials();
  assert(await page.getByRole("textbox", { name: "Prerez dosiek (%)", exact: true }).inputValue() === "8"
    && await page.getByRole("textbox", { name: "Prerez hrán (%)", exact: true }).inputValue() === "12.5", "Refresh restores the saved material waste rates");
  await openMargins();
}
