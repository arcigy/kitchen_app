import { readFile } from "node:fs/promises";
import { Box3, Object3D } from "three";
import { createSystemSeedClientCatalogRepository } from "../src/core/catalog/catalog-repository";
import { assertEnvironmentSchemaMatch, assertValidDatabaseSchema, getDatabaseUrl, normalizeAppEnvironment } from "../src/core/database/database-config";
import { closeSchemaPools } from "../src/core/database/postgres-client";
import { createPostgresModulePackageRepository } from "../src/core/module-package/module-package-postgres-repository";
import type { FurnQuoteModulePackage } from "../src/core/module-package/module-package-types";
import { buildModulePackageGeometryFromPackage } from "../src/core/module-package/runtime/module-runtime-adapter";
import { normalizeKitchenModulePackage } from "../src/layout/kitchenModuleContract";

type Axis = "x" | "y" | "z";
type DimensionIssue = {
  modulePackageId: string;
  moduleType: string;
  kind: "dimension" | "drawer-control" | "corner-metric" | "geometry-build";
  parameter?: string;
  expectedMm?: number;
  actualMm?: number;
  axis?: Axis;
  message: string;
};

const BOARD_GROUPS = new Set(["corpus", "body", "carcass", "front", "back", "shelf", "drawer_bottom", "plinth", "worktop"]);
const DRAWER_SYSTEM_CONTROL = /^(drawerSystem(?:Brand|Size|Sizes|Labels|Id|Code|Depth)|drawer\d+(?:System|Runner|Size|Brand|Code|Label)|runner(?:System|Type|Size)?|.*(?:merivobox|legrabox|tandembox).*)$/i;

function argument(name: string) {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  return direct?.slice(name.length + 1);
}

function defaults(modulePackage: FurnQuoteModulePackage) {
  return Object.fromEntries(modulePackage.parameters.parameters.map((parameter) => [parameter.key, parameter.defaultValue]));
}

function spanMm(bounds: Box3, axis: Axis) {
  return (bounds.max[axis] - bounds.min[axis]) * 1000;
}

function boardBounds(root: Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new Box3();
  let found = false;
  root.traverse((object) => {
    if (!(object as { isMesh?: boolean }).isMesh || !BOARD_GROUPS.has(String(object.userData.materialGroup ?? ""))) return;
    const meshBounds = new Box3().setFromObject(object);
    if (!meshBounds.isEmpty()) {
      bounds.union(meshBounds);
      found = true;
    }
  });
  return found ? bounds : null;
}

function isKitchenPackage(modulePackage: FurnQuoteModulePackage) {
  return modulePackage.module.tags?.includes("kitchen") || defaults(modulePackage).assemblyContext === "kitchen";
}

function isCorner(modulePackage: FurnQuoteModulePackage, values: Record<string, unknown>) {
  return values.isCorner === true || modulePackage.placement.requiresCorner === true || modulePackage.placement.allowedContexts.includes("kitchen_corner") ||
    modulePackage.kitchenContract?.topology === "corner-symmetric" || modulePackage.kitchenContract?.topology === "corner-asymmetric" ||
    String(values.variant ?? "").includes("corner");
}

function addDimensionIssue(rows: DimensionIssue[], modulePackage: FurnQuoteModulePackage, parameter: string, expectedMm: number, actualMm: number, axis: Axis) {
  if (Math.abs(expectedMm - actualMm) <= 1) return;
  rows.push({
    modulePackageId: modulePackage.module.modulePackageId,
    moduleType: modulePackage.module.moduleType,
    kind: "dimension",
    parameter,
    expectedMm,
    actualMm,
    axis,
    message: `Declared ${parameter}=${expectedMm} mm but real board envelope on ${axis.toUpperCase()} is ${actualMm.toFixed(1)} mm.`
  });
}

