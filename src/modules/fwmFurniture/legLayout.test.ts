import { describe, expect, it } from "vitest";
import { Box3, Mesh, Vector3 } from "three";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { buildFwmFurniture } from "./geometry";
import { calculateFwmFurnitureBOM } from "./calculation";
import { getManufacturingAssembly } from "./manufacturingParts";
import { makeDefaultFwmFurnitureParams } from "./types";
import { explicitLegCounts } from "./legLayout";

const catalog = { clientId: "leg-test", ...createSystemCatalogSeed() };
describe("leg counts drive geometry and BOM", () => {
  for (const front of [2, 3]) for (const variant of ["base", "corner_90", "corner_chamfered", "1d"]) {
    it(`5 legs / ${front} front, ${variant}`, () => {
      const params = { ...makeDefaultFwmFurnitureParams(variant === "base" ? "fwm_catalog_base_doors" : "fwm_catalog_base_corner"),
        ...(variant === "base" ? {} : { variant }), legCountTotal: 5, legCountFront: front, plinthFrontEnabled: true };
      const root = buildFwmFurniture(params, catalog);
      const legs: Mesh[] = [];
      root.traverse(mesh => { if (mesh instanceof Mesh && mesh.userData.componentType === "leg") legs.push(mesh); });
      expect(legs).toHaveLength(5);
      expect(legs.filter(leg => leg.userData.hardwareRole === "front")).toHaveLength(front);
      const centers = legs.map(leg => new Box3().setFromObject(leg).getCenter(new Vector3()));
      for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) expect(centers[i]!.distanceTo(centers[j]!)).toBeGreaterThan(0.04);
      const assembly = getManufacturingAssembly(params, catalog);
      expect(assembly.hardware.leg).toBe(5);
      expect(assembly.clips).toEqual({ front, side: 0, total: front });
      const result = calculateFwmFurnitureBOM({ ...params, quantity: 2 }, makeDefaultKitchenContext(catalog), catalog);
      const quantity = (category: string) => result.quoteBom.items.filter(item => item.category === category).reduce((sum, item) => sum + item.quantity, 0);
      expect(quantity("leg")).toBe(10);
      expect(quantity("leg_plate")).toBe(10);
      expect(quantity("plinth_clip")).toBe(front * 2);
      expect(quantity("assembly_pack")).toBe(2);
      expect(quantity("hinge_plate")).toBe(quantity("hinge"));
    });
  }

  it("counts each side assembly once and keeps the old layout until counts are explicitly set", () => {
    const params = { ...makeDefaultFwmFurnitureParams("fwm_catalog_base_doors"), plinthLeftEnabled: true, plinthRightEnabled: true };
    expect(explicitLegCounts(params)).toBeNull();
    const old = getManufacturingAssembly(params, catalog);
    expect(old.hardware.leg).toBe(4);
    expect(old.clips).toEqual({ front: 2, side: 4, total: 6 });
    expect(getManufacturingAssembly({ ...params, legCountTotal: 5, legCountFront: 3 }, catalog).clips)
      .toEqual({ front: 3, side: 4, total: 7 });
    expect(getManufacturingAssembly({ ...params, legCountTotal: 0, legCountFront: 0 }, catalog).hardware.leg).toBe(0);
  });

  it.each([[5, 6], [-1, 0], [5.5, 2], [5, -1], [5, NaN]])("rejects invalid total/front counts %s / %s", (total, front) => {
    expect(() => explicitLegCounts({ legCountTotal: total, legCountFront: front })).toThrow();
  });

  it("adds two independent hanging brackets to an upper cabinet, with an editable count", () => {
    const params = makeDefaultFwmFurnitureParams("fwm_catalog_wall_cabinet");
    const quantity = (count?: number) => calculateFwmFurnitureBOM({ ...params, ...(count === undefined ? {} : { hangingBracketCount: count }) }, makeDefaultKitchenContext(catalog), catalog)
      .quoteBom.items.find(item => item.category === "hanging_bracket")?.quantity ?? 0;
    expect(quantity()).toBe(2); expect(quantity(3)).toBe(3); expect(quantity(0)).toBe(0);
  });
});
