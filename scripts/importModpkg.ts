import path from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { strFromU8, unzipSync } from "fflate";

type IntegrationMeta = {
  schemaVersion: "local-module-integration.v1";
  packageName: string;
  packageVersion: string;
  moduleType: string;
  moduleFolder: string;
  paramsTypeName: string;
  builderExportName: string;
  controlsExportName: string;
  defaultFactoryName: string;
  validatorName: string;
  bomExportName?: string;
};

type InstalledModule = IntegrationMeta & {
  label: string;
  normalizerExportName: string | null;
  normalizerAliasName: string;
  capabilities: Record<string, boolean>;
};

const repoRoot = process.cwd();
const packagePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!packagePath) {
  throw new Error('Usage: npm run import:modpkg -- "C:\\path\\to\\module.modpkg.zip"');
}

function assertSafeSegment(value: string, label: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
    throw new Error(`${label} must be a simple folder/name segment: ${value}`);
  }
}

function toText(bytes: Uint8Array) {
  return strFromU8(bytes);
}

function readZip(packageFile: string) {
  const bytes = new Uint8Array(readFileSync(packageFile));
  const raw = unzipSync(bytes);
  const files = new Map<string, Uint8Array>();
  for (const [name, value] of Object.entries(raw)) {
    const normalized = name.replace(/\\/g, "/");
    if (!normalized.endsWith("/")) files.set(normalized, value);
  }
  return files;
}

const files = readZip(path.resolve(packagePath));
const integrationPath = [...files.keys()].find((name) => name.endsWith("integration/local-module-integration.json"));
if (!integrationPath) {
  throw new Error("Missing integration/local-module-integration.json in module package.");
}

const packageRoot = integrationPath.slice(0, -"integration/local-module-integration.json".length);
const zipPath = (relPath: string) => `${packageRoot}${relPath}`.replace(/\\/g, "/");
const readEntry = (relPath: string) => {
  const entry = files.get(zipPath(relPath));
  if (!entry) throw new Error(`Missing required package file: ${relPath}`);
  return entry;
};
const readTextEntry = (relPath: string) => toText(readEntry(relPath));
const readJsonEntry = <T>(relPath: string): T => JSON.parse(readTextEntry(relPath)) as T;
const hasEntry = (relPath: string) => files.has(zipPath(relPath));

const integration = readJsonEntry<IntegrationMeta>("integration/local-module-integration.json");
if (integration.schemaVersion !== "local-module-integration.v1") {
  throw new Error(`Unsupported integration schema: ${integration.schemaVersion}`);
}

assertSafeSegment(integration.moduleFolder, "moduleFolder");
assertSafeSegment(integration.builderExportName, "builderExportName");
assertSafeSegment(integration.controlsExportName, "controlsExportName");
assertSafeSegment(integration.defaultFactoryName, "defaultFactoryName");
assertSafeSegment(integration.validatorName, "validatorName");
assertSafeSegment(integration.paramsTypeName, "paramsTypeName");

const manifest = hasEntry("module.package.json")
  ? readJsonEntry<{ modules?: Array<{ moduleType: string; displayName?: string; capabilities?: Record<string, boolean> }> }>(
      "module.package.json"
    )
  : null;
const manifestModule = manifest?.modules?.find((entry) => entry.moduleType === integration.moduleType);
const label = manifestModule?.displayName ?? integration.moduleType;
const capabilities = manifestModule?.capabilities ?? {};

const moduleSourcePrefix = `source/src/modules/${integration.moduleFolder}/`;
const moduleEntries = [...files.keys()].filter((name) => name.startsWith(zipPath(moduleSourcePrefix)));
if (moduleEntries.length === 0) {
  throw new Error(`Missing module source folder in package: ${moduleSourcePrefix}`);
}

const moduleDest = path.join(repoRoot, "src", "modules", integration.moduleFolder);
const existingTypesPath = path.join(moduleDest, "types.ts");
const existingCalculationPath = path.join(moduleDest, "calculation.ts");
const preserveExistingTypes =
  existsSync(existingTypesPath) &&
  hasEntry(`${moduleSourcePrefix}types.ts`) &&
  readTextEntry(`${moduleSourcePrefix}types.ts`).includes('../../model/cabinetTypes');
const preserveExistingCalculation =
  existsSync(existingCalculationPath) &&
  hasEntry(`${moduleSourcePrefix}calculation.ts`) &&
  readTextEntry(`${moduleSourcePrefix}calculation.ts`).includes("../../domain/");
const preservedTypesSource = preserveExistingTypes ? readFileSync(existingTypesPath, "utf8") : null;
const preservedCalculationSource = preserveExistingCalculation ? readFileSync(existingCalculationPath, "utf8") : null;

function writeFileIfNotDryRun(targetPath: string, data: Uint8Array | string) {
  if (dryRun) return;
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, typeof data === "string" ? data : Buffer.from(data));
}

