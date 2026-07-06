import { Box3, Group, Vector3, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { buildModulePackageGeometry } from "../../core/module-package/runtime/module-runtime-adapter";
import { buildPinoSideCabinet, validatePinoSideCabinetConstruction, type PinoSideCabinetConstructionMetrics } from "./geometry";
import { createPinoSideCabinetPreviewCatalog } from "./previewCatalog";
import {
  createPinoSideCabinetLayout,
  getPinoSideCabinetApplianceOpening,
  getPinoSideCabinetChoiceList,
  getPinoSideCabinetDefinition,
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetProductChoicesForGroup,
  getPinoSideCabinetProductGroups,
  makeDefaultPinoSideCabinetParams,
  normalizePinoSideCabinetParams,
  validatePinoSideCabinetDefinitionRules
} from "./types";

function boundsMm(root: Object3D) {
  const box = new Box3().setFromObject(root);
  const size = new Vector3();
  box.getSize(size);
  return {
    width: Math.round(size.x * 1000),
    height: Math.round(size.y * 1000),
    depth: Math.round(size.z * 1000)
  };
}

function sortedInteriorGroupBounds(root: Object3D, prefix: string) {
  const matches: Array<{ name: string; bounds: Box3 }> = [];
  root.traverse((child) => {
    if (!(child instanceof Group) || !child.name.startsWith(prefix)) return;
    matches.push({ name: child.name, bounds: new Box3().setFromObject(child) });
  });
  return matches.sort((a, b) => a.bounds.min.y - b.bounds.min.y);
}

function testCatalog(): ClientCatalog {
  return createPinoSideCabinetPreviewCatalog();
}

describe("PINO/Nobilia side cabinet module", () => {
  it("keeps unique grouped product choices while exposing at least 30 catalog variants", () => {
    const definitions = getPinoSideCabinetDefinitions();
    const choices = getPinoSideCabinetChoiceList();
    const groups = getPinoSideCabinetProductGroups();
    const drawerChoices = getPinoSideCabinetProductChoicesForGroup("dish_storage_drawers");
    const totalCatalogVariants = definitions.reduce((sum, definition) => sum + definition.catalogRows.length, 0);
    const appliance = getPinoSideCabinetDefinition("pino_side_cabinet_gb_fb_page245");

    expect(choices.length).toBe(definitions.length);
    expect(new Set(choices.map((choice) => choice.definitionId)).size).toBe(choices.length);
    expect(new Set(choices.map((choice) => choice.groupId)).size).toBe(groups.length);
    expect(drawerChoices.every((choice) => choice.availableWidths.length <= 4)).toBe(true);
    expect(totalCatalogVariants).toBeGreaterThanOrEqual(30);
    expect(appliance.catalogRows[0]?.widthCm).toBeNull();
    expect(appliance.catalogRows[0]?.widthListedInCatalog).toBe(false);
    expect(appliance.frontStackTopDown.map((segment) => segment.componentId)).toContain("open_niche");
  });

  it("keeps every definition aligned with its group-level component rules", () => {
    for (const definition of getPinoSideCabinetDefinitions()) {
      expect(validatePinoSideCabinetDefinitionRules(definition), definition.definitionId).toEqual([]);
    }
  });

  it("normalizes width and keeps group-specific definition selection aligned", () => {
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "utility_side",
      definitionId: "pino_side_cabinet_s_gk_page243",
      width: 590,
      catalogKey: "S-45-GK",
      articleCode: "S45GK"
    });
    const layout = createPinoSideCabinetLayout(params);

    expect(params.groupId).toBe("utility_side");
    expect(params.width).toBe(600);
    expect(params.catalogKey).toBe("S-60-GK");
    expect(params.articleCode).toBe("S60GK");
    expect(layout.catalogRow?.priceGroupValues["5"]).toBe(1548);
  });

  it("keeps fronts above the plinth zone and interior placements inside the carcass", () => {
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "dish_storage",
      definitionId: "pino_side_cabinet_s_k_page243",
      width: 600
    });
    const layout = createPinoSideCabinetLayout(params);
    const issues = validatePinoSideCabinetConstruction(params);

    expect(layout.frontSegments.at(-1)?.yBottomMm ?? 0).toBeGreaterThanOrEqual(params.plinthHeight + params.frontGap);
    expect(issues).toEqual([]);
  });

  it("keeps every side-cabinet catalog variant inside the same construction rules", () => {
    const catalog = testCatalog();
    const definitions = getPinoSideCabinetDefinitions();

    for (const definition of definitions) {
      for (const row of definition.catalogRows) {
        const params = normalizePinoSideCabinetParams({
          ...makeDefaultPinoSideCabinetParams(),
          groupId: definition.productGroupId,
          definitionId: definition.definitionId,
          width: row.widthMm,
          catalogKey: row.catalogKey,
          articleCode: row.articleCode
        });
        const issues = validatePinoSideCabinetConstruction(params);
        const built = buildPinoSideCabinet(params, catalog);
        const placements = Array.isArray(built.userData.interiorPlacements) ? built.userData.interiorPlacements : [];
        const builtIssues = Array.isArray(built.userData.constructionIssues) ? built.userData.constructionIssues : [];
        const constructionMetrics = built.userData.constructionMetrics as PinoSideCabinetConstructionMetrics | undefined;
        const shelfPlacements = placements
          .filter((placement) => ["adjustable_shelf", "fixed_shelf", "wire_shelf"].includes(String(placement.componentId)))
          .sort((a, b) => Number(a.yBottomMm) - Number(b.yBottomMm));
        const movingPlacements = placements
          .filter((placement) => ["drawer", "pullout"].includes(String(placement.componentId)))
          .sort((a, b) => Number(a.yBottomMm) - Number(b.yBottomMm));
        const mainVolumePlacements = placements
          .filter((placement) => ["adjustable_shelf", "fixed_shelf", "wire_shelf", "drawer", "pullout"].includes(String(placement.componentId)) && String(placement.collisionLane) === "main_volume")
          .sort((a, b) => Number(a.yBottomMm) - Number(b.yBottomMm));
        const pulloutHosts = placements.filter((placement) => String(placement.componentId) === "pullout");
        const nestedPulloutItems = placements.filter((placement) => String(placement.collisionLane) === "nested_pullout");

        expect(issues, `${definition.definitionId} ${row.catalogKey}`).toEqual([]);
        expect(builtIssues, `${definition.definitionId} ${row.catalogKey} built geometry`).toEqual([]);
        expect(built.userData.isConstructionValid, `${definition.definitionId} ${row.catalogKey}`).toBe(true);
        expect(Number(built.userData.taggedPartCount), `${definition.definitionId} ${row.catalogKey} tagged geometry`).toBeGreaterThan(5);
        expect(layoutFor(params).frontSegments.at(-1)?.yBottomMm ?? 0, `${definition.definitionId} ${row.catalogKey}`).toBeGreaterThanOrEqual(
          params.plinthHeight + params.frontGap
        );
        expect(Number(constructionMetrics?.frontBottomClearanceMm ?? 0), `${definition.definitionId} ${row.catalogKey} front clearance`).toBeGreaterThanOrEqual(
          params.plinthHeight + params.frontGap - 2
        );
        expect(Number(constructionMetrics?.plinthFrontSetbackMm ?? 0), `${definition.definitionId} ${row.catalogKey} plinth setback`).toBeGreaterThanOrEqual(36);
        expect(Number(constructionMetrics?.maxCarcassJointGapMm ?? 999), `${definition.definitionId} ${row.catalogKey} carcass joint gap`).toBeLessThanOrEqual(1.6);
        expect(Number(constructionMetrics?.frontSideRevealLeftMm ?? -1), `${definition.definitionId} ${row.catalogKey} left reveal`).toBeGreaterThanOrEqual(
          params.sideGap - 1
        );
        expect(Number(constructionMetrics?.frontSideRevealRightMm ?? -1), `${definition.definitionId} ${row.catalogKey} right reveal`).toBeGreaterThanOrEqual(
          params.sideGap - 1
        );
        if (constructionMetrics?.frontSideRevealLeftMm !== null && constructionMetrics?.frontSideRevealLeftMm !== undefined) {
          expect(Number(constructionMetrics.frontSideRevealLeftMm), `${definition.definitionId} ${row.catalogKey} left reveal exact`).toBeLessThanOrEqual(
            params.sideGap + 1
          );
        }
        if (constructionMetrics?.frontSideRevealRightMm !== null && constructionMetrics?.frontSideRevealRightMm !== undefined) {
          expect(Number(constructionMetrics.frontSideRevealRightMm), `${definition.definitionId} ${row.catalogKey} right reveal exact`).toBeLessThanOrEqual(
            params.sideGap + 1
          );
        }
        if (constructionMetrics?.minFrontCenterGapMm !== null && constructionMetrics?.minFrontCenterGapMm !== undefined) {
          expect(Number(constructionMetrics.minFrontCenterGapMm), `${definition.definitionId} ${row.catalogKey} min front center gap`).toBeGreaterThanOrEqual(
            params.frontGap - 1
          );
        }
        if (constructionMetrics?.maxFrontCenterGapMm !== null && constructionMetrics?.maxFrontCenterGapMm !== undefined) {
          expect(Number(constructionMetrics.maxFrontCenterGapMm), `${definition.definitionId} ${row.catalogKey} max front center gap`).toBeLessThanOrEqual(
            params.frontGap + 1
          );
        }
        expect(Number(constructionMetrics?.unsupportedShelfCount ?? 0), `${definition.definitionId} ${row.catalogKey} unsupported shelves`).toBe(0);
        expect(Number(constructionMetrics?.supportedShelfCount ?? 0), `${definition.definitionId} ${row.catalogKey} supported shelf count`).toBe(
          shelfPlacements.length
        );
        expect(Number(constructionMetrics?.unsupportedMovingBodyCount ?? 0), `${definition.definitionId} ${row.catalogKey} unsupported moving bodies`).toBe(0);
        expect(Number(constructionMetrics?.supportedMovingBodyCount ?? 0), `${definition.definitionId} ${row.catalogKey} supported moving bodies`).toBe(
          movingPlacements.length
        );
        expect(Number(constructionMetrics?.movingRunnerCount ?? 0), `${definition.definitionId} ${row.catalogKey} runner count`).toBeGreaterThanOrEqual(
          movingPlacements.length * 2
        );
        expect(Number(constructionMetrics?.shelfSupportCount ?? 0), `${definition.definitionId} ${row.catalogKey} support hardware count`).toBeGreaterThanOrEqual(
          shelfPlacements.length * 4
        );
        if (shelfPlacements.length > 1 && constructionMetrics?.minMainVolumeGapMm !== null && constructionMetrics?.minMainVolumeGapMm !== undefined) {
          expect(Number(constructionMetrics.minMainVolumeGapMm), `${definition.definitionId} ${row.catalogKey} min vertical gap`).toBeGreaterThanOrEqual(11.5);
        }

        for (const placement of shelfPlacements) {
          expect(Number(placement.yBottomMm), `${definition.definitionId} ${row.catalogKey} ${placement.componentId}`).toBeGreaterThanOrEqual(
            params.plinthHeight + params.boardThickness
          );
          expect(Number(placement.zBackMm), `${definition.definitionId} ${row.catalogKey} ${placement.componentId} depth back`).toBeGreaterThanOrEqual(
            -params.depth * 0.5 + params.backThickness - 2
          );
          expect(Number(placement.zFrontMm), `${definition.definitionId} ${row.catalogKey} ${placement.componentId} depth front`).toBeLessThanOrEqual(
            params.depth * 0.5 - params.frontThicknessMm + 2
          );
        }
        for (let index = 1; index < mainVolumePlacements.length; index += 1) {
          expect(
            Number(mainVolumePlacements[index]!.yBottomMm),
            `${definition.definitionId} ${row.catalogKey} main-volume overlap ${index}`
          ).toBeGreaterThanOrEqual(Number(mainVolumePlacements[index - 1]!.yTopMm) - 0.5);
        }
        for (const nestedItem of nestedPulloutItems) {
          expect(
            pulloutHosts.some(
              (host) => Number(nestedItem.yBottomMm) >= Number(host.yBottomMm) - 0.5 && Number(nestedItem.yTopMm) <= Number(host.yTopMm) + 0.5
            ),
            `${definition.definitionId} ${row.catalogKey} nested item host`
          ).toBe(true);
        }
      }
    }
  });

  it("builds visible 3D geometry, adds drawer construction and supports opened state", () => {
    const catalog = testCatalog();
    const closed = buildPinoSideCabinet(
      normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: "dish_storage_drawers",
        definitionId: "pino_side_cabinet_ss2a_k_page243",
        width: 600
      }),
      catalog
    );
    const opened = buildPinoSideCabinet(
      normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: "dish_storage_drawers",
        definitionId: "pino_side_cabinet_ss2a_k_page243",
        width: 600,
        opened: true
      }),
      catalog
    );
    const sizeClosed = boundsMm(closed);
    const sizeOpened = boundsMm(opened);
    const drawerPart = opened.getObjectByName("pino_side_cabinet_front_4_1_pullout_box_bottom");
    const drawerFrontPart = opened.getObjectByName("pino_side_cabinet_front_4_1_pullout_box_front");

    expect(sizeClosed.width).toBeGreaterThanOrEqual(590);
    expect(sizeClosed.height).toBe(2195);
    expect(sizeClosed.depth).toBeGreaterThanOrEqual(560);
    expect(sizeOpened.depth).toBeGreaterThan(sizeClosed.depth);
    expect(drawerPart).toBeTruthy();
    expect(drawerFrontPart).toBeTruthy();
    expect(opened.userData.opened).toBe(true);
    expect(opened.userData.isConstructionValid).toBe(true);
    expect(Number(opened.userData.constructionMetrics?.frontBottomClearanceMm ?? 0)).toBeGreaterThanOrEqual(110);
    expect(Number(opened.userData.constructionMetrics?.unsupportedShelfCount ?? 0)).toBe(0);
    expect(Number(opened.userData.constructionMetrics?.openedFrontProjectionMm ?? 0)).toBeGreaterThan(28);
    expect(Number(opened.userData.constructionMetrics?.unsupportedMovingBodyCount ?? 0)).toBe(0);
  });

  it("anchors interior drawers and pullouts into resolved vertical and depth bands", () => {
    const catalog = testCatalog();
    const built = buildPinoSideCabinet(
      normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: "pantry_pullout",
        definitionId: "pino_side_cabinet_sa_sk_page244",
        width: 600
      }),
      catalog
    );
    const pulloutPlacements = (built.userData.interiorPlacements as Array<Record<string, number | string>>)
      .filter((placement) => placement.componentId === "pullout")
      .sort((a, b) => Number(a.yBottomMm) - Number(b.yBottomMm));
    const drawerPlacements = (built.userData.interiorPlacements as Array<Record<string, number | string>>)
      .filter((placement) => placement.componentId === "drawer")
      .sort((a, b) => Number(a.yBottomMm) - Number(b.yBottomMm));
    const pulloutGroups = sortedInteriorGroupBounds(built, "pino_side_cabinet_inner_pullout_");
    const drawerGroups = sortedInteriorGroupBounds(built, "pino_side_cabinet_inner_drawer_");

    expect(pulloutGroups).toHaveLength(pulloutPlacements.length);
    expect(drawerGroups).toHaveLength(drawerPlacements.length);

    pulloutGroups.forEach((group, index) => {
      const placement = pulloutPlacements[index]!;
      const centerZ = (group.bounds.min.z + group.bounds.max.z) * 500;
      expect(group.bounds.min.y * 1000, `${group.name} minY`).toBeGreaterThanOrEqual(Number(placement.yBottomMm) + 2);
      expect(group.bounds.min.y * 1000, `${group.name} minY exact`).toBeLessThanOrEqual(Number(placement.yBottomMm) + 10);
      expect(group.bounds.max.y * 1000, `${group.name} maxY`).toBeLessThanOrEqual(Number(placement.yTopMm) - 6);
      expect(group.bounds.min.z * 1000, `${group.name} minZ`).toBeGreaterThanOrEqual(Number(placement.zBackMm) - 1);
      expect(group.bounds.max.z * 1000, `${group.name} maxZ`).toBeLessThanOrEqual(Number(placement.zFrontMm) + 1);
      expect(centerZ, `${group.name} centerZ`).toBeCloseTo(Number(placement.zCenterMm), 0);
    });

    drawerGroups.forEach((group, index) => {
      const placement = drawerPlacements[index]!;
      const centerZ = (group.bounds.min.z + group.bounds.max.z) * 500;
      expect(group.bounds.min.y * 1000, `${group.name} minY`).toBeGreaterThanOrEqual(Number(placement.yBottomMm) + 2);
      expect(group.bounds.min.y * 1000, `${group.name} minY exact`).toBeLessThanOrEqual(Number(placement.yBottomMm) + 10);
      expect(group.bounds.max.y * 1000, `${group.name} maxY`).toBeLessThanOrEqual(Number(placement.yTopMm) - 6);
      expect(group.bounds.min.z * 1000, `${group.name} minZ`).toBeGreaterThanOrEqual(Number(placement.zBackMm) - 1);
      expect(group.bounds.max.z * 1000, `${group.name} maxZ`).toBeLessThanOrEqual(Number(placement.zFrontMm) + 1);
      expect(centerZ, `${group.name} centerZ`).toBeCloseTo(Number(placement.zCenterMm), 0);
    });
  });

  it("keeps opened flap and swing fronts moving outward from the carcass", () => {
    const catalog = testCatalog();
    const closed = buildPinoSideCabinet(
      normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: "utility_side",
        definitionId: "pino_side_cabinet_s_gk_page243",
        width: 600,
        opened: false
      }),
      catalog
    );
    const opened = buildPinoSideCabinet(
      normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: "utility_side",
        definitionId: "pino_side_cabinet_s_gk_page243",
        width: 600,
        opened: true
      }),
      catalog
    );
    const closedFlap = new Box3().setFromObject(closed.getObjectByName("pino_side_cabinet_front_1_1_flap_door")!);
    const openedFlap = new Box3().setFromObject(opened.getObjectByName("pino_side_cabinet_front_1_1_flap_door")!);
    const closedSwing = new Box3().setFromObject(closed.getObjectByName("pino_side_cabinet_front_2_1_swing_door")!);
    const openedSwing = new Box3().setFromObject(opened.getObjectByName("pino_side_cabinet_front_2_1_swing_door")!);

    expect(openedFlap.max.z).toBeGreaterThan(closedFlap.max.z);
    expect(openedSwing.max.z).toBeGreaterThan(closedSwing.max.z);
  });

  it("exposes appliance-opening metadata only for appliance-side products", () => {
    const applianceParams = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });
    const utilityParams = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "utility_side",
      definitionId: "pino_side_cabinet_s_gk_page243",
      width: 600
    });

    expect(getPinoSideCabinetApplianceOpening(applianceParams)).toMatchObject({
      widthMm: expect.any(Number),
      heightMm: expect.any(Number),
      depthMm: expect.any(Number)
    });
    expect(getPinoSideCabinetApplianceOpening(utilityParams)).toBeNull();
  });

  it("renders an inserted appliance preview inside the appliance niche", () => {
    const catalog = testCatalog();
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600,
      applianceInstalled: true,
      applianceCategory: "oven_tall",
      applianceWidthMm: 540,
      applianceHeightMm: 540,
      applianceDepthMm: 450
    });
    const built = buildPinoSideCabinet(params, catalog);
    const applianceBody = built.getObjectByName("pino_side_cabinet_appliance_oven_tall_body");
    const applianceGlass = built.getObjectByName("pino_side_cabinet_appliance_oven_tall_glass");

    expect(applianceBody).toBeTruthy();
    expect(applianceGlass).toBeTruthy();
    expect(built.userData.applianceInstalled).toBe(true);
    expect(built.userData.applianceModuleType).toBe("fwm_oven_tower_module");
    expect(built.userData.applianceOpening).toMatchObject({
      widthMm: expect.any(Number),
      heightMm: expect.any(Number),
      depthMm: expect.any(Number)
    });
  });

  it("switches visible handle geometry when the catalog handle is an integrated profile", () => {
    const catalog = testCatalog();
    const built = buildPinoSideCabinet(
      normalizePinoSideCabinetParams({
        ...makeDefaultPinoSideCabinetParams(),
        groupId: "utility_side",
        definitionId: "pino_side_cabinet_s_gk_page243",
        width: 600,
        handleComponentId: "cmp.pino.handle.894",
        handlePlacementCode: "009"
      }),
      catalog
    );
    const handle = built.getObjectByName("pino_side_cabinet_front_2_1_swing_door_handle");
    const handleBounds = new Box3().setFromObject(handle!);

    expect(handle).toBeTruthy();
    expect((built.userData.selectedHandle as { code?: string } | undefined)?.code).toBe("894");
    expect((handleBounds.max.x - handleBounds.min.x) * 1000).toBeGreaterThan(250);
    expect((handleBounds.max.y - handleBounds.min.y) * 1000).toBeLessThan(40);
  });

  it("is available through the trusted runtime package adapter", () => {
    const group = buildModulePackageGeometry({
      runtimeBuilderKey: "pinoSideCabinet.v1",
      parameters: makeDefaultPinoSideCabinetParams(),
      catalog: testCatalog()
    });

    expect(group.userData.runtimeBuilderKey).toBe("pinoSideCabinet.v1");
    expect(group.userData.catalogKey).toBe("S-45-BK");
  });
});

function layoutFor(params: ReturnType<typeof normalizePinoSideCabinetParams>) {
  return createPinoSideCabinetLayout(params);
}
