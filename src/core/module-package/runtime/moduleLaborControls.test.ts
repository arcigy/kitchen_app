// @vitest-environment jsdom
import type { FurnQuoteModulePackage } from "../module-package-types";
import { afterEach, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../../catalog/catalog-bootstrap";
import { systemModulePackageTemplates } from "../../../system/module-packages";
import { capturePresetLabor, readModuleLabor } from "../../project-manufacturing/module-labor";
import { mountModuleLaborControls } from "./moduleLaborControls";

const catalog = { clientId: "fixture", ...createSystemCatalogSeed() };
const preset = { presetId: "work", label: "Work", note: "fixture", parameterValues: {}, laborRate: { amount: 200, currency: "CZK" as const } };
const pkg: FurnQuoteModulePackage = { ...structuredClone(systemModulePackageTemplates[0]), parameterPresets: { freeParameterKeys: [], presets: [preset] } };
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
const click = (label: string) => [...document.querySelectorAll("button")].find(button => button.textContent === label)!.click();
it("prevents a delayed library response from replacing an editable unsaved rate", async () => {
  let finish!: (value: typeof pkg) => void;
  const pending = new Promise<typeof pkg>(resolve => { finish = resolve; });
  const save = vi.fn(async (value: typeof pkg) => value);
  const params = { quantity: 3, moduleLabor: capturePresetLabor(pkg, preset, catalog) };
  mountModuleLaborControls(document.body, structuredClone(pkg), params, { clientCatalog: catalog, getWorktopThicknessMm: () => 0, onChange: vi.fn(), presetLaborApi: { load: () => pending, save } });
  expect(document.querySelector<HTMLInputElement>("[data-preset-labor-rate]")!.disabled).toBe(true);
  finish(structuredClone(pkg)); await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>("[data-preset-labor-rate]")!.disabled).toBe(false));
  document.querySelector<HTMLInputElement>("[data-preset-labor-rate]")!.value = "300";
  click("Uložiť do presetu");
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith(expect.anything(), "work", { amount: 300, currency: "CZK" }));
  expect(params.moduleLabor.inherited.rate?.amount).toBe(200);
});
it("saves explicit zero and resets the cabinet while keeping its captured inheritance", async () => {
  const params = { quantity: 3, moduleLabor: capturePresetLabor(pkg, preset, catalog) };
  const change = vi.fn();
  mountModuleLaborControls(document.body, structuredClone(pkg), params, { clientCatalog: catalog, getWorktopThicknessMm: () => 0, onChange: change });
  const input = document.querySelector<HTMLInputElement>("[data-module-labor-rate]")!;
  input.value = "0"; click("Uložiť pre túto skrinku");
  await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  expect(readModuleLabor(params.moduleLabor)?.override?.amount).toBe(0);
  click("Obnoviť zdedenú sadzbu");
  await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  expect(readModuleLabor(params.moduleLabor)?.override).toBeUndefined();
  expect(params.moduleLabor.inherited.rate?.amount).toBe(200);
});
