// @vitest-environment jsdom
import type { FurnQuoteModulePackage } from "../module-package-types";
import { afterEach, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../../catalog/catalog-bootstrap";
import { systemModulePackageTemplates } from "../../../system/module-packages";
import { capturePresetLabor, readModuleLabor } from "../../project-manufacturing/module-labor";
import { createLaborRateInput, mountModuleLaborControls } from "./moduleLaborControls";

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
  mountModuleLaborControls(document.body, structuredClone(pkg), params, { clientCatalog: catalog, defaultCurrency: "CZK", getWorktopThicknessMm: () => 0, onChange: vi.fn(), presetLaborApi: { load: () => pending, save } });
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
  mountModuleLaborControls(document.body, structuredClone(pkg), params, { clientCatalog: catalog, defaultCurrency: "CZK", getWorktopThicknessMm: () => 0, onChange: change });
  const input = document.querySelector<HTMLInputElement>("[data-module-labor-rate]")!;
  input.value = "0"; click("Uložiť pre túto skrinku");
  await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1));
  expect(readModuleLabor(params.moduleLabor)?.override?.amount).toBe(0);
  click("Obnoviť zdedenú sadzbu");
  await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(2));
  expect(readModuleLabor(params.moduleLabor)?.override).toBeUndefined();
  expect(params.moduleLabor.inherited.rate?.amount).toBe(200);
});

it("uses tenant currency without silently rewriting a captured foreign-currency amount", () => {
  const params = { quantity: 3, moduleLabor: {
    schemaVersion: 1 as const,
    inherited: { source: "module" as const, rate: { amount: 10, currency: "EUR" as const } }
  } };
  mountModuleLaborControls(document.body, structuredClone(pkg), params, {
    clientCatalog: catalog,
    defaultCurrency: "CZK",
    getWorktopThicknessMm: () => 0,
    onChange: vi.fn()
  });

  expect(document.querySelector("[data-module-labor-summary]")?.textContent).toContain("Zadajte vlastnú sumu v CZK");
  expect(document.querySelector<HTMLInputElement>("[data-module-labor-rate]")?.value).toBe("");
  expect(document.querySelector("[data-module-labor] select")).toBeNull();
  expect(document.querySelector("[data-labor-currency]")?.textContent).toBe("CZK");
  expect(params.moduleLabor.inherited.rate).toEqual({ amount: 10, currency: "EUR" });
});


it.each(["EUR", "CZK"] as const)("writes only the tenant currency %s, including explicit zero", currency => {
  const editor = createLaborRateInput("Práca", null, currency);
  document.body.append(editor.host);
  expect(editor.host.querySelector("select")).toBeNull();
  expect(editor.host.querySelector("[data-labor-currency]")?.textContent).toBe(currency);
  expect(editor.read()).toBeNull();
  editor.input.value = "0";
  expect(editor.read()).toEqual({ amount: 0, currency });
  editor.input.value = "125.50";
  expect(editor.read()).toEqual({ amount: 125.5, currency });
});

it("requires an explicit tenant amount instead of relabeling or converting an existing rate", () => {
  const rate = { amount: 10, currency: "EUR" as const };
  const editor = createLaborRateInput("Práca", rate, "CZK");
  expect(editor.input.value).toBe("");
  expect(() => editor.read()).toThrow("CZK");
  editor.input.value = "250";
  expect(editor.read()).toEqual({ amount: 250, currency: "CZK" });
  expect(rate).toEqual({ amount: 10, currency: "EUR" });
});


it("does not adopt a foreign-currency preset into a tenant amount without an explicit edit", () => {
  const params = { moduleLabor: capturePresetLabor(pkg, preset, catalog) };
  const before = structuredClone(params);
  mountModuleLaborControls(document.body, structuredClone(pkg), params, {
    clientCatalog: catalog, defaultCurrency: "EUR", getWorktopThicknessMm: () => 0,
    onChange: vi.fn(), adoptPresetLaborForProject: vi.fn()
  });
  const adopt = [...document.querySelectorAll("button")].filter(button => button.textContent?.startsWith("Prevziať"));
  expect(adopt).toHaveLength(2);
  expect(adopt.every(button => button.disabled)).toBe(true);
  expect(document.querySelector<HTMLInputElement>("[data-preset-labor-rate]")?.value).toBe("");
  expect(params).toEqual(before);
});