async function main() {
  const clientId = argument("--client") ?? "client_delfi";
  const packagesFile = argument("--packages-file");
  const normalize = process.argv.includes("--normalize");
  const appEnv = normalizeAppEnvironment(argument("--app-env") ?? process.env.APP_ENV ?? "dev", process.env.NODE_ENV);
  const schema = assertValidDatabaseSchema(argument("--schema") ?? process.env.DATABASE_SCHEMA ?? appEnv);
  assertEnvironmentSchemaMatch(appEnv, schema);
  const databaseUrl = packagesFile ? null : getDatabaseUrl();
  if (!packagesFile && !databaseUrl) throw new Error("DATABASE_URL is required unless --packages-file is supplied.");
  const repository = databaseUrl ? createPostgresModulePackageRepository({ connectionString: databaseUrl, schema }) : null;
  const sourcePackages = packagesFile
    ? JSON.parse(await readFile(packagesFile, "utf8")) as FurnQuoteModulePackage[]
    : await repository!.listPackages({ clientId, userId: "geometry_dimension_audit", role: "owner" });
  const packages = normalize ? sourcePackages.map((modulePackage) => normalizeKitchenModulePackage(modulePackage)) : sourcePackages;
  const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient(clientId);
  const rows: DimensionIssue[] = [];

  try {
    for (const modulePackage of packages.filter(isKitchenPackage)) {
      const values = defaults(modulePackage);
      for (const parameter of modulePackage.parameters.parameters) {
        if (DRAWER_SYSTEM_CONTROL.test(parameter.key) && parameter.uiVisibility !== "internal" && parameter.uiVisibility !== "technical") {
          rows.push({
            modulePackageId: modulePackage.module.modulePackageId,
            moduleType: modulePackage.module.moduleType,
            kind: "drawer-control",
            parameter: parameter.key,
            message: `Drawer system control "${parameter.key}" is user-visible and must be removed from the package UI.`
          });
        }
      }
      try {
        const root = buildModulePackageGeometryFromPackage({ modulePackage, catalog });
        const bounds = boardBounds(root);
        if (!bounds) throw new Error("No board mesh bounds were produced.");
        const width = values.width;
        const height = values.height;
        const depth = values.depth;
        const role = values.kitchenModuleRole;
        const physicalHeight = role === "low" && values.requiresWorktop === true && typeof values.heightCarcass === "number"
          ? values.heightCarcass
          : height;
        if (typeof physicalHeight === "number") addDimensionIssue(rows, modulePackage, role === "low" && physicalHeight !== height ? "heightCarcass" : "height", physicalHeight, spanMm(bounds, "y"), "y");
        if (isCorner(modulePackage, values)) {
          // Corner packages can use width for the outside leg and depth for
          // the wall-to-front arm. Their real arm measurement needs named
          // anchor planes, not a whole-module Box3; report it in a dedicated
          // corner audit instead of treating the L envelope as a rectangle.
          const corner = root.getObjectByName("__kitchen_corner_anchor");
          const xAnchor = root.getObjectByName("__kitchen_corner_x_anchor");
          const zAnchor = root.getObjectByName("__kitchen_corner_z_anchor");
          const anchorPlanes = corner && xAnchor && zAnchor
            ? {
                minX: Math.min(corner.position.x, xAnchor.position.x, zAnchor.position.x),
                maxX: Math.max(corner.position.x, xAnchor.position.x, zAnchor.position.x),
                minZ: Math.min(corner.position.z, xAnchor.position.z, zAnchor.position.z),
                maxZ: Math.max(corner.position.z, xAnchor.position.z, zAnchor.position.z)
              }
            : null;
          const outsideBoards: Array<{ name: string; boardName: unknown; minX: number; maxX: number; minZ: number; maxZ: number }> = [];
          if (anchorPlanes) {
            root.traverse((object) => {
              if (!(object as { isMesh?: boolean }).isMesh || !BOARD_GROUPS.has(String(object.userData.materialGroup ?? ""))) return;
              const part = new Box3().setFromObject(object);
              if (part.min.x < anchorPlanes.minX - 0.001 || part.max.x > anchorPlanes.maxX + 0.001 || part.min.z < anchorPlanes.minZ - 0.001 || part.max.z > anchorPlanes.maxZ + 0.001) {
                outsideBoards.push({ name: object.name, boardName: object.userData.boardName, minX: part.min.x * 1000, maxX: part.max.x * 1000, minZ: part.min.z * 1000, maxZ: part.max.z * 1000 });
              }
            });
            const anchorWidthMm = (anchorPlanes.maxX - anchorPlanes.minX) * 1000;
            const anchorDepthMm = (anchorPlanes.maxZ - anchorPlanes.minZ) * 1000;
            // A corner's declared reference planes define its actual external
            // envelope.  Unlike an L-shaped empty region, material may never
            // extend past them; that is the precise failure hidden by a plain
            // rectangular width/depth check.
            if (spanMm(bounds, "x") > anchorWidthMm + 1) {
              addDimensionIssue(rows, modulePackage, "cornerEnvelopeWidth", anchorWidthMm, spanMm(bounds, "x"), "x");
            }
            if (spanMm(bounds, "z") > anchorDepthMm + 1) {
              addDimensionIssue(rows, modulePackage, "cornerEnvelopeDepth", anchorDepthMm, spanMm(bounds, "z"), "z");
            }
          }
          rows.push({
            modulePackageId: modulePackage.module.modulePackageId,
            moduleType: modulePackage.module.moduleType,
            kind: "corner-metric",
            message: JSON.stringify({
              variant: values.variant ?? null,
              declaredWidthMm: values.width ?? null,
              declaredDepthMm: depth ?? null,
              boardEnvelopeMm: { x: spanMm(bounds, "x"), z: spanMm(bounds, "z") },
              anchorArmsMm: corner && xAnchor && zAnchor ? {
                x: Math.abs(corner.position.x - xAnchor.position.x) * 1000,
                z: Math.abs(corner.position.z - zAnchor.position.z) * 1000
              } : null,
              outsideBoards
            })
          });
        } else {
          if (typeof width === "number") addDimensionIssue(rows, modulePackage, "width", width, spanMm(bounds, "x"), "x");
          if (typeof depth === "number") addDimensionIssue(rows, modulePackage, "depth", depth, spanMm(bounds, "z"), "z");
        }
      } catch (error) {
        rows.push({
          modulePackageId: modulePackage.module.modulePackageId,
          moduleType: modulePackage.module.moduleType,
          kind: "geometry-build",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    console.log(JSON.stringify({ clientId, schema, checked: packages.length, issues: rows }, null, 2));
    if (rows.some((row) => row.kind === "dimension" || row.kind === "drawer-control" || row.kind === "geometry-build")) process.exitCode = 1;
  } finally {
    await closeSchemaPools();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
