import { systemModulePackageTemplates } from "../../system/module-packages";

const LEGACY_WALL_CORNER_90_ID = "wall_corner_90";
const WALL_CABINET_RUNTIME_TYPE = "fwm_catalog_wall_cabinet";
const WALL_CABINET_RUNTIME_BUILDER = "fwm_catalog_wall_cabinet.v1";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isLegacyWallCorner90(value: unknown): boolean {
  const packageRecord = record(value);
  const module = record(packageRecord?.module);
  const geometry = record(packageRecord?.geometry);
  return module?.modulePackageId === LEGACY_WALL_CORNER_90_ID &&
    module.moduleType === LEGACY_WALL_CORNER_90_ID &&
    geometry?.mode === "trusted-runtime" &&
    geometry.runtimeBuilderKey === WALL_CABINET_RUNTIME_BUILDER;
}

export function normalizedSystemTemplateForStoredIdentity(args: {
  modulePackageId: string;
  moduleType: string;
  source: string | null | undefined;
}) {
  if (
    args.source !== "system-template" ||
    args.modulePackageId !== LEGACY_WALL_CORNER_90_ID ||
    args.moduleType !== LEGACY_WALL_CORNER_90_ID
  ) return null;
  const current = systemModulePackageTemplates.find((candidate) =>
    candidate.module.modulePackageId === LEGACY_WALL_CORNER_90_ID &&
    candidate.module.moduleType === WALL_CABINET_RUNTIME_TYPE
  );
  return current ? structuredClone(current) : null;
}

/**
 * Keeps one historical system-template row readable while the authoritative
 * template uses the runtime builder's actual module type. Custom packages are
 * never rewritten or normalized here.
 */
export function normalizePersistedSystemModulePackage(args: {
  package: unknown;
  source: string | null | undefined;
}): unknown {
  if (args.source !== "system-template" || !isLegacyWallCorner90(args.package)) return args.package;
  return normalizedSystemTemplateForStoredIdentity({
    modulePackageId: LEGACY_WALL_CORNER_90_ID,
    moduleType: LEGACY_WALL_CORNER_90_ID,
    source: args.source
  }) ?? args.package;
}