function copySourceTree(sourcePrefix: string, targetDir: string) {
  if (!dryRun) rmSync(targetDir, { recursive: true, force: true });
  for (const entryName of files.keys()) {
    const fullPrefix = zipPath(sourcePrefix);
    if (!entryName.startsWith(fullPrefix)) continue;
    const rel = entryName.slice(fullPrefix.length);
    if (!rel) continue;
    writeFileIfNotDryRun(path.join(targetDir, rel), readEntry(`${sourcePrefix}${rel}`));
  }
  if (preservedTypesSource !== null) {
    writeFileIfNotDryRun(path.join(targetDir, "types.ts"), preservedTypesSource);
  }
  if (preservedCalculationSource !== null) {
    writeFileIfNotDryRun(path.join(targetDir, "calculation.ts"), preservedCalculationSource);
  }
}

function copySharedFileIfPresent(sourceRel: string) {
  if (!hasEntry(sourceRel)) return;
  const appRel = sourceRel.replace(/^source\/src\//, "src/");
  writeFileIfNotDryRun(path.join(repoRoot, appRel), readEntry(sourceRel));
}

function discoverNormalizer(typesPath: string, paramsTypeName: string) {
  const source = readFileSync(typesPath, "utf8");
  const stem = paramsTypeName.replace(/Params$/, "");
  const moduleSpecific = `normalize${stem}Params`;
  if (new RegExp(`export\\s+function\\s+${moduleSpecific}\\b`).test(source)) return moduleSpecific;
  if (new RegExp(`export\\s+const\\s+${moduleSpecific}\\b`).test(source)) return moduleSpecific;
  if (/export\s+function\s+normalizeModuleParams\b/.test(source)) return "normalizeModuleParams";
  if (/export\s+const\s+normalizeModuleParams\b/.test(source)) return "normalizeModuleParams";
  return null;
}

function readInstalledModules(): InstalledModule[] {
  const modulesRoot = path.join(repoRoot, "src", "modules");
  const dirs = readdirSync(modulesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  return dirs
    .map((dir) => {
      const metaPath = path.join(modulesRoot, dir.name, "module.import.json");
      if (!existsSync(metaPath)) return null;
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as IntegrationMeta & {
        label?: string;
        capabilities?: Record<string, boolean>;
      };
      const normalizerExportName = discoverNormalizer(
        path.join(modulesRoot, dir.name, "types.ts"),
        meta.paramsTypeName
      );
      return {
        ...meta,
        label: meta.label ?? meta.moduleType,
        capabilities: meta.capabilities ?? {},
        normalizerExportName,
        normalizerAliasName: `normalize${meta.paramsTypeName.replace(/Params$/, "")}ImportedParams`
      };
    })
    .filter((entry): entry is InstalledModule => !!entry)
    .sort((a, b) => a.moduleType.localeCompare(b.moduleType));
}

function quote(value: string) {
  return JSON.stringify(value);
}

function generateCabinetTypes(installed: InstalledModule[]) {
  const reExports = installed.map((mod) => `export * from "../modules/${mod.moduleFolder}/types";`).join("\n");
  const imports = installed
    .map((mod) => {
      const normalizerImport = mod.normalizerExportName
        ? `,\n  ${mod.normalizerExportName} as ${mod.normalizerAliasName}`
        : "";
      return `import type { ${mod.paramsTypeName} } from "../modules/${mod.moduleFolder}/types";
import {
  ${mod.defaultFactoryName},
  ${mod.validatorName}${normalizerImport}
} from "../modules/${mod.moduleFolder}/types";`;
    })
    .join("\n\n");

  const moduleTypes = installed.map((mod) => quote(mod.moduleType)).join(", ");
  const paramsUnion = installed.map((mod) => mod.paramsTypeName).join(" | ");
  const defaultCases = installed
    .map((mod) => `    case ${quote(mod.moduleType)}:\n      return ${mod.defaultFactoryName}();`)
    .join("\n");
  const normalizeCases = installed
    .map((mod) => {
      const body = mod.normalizerExportName
        ? `return ${mod.normalizerAliasName}(params as ${mod.paramsTypeName}) as ModuleParams;`
        : "return params;";
      return `    case ${quote(mod.moduleType)}:\n      ${body}`;
    })
    .join("\n");
  const validateCases = installed
    .map(
      (mod) =>
        `    case ${quote(mod.moduleType)}:\n      return ${mod.validatorName}(params as ${mod.paramsTypeName});`
    )
    .join("\n");

  return `${reExports}

${imports}

export const MODULE_TYPES = [${moduleTypes}] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export type ModuleParams = ${paramsUnion};

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  switch (type) {
${defaultCases}
  }
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  switch (params.type) {
${normalizeCases}
  }
  return params;
}

export function validateModule(params: ModuleParams): string[] {
  switch (params.type) {
${validateCases}
  }
  return [\`Unsupported imported module type: \${(params as { type?: string }).type ?? "unknown"}\`];
}
`;
}

function generateRegistry(installed: InstalledModule[]) {
  const imports = installed
    .map(
      (mod) => `import type { ${mod.paramsTypeName} } from "./${mod.moduleFolder}/types";
import { ${mod.builderExportName} } from "./${mod.moduleFolder}/geometry";
import { ${mod.controlsExportName} } from "./${mod.moduleFolder}/controls";`
    )
    .join("\n");

  const descriptors = installed
    .map(
      (mod) => `  {
    type: ${quote(mod.moduleType)},
    folder: ${quote(mod.moduleFolder)},
    label: ${quote(mod.label)},
    packageName: ${quote(mod.packageName)},
    packageVersion: ${quote(mod.packageVersion)},
    defaultParams: () => makeDefaultModuleParams(${quote(mod.moduleType)}),
    build: (params) => ${mod.builderExportName}(params as ${mod.paramsTypeName}),
    createControls: (container, params, args) => ${mod.controlsExportName}(container, params as ${mod.paramsTypeName}, args),
    capabilities: ${JSON.stringify(mod.capabilities, null, 6).replace(/\n/g, "\n    ")}
  }`
    )
    .join(",\n");

  return `import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
${imports}

export type ModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type ModuleControlsArgs = {
  onChange: () => void;
  getWorktopThicknessMm: () => number;
};

export type ModuleCapabilityFlags = {
  hasWorktop?: boolean;
  supportsKitchenContextDimensions?: boolean;
  supportsKitchenContextMaterials?: boolean;
  supportsWallMountedVariant?: boolean;
};

export type ModuleDescriptor = {
  type: ModuleType;
  folder: string;
  label: string;
  packageName: string;
  packageVersion: string;
  defaultParams: () => ModuleParams;
  build: (params: ModuleParams) => Group;
  createControls: (
    container: HTMLElement,
    params: ModuleParams,
    args: ModuleControlsArgs
  ) => ModuleControlsApi;
  capabilities: ModuleCapabilityFlags;
};

export const MODULE_DESCRIPTORS: readonly ModuleDescriptor[] = [
${descriptors}
] as const;

const moduleDescriptorMap = new Map<ModuleType, ModuleDescriptor>(
  MODULE_DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor])
);

export function getModuleDescriptors(): readonly ModuleDescriptor[] {
  return MODULE_DESCRIPTORS;
}

export function getFirstModuleType(): ModuleType {
  const first = MODULE_DESCRIPTORS[0];
  if (!first) throw new Error("No imported modules are registered.");
  return first.type;
}

export function getModuleDescriptor(type: ModuleType): ModuleDescriptor | undefined {
  return moduleDescriptorMap.get(type);
}

export function getModuleDescriptorOrThrow(type: ModuleType): ModuleDescriptor {
  const descriptor = getModuleDescriptor(type);
  if (!descriptor) throw new Error(\`Unknown imported module type: \${type}\`);
  return descriptor;
}
`;
}

copySourceTree(moduleSourcePrefix, moduleDest);

copySharedFileIfPresent("source/src/data/materials.ts");
copySharedFileIfPresent("source/src/lib/materials/model.ts");
copySharedFileIfPresent("source/src/lib/materials/rendering.ts");
copySharedFileIfPresent("source/src/types/material.ts");

const importRecord = {
  ...integration,
  label,
  capabilities,
  importedAt: new Date().toISOString(),
  importedFrom: path.basename(packagePath),
  preservedExistingTypes: preserveExistingTypes,
  preservedExistingCalculation: preserveExistingCalculation,
  installedFiles: moduleEntries
    .map((entryName) => entryName.slice(zipPath(moduleSourcePrefix).length))
    .filter(Boolean)
    .sort()
};
writeFileIfNotDryRun(
  path.join(moduleDest, "module.import.json"),
  `${JSON.stringify(importRecord, null, 2)}\n`
);
writeFileIfNotDryRun(
  path.join(repoRoot, "src", "modules", "import-summary.json"),
  `${JSON.stringify({ latest: importRecord }, null, 2)}\n`
);

if (!dryRun) {
  const installed = readInstalledModules();
  writeFileSync(path.join(repoRoot, "src", "model", "cabinetTypes.ts"), generateCabinetTypes(installed));
  writeFileSync(path.join(repoRoot, "src", "modules", "registry.ts"), generateRegistry(installed));
}

const action = dryRun ? "Validated" : "Imported";
console.log(`${action} ${integration.moduleType} -> src/modules/${integration.moduleFolder}`);
if (!dryRun) {
  console.log("Regenerated src/model/cabinetTypes.ts and src/modules/registry.ts");
}
