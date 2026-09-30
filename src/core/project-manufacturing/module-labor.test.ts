import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../catalog/catalog-bootstrap";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { adoptPresetLabor, capturePresetLabor, effectiveModuleLabor, moduleLaborAmount, readModuleLabor, sameLaborPreset, validateLaborRate } from "./module-labor";
import { resolveMatchingModuleParameterPresetId } from "../module-package/runtime/moduleParameterPresetPicker";

const catalog = { clientId: "labor-test", ...createSystemCatalogSeed() };
const pkg = structuredClone(systemModulePackageTemplates.find(p => p.module.moduleType === "fwm_catalog_base_drawers")!);
const preset = { presetId: "labor-a", label: "A", note: "fixture", parameterValues: { drawerCount: 2 }, laborRate: { amount: 200, currency: "CZK" as const } };

describe("cabinet labor snapshots", () => {
  it("keeps two existing projects at 200 after the library changes to 250, with explicit adoption and independent copies", () => {
    const a: Record<string, unknown> = { quantity: 3 };
    const b: Record<string, unknown> = {};
    adoptPresetLabor(a, pkg, preset, catalog); adoptPresetLabor(b, pkg, preset, catalog);
    const copy = structuredClone(a);
    const updated = { ...preset, laborRate: { ...preset.laborRate, amount: 250 } };
    const newlyPlaced = capturePresetLabor(pkg, updated, catalog);
    expect(effectiveModuleLabor(newlyPlaced).rate?.amount).toBe(250);
    expect(effectiveModuleLabor(readModuleLabor(a.moduleLabor)!).rate?.amount).toBe(200);
    expect(effectiveModuleLabor(readModuleLabor(b.moduleLabor)!).rate?.amount).toBe(200);
    adoptPresetLabor(a, pkg, updated, catalog);
    expect(effectiveModuleLabor(readModuleLabor(a.moduleLabor)!).rate?.amount).toBe(250);
    expect(effectiveModuleLabor(readModuleLabor(copy.moduleLabor)!).rate?.amount).toBe(200);
    expect(readModuleLabor(JSON.parse(JSON.stringify(b)).moduleLabor)).toEqual(b.moduleLabor);
  });
  it("preserves a zero override during bulk adoption and resets only on explicit adoption", () => {
    const state = capturePresetLabor(pkg, preset, catalog); state.override = { amount: 0, currency: "EUR" };
    const params: Record<string, unknown> = { moduleLabor: state };
    adoptPresetLabor(params, pkg, { ...preset, laborRate: { amount: 250, currency: "CZK" } }, catalog);
    expect(effectiveModuleLabor(readModuleLabor(params.moduleLabor)!).rate?.amount).toBe(0);
    adoptPresetLabor(params, pkg, preset, catalog, false);
    expect(effectiveModuleLabor(readModuleLabor(params.moduleLabor)!).rate?.amount).toBe(200);
  });
  it("uses explicit preset identity, even for identical geometry, and isolates package identities", () => {
    const other = { ...preset, presetId: "labor-b", laborRate: { amount: 500, currency: "CZK" as const } };
    const shared = { ...pkg, parameterPresets: { freeParameterKeys: [], presets: [preset, other] } };
    const state = capturePresetLabor(shared, other, catalog);
    expect(resolveMatchingModuleParameterPresetId(shared, { drawerCount: 2, moduleLabor: state })).toBe("labor-b");
    expect(sameLaborPreset(state, "different-package", "labor-b")).toBe(false);
  });
  it("multiplies per-cabinet work once, converts currency and rejects invalid values", () => {
    expect(moduleLaborAmount(preset.laborRate, 3, "CZK") + 100).toBe(700);
    expect(moduleLaborAmount({ amount: 10, currency: "EUR" }, 3, "CZK")).toBe(725.79);
    expect(moduleLaborAmount({ amount: 0, currency: "EUR" }, 3, "CZK")).toBe(0);
    for (const amount of [-1, NaN, Infinity, 10_000_001]) expect(() => validateLaborRate({ amount, currency: "EUR" })).toThrow();
    expect(() => validateLaborRate({ amount: 1, currency: "USD" })).toThrow();
    expect(() => moduleLaborAmount(preset.laborRate, 1.5, "CZK")).toThrow();
    expect(() => readModuleLabor({ schemaVersion: 1, inherited: { source: "preset", rate: { amount: -1, currency: "EUR" } } })).toThrow();
  });
  it("captures a module default when preset labor is blank and retains it after catalog edits", () => {
    const local = { ...catalog, manufacturing: { recipes: [], preassemblyByModuleType: { [pkg.module.moduleType]: 75 }, preassemblyByPreset: {}, boardWastePercent: 0, edgeWastePercent: 0, boardWasteByMaterialId: {}, edgeWasteByMaterialId: {} } };
    const state = capturePresetLabor(pkg, { ...preset, laborRate: null }, local);
    local.manufacturing.preassemblyByModuleType[pkg.module.moduleType] = 90;
    expect(state.inherited).toMatchObject({ source: "module", rate: { amount: 75 } });
    expect(capturePresetLabor(pkg, { ...preset, laborRate: null }, catalog).inherited).toEqual({ source: "missing", rate: null });
  });
});
