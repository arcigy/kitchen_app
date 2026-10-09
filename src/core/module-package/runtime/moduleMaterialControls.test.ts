// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../../catalog/catalog-bootstrap";
import { systemModulePackageTemplates } from "../../../system/module-packages";
import { createModulePackageDefaultParams } from "./module-runtime-adapter";
import { createResolvedModuleControls } from "./module-package-controls";

const catalog = { clientId: "fixture", ...createSystemCatalogSeed() };
afterEach(() => document.body.replaceChildren());

it.each(systemModulePackageTemplates.map(pkg => [pkg.module.moduleType, pkg] as const))(
  "%s omits duplicate material parameters without changing persisted values or dimension controls",
  (_type, source) => {
    const pkg = structuredClone(source);
    const params = createModulePackageDefaultParams({ modulePackage: pkg, catalog });
    const before = structuredClone(params);
    const change = vi.fn();
    createResolvedModuleControls(document.body, pkg, params, {
      clientCatalog: catalog, getWorktopThicknessMm: () => 0, onChange: change
    });
    expect(document.body.querySelector('[data-parameter-key$="MaterialId"], [data-parameter-key$="MaterialGroup"]')).toBeNull();
    expect([...document.querySelectorAll("input")].filter(input => /^mat\./.test(input.value))).toHaveLength(0);
    expect(params).toEqual(before);
    expect(change).not.toHaveBeenCalled();
    const width = document.querySelector<HTMLInputElement>('[data-parameter-key="width"] input');
    if (width) {
      width.value = String(Number(params.width) + 20);
      width.dispatchEvent(new Event("change"));
      expect(change).toHaveBeenCalledOnce();
      for (const key of Object.keys(before).filter(key => /Material(Id|Group)$/.test(key))) {
        expect(params[key]).toEqual(before[key]);
      }
    }
  }
);
