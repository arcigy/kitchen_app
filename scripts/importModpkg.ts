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

type ZipFiles = Map<string, Uint8Array>;

type LegacyManifest = {
  modules?: Array<{
    moduleType: string;
    displayName?: string;
    capabilities?: Record<string, boolean>;
  }>;
};

type PortableArchiveEnvelope = {
  packageRootDir?: string;
  packageName?: string;
  packageVersion?: string;
};

type PackageValidationIssue = {
  severity: "error" | "warning" | "advisory";
  category: "required_shape" | "projection_only" | "readiness";
  code: string;
  message: string;
  path?: string;
};

type ModulePackageManifest = {
  schemaVersion: "module-package.v1";
  packageName: string;
  packageVersion: string;
  displayName?: string;
  description?: string;
  engineCompatibility?: {
    app?: string;
    moduleContract?: string;
  };
  modules: Array<{
    moduleType: string;
    displayName: string;
  }>;
};

type ModulePackageModuleManifest = {
  moduleType: string;
  displayName: string;
  definition: {
    moduleType: string;
    source: string;
  };
  capabilities?: Record<string, boolean>;
  logic?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  commercial?: Record<string, unknown>;
  tags?: string[];
  status?: string;
  notes?: string[];
};

type ModulePackageExportMeta = {
  exportedAt: string;
  source: "registry_projection" | "builder_portable_export";
  scope: "single_module" | "local_module_set";
  generator?: {
    name: string;
    version: number;
  };
};

type ModulePackageSystemParameterCatalog = {
  schemaVersion: "module-system-parameters.v1";
  groups: Array<{
    key: string;
    label: string;
    description: string;
  }>;
  definitions: Array<{
    key: string;
    group: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  modules: Array<{
    moduleType: string;
    values: Record<string, string | number | boolean | string[] | null>;
  }>;
};

type PortablePackagePayload = {
  exportMeta: ModulePackageExportMeta;
  manifest: ModulePackageManifest;
  moduleEntries: ModulePackageModuleManifest[];
  systemParameters: ModulePackageSystemParameterCatalog;
};

type PortablePackageInspection = {
  archiveName: string;
  rootDir: string;
  packageKey: string;
  packageName: string;
  packageVersion: string;
  payload: PortablePackagePayload;
  moduleParameterSnapshots: Record<string, Record<string, unknown>>;
  issues: PackageValidationIssue[];
};

const repoRoot = process.cwd();
const packagePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const MODULE_PACKAGE_ARCHIVE_MANIFEST = "modpkg.archive.json";

if (!packagePath) {
  throw new Error('Usage: npm run import:modpkg -- "C:\\path\\to\\module.modpkg"');
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

function createAccessor(files: ZipFiles, prefix: string) {
  const normalizedPrefix = prefix.replace(/\\/g, "/");
  const zipPath = (relPath: string) => `${normalizedPrefix}${relPath}`.replace(/\\/g, "/");
  const readEntry = (relPath: string) => {
    const entry = files.get(zipPath(relPath));
    if (!entry) throw new Error(`Missing required package file: ${relPath}`);
    return entry;
  };
  const readTextEntry = (relPath: string) => toText(readEntry(relPath));
  const readJsonEntry = <T>(relPath: string): T => JSON.parse(readTextEntry(relPath)) as T;
  const hasEntry = (relPath: string) => files.has(zipPath(relPath));
  return { zipPath, readEntry, readTextEntry, readJsonEntry, hasEntry };
}

function quote(value: string) {
  return JSON.stringify(value);
}

function toPascalCase(value: string) {
  const parts = value
    .split(/[^a-zA-Z0-9]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const joined = parts.map((part) => part[0]?.toUpperCase() + part.slice(1)).join("");
  if (!joined) throw new Error(`Unable to derive PascalCase name from ${value}`);
  return joined;
}

function toCamelCase(value: string) {
  const pascal = toPascalCase(value);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

function writeFileIfNotDryRun(targetPath: string, data: Uint8Array | string) {
  if (dryRun) return;
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, typeof data === "string" ? data : Buffer.from(data));
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

function discoverNormalizer(typesPath: string, paramsTypeName: string) {
  if (!existsSync(typesPath)) return null;
  const source = readFileSync(typesPath, "utf8");
  const stem = paramsTypeName.replace(/Params$/, "");
  const moduleSpecific = `normalize${stem}Params`;
  if (new RegExp(`export\\s+function\\s+${moduleSpecific}\\b`).test(source)) return moduleSpecific;
  if (new RegExp(`export\\s+const\\s+${moduleSpecific}\\b`).test(source)) return moduleSpecific;
  if (/export\s+function\s+normalizeModuleParams\b/.test(source)) return "normalizeModuleParams";
  if (/export\s+const\s+normalizeModuleParams\b/.test(source)) return "normalizeModuleParams";
  return null;
}

function joinPosix(...parts: string[]) {
  return parts
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/g, "") : part.replace(/^\/+|\/+$/g, "")))
    .join("/");
}

function createIssue(
  severity: PackageValidationIssue["severity"],
  category: PackageValidationIssue["category"],
  code: string,
  message: string,
  path?: string
): PackageValidationIssue {
  return { severity, category, code, message, ...(path ? { path } : {}) };
}

function parseJsonText<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readRequiredArchiveJson<T>(files: ZipFiles, entryPath: string, label: string): T {
  const bytes = files.get(entryPath);
  if (!bytes) {
    throw new Error(`Missing required ${label}: ${entryPath}`);
  }
  return parseJsonText<T>(toText(bytes), label);
}

function readOptionalArchiveJson<T>(files: ZipFiles, entryPath: string): T | undefined {
  const bytes = files.get(entryPath);
  return bytes ? parseJsonText<T>(toText(bytes), entryPath) : undefined;
}

function reconstructModuleEntries(
  files: ZipFiles,
  rootDir: string,
  manifest: ModulePackageManifest
): ModulePackageModuleManifest[] {
  return manifest.modules.map((manifestModule) => {
    const moduleType = manifestModule.moduleType;
    const definition = readRequiredArchiveJson<{
      moduleType: string;
      displayName: string;
      definition: ModulePackageModuleManifest["definition"];
      capabilities?: ModulePackageModuleManifest["capabilities"];
      status?: ModulePackageModuleManifest["status"];
      tags?: string[];
      notes?: string[];
    }>(
      files,
      joinPosix(rootDir, "definitions", `${moduleType}.module.json`),
      `module definition for ${moduleType}`
    );

    const logic = readOptionalArchiveJson<ModulePackageModuleManifest["logic"]>(
      files,
      joinPosix(rootDir, "logic", `${moduleType}.logic.json`)
    );
    const assets = readOptionalArchiveJson<ModulePackageModuleManifest["assets"]>(
      files,
      joinPosix(rootDir, "assets", `${moduleType}.assets.json`)
    );
    const commercial = readOptionalArchiveJson<ModulePackageModuleManifest["commercial"]>(
      files,
      joinPosix(rootDir, "commercial", `${moduleType}.commercial.json`)
    );

    return {
      moduleType: definition.moduleType,
      displayName: definition.displayName,
      definition: definition.definition,
      capabilities: definition.capabilities,
      status: definition.status,
      tags: definition.tags,
      notes: definition.notes,
      ...(logic ? { logic } : {}),
      ...(assets ? { assets } : {}),
      ...(commercial ? { commercial } : {})
    };
  });
}

function reconstructSystemParameters(
  files: ZipFiles,
  rootDir: string,
  manifest: ModulePackageManifest
): ModulePackageSystemParameterCatalog {
  const schema = readOptionalArchiveJson<
    Pick<ModulePackageSystemParameterCatalog, "schemaVersion" | "groups" | "definitions">
  >(files, joinPosix(rootDir, "definitions", "system-parameters.schema.json"));

  if (!schema) {
    return {
      schemaVersion: "module-system-parameters.v1",
      groups: [],
      definitions: [],
      modules: []
    };
  }

  return {
    schemaVersion: schema.schemaVersion,
    groups: schema.groups,
    definitions: schema.definitions,
    modules: manifest.modules.flatMap((manifestModule) => {
      const values = readOptionalArchiveJson<{
        moduleType: string;
        values: Record<string, string | number | boolean | string[] | null>;
      }>(files, joinPosix(rootDir, "definitions", `${manifestModule.moduleType}.system-parameters.json`));
      return values ? [values] : [];
    })
  };
}

function reconstructModuleParameterSnapshots(
  files: ZipFiles,
  rootDir: string,
  manifest: ModulePackageManifest
): Record<string, Record<string, unknown>> {
  const snapshots: Record<string, Record<string, unknown>> = {};
  for (const manifestModule of manifest.modules) {
    const snapshot = readOptionalArchiveJson<Record<string, unknown>>(
      files,
      joinPosix(rootDir, "definitions", `${manifestModule.moduleType}.params.json`)
    );
    if (snapshot) {
      snapshots[manifestModule.moduleType] = snapshot;
    }
  }
  return snapshots;
}

function validatePortablePayload(payload: PortablePackagePayload): PackageValidationIssue[] {
  const issues: PackageValidationIssue[] = [];

  if (payload.manifest.schemaVersion !== "module-package.v1") {
    issues.push(
      createIssue(
        "error",
        "required_shape",
        "manifest.schemaVersion",
        "Manifest schemaVersion must be module-package.v1.",
        "manifest.schemaVersion"
      )
    );
  }

  if (!Array.isArray(payload.moduleEntries) || payload.moduleEntries.length === 0) {
    issues.push(
      createIssue(
        "error",
        "required_shape",
        "moduleEntries",
        "Payload must include at least one module entry.",
        "moduleEntries"
      )
    );
  }

  if (payload.systemParameters.schemaVersion !== "module-system-parameters.v1") {
    issues.push(
      createIssue(
        "error",
        "required_shape",
        "systemParameters.schemaVersion",
        "Payload must include systemParameters with schemaVersion module-system-parameters.v1.",
        "systemParameters.schemaVersion"
      )
    );
  }

  const requiredSystemKeys = new Set(
    payload.systemParameters.definitions.filter((definition) => definition.required).map((definition) => definition.key)
  );

  for (const moduleEntry of payload.moduleEntries) {
    const systemValues = payload.systemParameters.modules.find((entry) => entry.moduleType === moduleEntry.moduleType)?.values;
    if (!systemValues) {
      issues.push(
        createIssue(
          "error",
          "required_shape",
          "systemParameters.module_values",
          `Module ${moduleEntry.moduleType} is missing fixed system-parameter values.`,
          `systemParameters.modules.${moduleEntry.moduleType}`
        )
      );
      continue;
    }

    for (const key of requiredSystemKeys) {
      if (!(key in systemValues)) {
        issues.push(
          createIssue(
            "error",
            "required_shape",
            "systemParameters.module_value_missing",
            `Module ${moduleEntry.moduleType} is missing required system parameter ${key}.`,
            `systemParameters.modules.${moduleEntry.moduleType}.${key}`
          )
        );
      }
    }
  }

  return issues;
}

function inspectPortablePackage(files: ZipFiles, archiveName: string): PortablePackageInspection {
  const envelope = readRequiredArchiveJson<PortableArchiveEnvelope>(
    files,
    MODULE_PACKAGE_ARCHIVE_MANIFEST,
    "archive manifest"
  );
  const rootDir = envelope.packageRootDir?.replace(/\\/g, "/").replace(/\/+$/g, "") ?? "";
  if (!rootDir) {
    throw new Error("Portable package archive is missing packageRootDir.");
  }

  const payloadSnapshot = readOptionalArchiveJson<PortablePackagePayload>(
    files,
    joinPosix(rootDir, "package-export.payload.json")
  );

  let payload: PortablePackagePayload;
  if (payloadSnapshot) {
    payload = payloadSnapshot;
  } else {
    const manifest = readRequiredArchiveJson<ModulePackageManifest>(
      files,
      joinPosix(rootDir, "module.package.json"),
      "package manifest"
    );
    const exportMeta = readRequiredArchiveJson<ModulePackageExportMeta>(
      files,
      joinPosix(rootDir, "package-export.meta.json"),
      "package export metadata"
    );
    payload = {
      manifest,
      exportMeta,
      moduleEntries: reconstructModuleEntries(files, rootDir, manifest),
      systemParameters: reconstructSystemParameters(files, rootDir, manifest)
    };
  }

  return {
    archiveName,
    rootDir,
    packageKey: `${payload.manifest.packageName}@${payload.manifest.packageVersion}`,
    packageName: payload.manifest.packageName,
    packageVersion: payload.manifest.packageVersion,
    payload,
    moduleParameterSnapshots: reconstructModuleParameterSnapshots(files, rootDir, payload.manifest),
    issues: validatePortablePayload(payload)
  };
}

function generateCabinetTypes(installed: InstalledModule[]) {
  if (installed.length === 0) {
    return `export const MODULE_TYPES = [] as const;
export type ModuleType = string;

export type ModuleParams = {
  type: string;
} & Record<string, unknown>;

export function makeDefaultModuleParams(type: ModuleType): ModuleParams {
  throw new Error(\`No imported modules are registered: \${type}\`);
}

export function normalizeModuleParams(params: ModuleParams): ModuleParams {
  return params;
}

export function validateModule(_params: ModuleParams): string[] {
  return [];
}
`;
  }

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
  if (installed.length === 0) {
    return `import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import type { KitchenContext } from "../layout/kitchenContext";
import type { BOMResult } from "../layout/bom/bomTypes";

export type ModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type ModuleControlsArgs = {
  onChange: () => void | boolean;
  getWorktopThicknessMm: () => number;
  textInputCommitMode?: "immediate" | "explicit";
  commitBoundary?: HTMLElement | null;
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
  calculateBOM: (params: ModuleParams, ctx: KitchenContext) => BOMResult;
  capabilities: ModuleCapabilityFlags;
};

export const MODULE_DESCRIPTORS: readonly ModuleDescriptor[] = [] as const;

const moduleDescriptorMap = new Map<ModuleType, ModuleDescriptor>();

export function getModuleDescriptors(): readonly ModuleDescriptor[] {
  return MODULE_DESCRIPTORS;
}

export function getFirstModuleType(): ModuleType {
  throw new Error("No imported modules are registered.");
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

  const imports = installed
    .map(
      (mod) => `import type { ${mod.paramsTypeName} } from "./${mod.moduleFolder}/types";
import { ${mod.builderExportName} } from "./${mod.moduleFolder}/geometry";
import { ${mod.controlsExportName} } from "./${mod.moduleFolder}/controls";
import { calculateBOM as calculate${toPascalCase(mod.moduleType)}BOM } from "./${mod.moduleFolder}/calculation";`
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
    calculateBOM: (params, ctx) => calculate${toPascalCase(mod.moduleType)}BOM(params as ${mod.paramsTypeName}, ctx),
    capabilities: ${JSON.stringify(mod.capabilities, null, 6).replace(/\n/g, "\n    ")}
  }`
    )
    .join(",\n");

  return `import type { Group } from "three";
import type { ModuleParams, ModuleType } from "../model/cabinetTypes";
import { makeDefaultModuleParams } from "../model/cabinetTypes";
import type { KitchenContext } from "../layout/kitchenContext";
import type { BOMResult } from "../layout/bom/bomTypes";
${imports}

export type ModuleControlsApi = {
  syncFromParams: () => void;
  isAutoFitEnabled: () => boolean;
  highlightParamKeys: (keys: string[]) => void;
  clearHighlights: () => void;
};

export type ModuleControlsArgs = {
  onChange: () => void | boolean;
  getWorktopThicknessMm: () => number;
  textInputCommitMode?: "immediate" | "explicit";
  commitBoundary?: HTMLElement | null;
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
  calculateBOM: (params: ModuleParams, ctx: KitchenContext) => BOMResult;
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

function copySourceTree(files: ZipFiles, packagePrefix: string, sourcePrefix: string, targetDir: string) {
  if (!dryRun) rmSync(targetDir, { recursive: true, force: true });
  const fullPrefix = `${packagePrefix}${sourcePrefix}`.replace(/\\/g, "/");
  for (const entryName of files.keys()) {
    if (!entryName.startsWith(fullPrefix)) continue;
    const rel = entryName.slice(fullPrefix.length);
    if (!rel) continue;
    writeFileIfNotDryRun(path.join(targetDir, rel), files.get(entryName)!);
  }
}

function copySharedFileIfPresent(files: ZipFiles, packagePrefix: string, sourceRel: string) {
  const entry = files.get(`${packagePrefix}${sourceRel}`.replace(/\\/g, "/"));
  if (!entry) return;
  const appRel = sourceRel.replace(/^source\/src\//, "src/");
  writeFileIfNotDryRun(path.join(repoRoot, appRel), entry);
}

function unpackPortablePackage(files: ZipFiles, packageRootDir: string, targetDir: string) {
  if (!dryRun) rmSync(targetDir, { recursive: true, force: true });
  const normalizedRoot = packageRootDir.replace(/\\/g, "/").replace(/\/+$/g, "");
  for (const [entryName, entryBytes] of files.entries()) {
    if (entryName === "modpkg.archive.json") {
      writeFileIfNotDryRun(path.join(targetDir, "modpkg.archive.json"), entryBytes);
      continue;
    }
    const prefix = normalizedRoot ? `${normalizedRoot}/` : "";
    if (!entryName.startsWith(prefix)) continue;
    const rel = entryName.slice(prefix.length);
    if (!rel) continue;
    writeFileIfNotDryRun(path.join(targetDir, rel), entryBytes);
  }
}

function generatePortableTypesSource(args: {
  moduleType: string;
  paramsTypeName: string;
  defaultFactoryName: string;
  validatorName: string;
  normalizerName: string;
}) {
  const { moduleType, paramsTypeName, defaultFactoryName, validatorName, normalizerName } = args;
  return `import defaults from "./package/definitions/${moduleType}.defaults.json";
import { validateParams } from "./package/logic/${moduleType}.validation";
import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  makePortableDefaultParams,
  normalizePortableParams,
  validatePortableParams
} from "../runtime/portableTypes";

export type ${paramsTypeName} = {
  type: ${quote(moduleType)};
} & Record<string, PortableJsonValue>;

const MODULE_DEFAULTS = defaults as ${paramsTypeName};

export function ${defaultFactoryName}(): ${paramsTypeName} {
  return makePortableDefaultParams(MODULE_DEFAULTS, ${quote(moduleType)}) as ${paramsTypeName};
}

export function ${normalizerName}(params: ${paramsTypeName}): ${paramsTypeName} {
  return normalizePortableParams(MODULE_DEFAULTS, params, ${quote(moduleType)}) as ${paramsTypeName};
}

export function ${validatorName}(params: ${paramsTypeName}): string[] {
  return validatePortableParams(params as Record<string, unknown>, validateParams);
}
`;
}

function generatePortableGeometrySource(args: {
  moduleType: string;
  paramsTypeName: string;
  builderExportName: string;
  hasLiveState: boolean;
}) {
  const { moduleType, paramsTypeName, builderExportName, hasLiveState } = args;
  if (hasLiveState) {
    return `import type { Group } from "three";
import liveStateSnapshot from "./package/integration/current-live-state.json";
import materialsSnapshot from "./package/definitions/${moduleType}.materials.snapshot.json";
import { buildPortableLiveModuleGroup } from "../runtime/portableGeometry";
import type { ${paramsTypeName} } from "./types";

export function ${builderExportName}(params: ${paramsTypeName}): Group {
  return buildPortableLiveModuleGroup(
    params as Record<string, unknown>,
    liveStateSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[1],
    materialsSnapshot as Parameters<typeof buildPortableLiveModuleGroup>[2]
  );
}
`;
  }
  return `import type { Group } from "three";
import geometrySnapshot from "./package/definitions/${moduleType}.geometry.json";
import { buildPortableModuleGroup } from "../runtime/portableGeometry";
import type { ${paramsTypeName} } from "./types";

export function ${builderExportName}(params: ${paramsTypeName}): Group {
  return buildPortableModuleGroup(
    params as Record<string, unknown>,
    geometrySnapshot as Parameters<typeof buildPortableModuleGroup>[1]
  );
}
`;
}

function generatePortableControlsSource(args: {
  moduleType: string;
  paramsTypeName: string;
  controlsExportName: string;
  hasSystemParameters: boolean;
}) {
  const { moduleType, paramsTypeName, controlsExportName, hasSystemParameters } = args;
  const systemImports = hasSystemParameters
    ? `
import systemParameterCatalog from "./package/definitions/system-parameters.schema.json";
import systemParameterValues from "./package/definitions/${moduleType}.system-parameters.json";`
    : "";
  const systemArgs = hasSystemParameters
    ? `,
    systemCatalog: systemParameterCatalog as Parameters<typeof createPortableModuleControls>[0]["systemCatalog"],
    systemValues: systemParameterValues as Parameters<typeof createPortableModuleControls>[0]["systemValues"]`
    : "";
  return `import parameterCatalog from "./package/definitions/${moduleType}.parameter-catalog.json";
import materialsSnapshot from "./package/definitions/${moduleType}.materials.snapshot.json";${systemImports}
import type { ${paramsTypeName} } from "./types";
import {
  createPortableModuleControls,
  type PortableModuleControlsApi,
  type PortableModuleControlsArgs
} from "../runtime/portableControls";

export function ${controlsExportName}(
  container: HTMLElement,
  params: ${paramsTypeName},
  args: PortableModuleControlsArgs
): PortableModuleControlsApi {
  return createPortableModuleControls({
    container,
    params: params as Record<string, unknown>,
    catalog: parameterCatalog as Parameters<typeof createPortableModuleControls>[0]["catalog"],
    controlArgs: args,
    materialsSnapshot: materialsSnapshot as Parameters<typeof createPortableModuleControls>[0]["materialsSnapshot"]${systemArgs}
  });
}
`;
}

function generatePortableCalculationSource(args: {
  moduleType: string;
  paramsTypeName: string;
}) {
  const { moduleType, paramsTypeName } = args;
  return `import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import bomSnapshot from "./package/commercial/${moduleType}.bom.json";
import materialsSnapshot from "./package/definitions/${moduleType}.materials.snapshot.json";
import { buildPortableBomResult } from "../runtime/portableCalculation";
import type { ${paramsTypeName} } from "./types";

export function calculateBOM(params: ${paramsTypeName}, ctx: KitchenContext): BOMResult {
  return buildPortableBomResult({
    moduleType: ${quote(moduleType)},
    params: params as Record<string, unknown>,
    ctx,
    bom: bomSnapshot as Parameters<typeof buildPortableBomResult>[0]["bom"],
    materialsSnapshot: materialsSnapshot as Parameters<typeof buildPortableBomResult>[0]["materialsSnapshot"]
  });
}
`;
}

function regenerateModuleIndexFiles() {
  if (dryRun) return;
  const installed = readInstalledModules();
  writeFileSync(path.join(repoRoot, "src", "model", "cabinetTypes.ts"), generateCabinetTypes(installed));
  writeFileSync(path.join(repoRoot, "src", "modules", "registry.ts"), generateRegistry(installed));
}

function installLegacyPackage(files: ZipFiles, integrationPath: string) {
  const packagePrefix = integrationPath.slice(0, -"integration/local-module-integration.json".length);
  const { readJsonEntry, readTextEntry, hasEntry } = createAccessor(files, packagePrefix);
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
    ? readJsonEntry<LegacyManifest>("module.package.json")
    : null;
  const manifestModule = manifest?.modules?.find((entry) => entry.moduleType === integration.moduleType);
  const label = manifestModule?.displayName ?? integration.moduleType;
  const capabilities = manifestModule?.capabilities ?? {};

  const moduleSourcePrefix = `source/src/modules/${integration.moduleFolder}/`;
  const moduleEntries = [...files.keys()].filter((name) => name.startsWith(`${packagePrefix}${moduleSourcePrefix}`));
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

  copySourceTree(files, packagePrefix, moduleSourcePrefix, moduleDest);

  if (preservedTypesSource !== null) {
    writeFileIfNotDryRun(path.join(moduleDest, "types.ts"), preservedTypesSource);
  }
  if (preservedCalculationSource !== null) {
    writeFileIfNotDryRun(path.join(moduleDest, "calculation.ts"), preservedCalculationSource);
  }

  copySharedFileIfPresent(files, packagePrefix, "source/src/data/materials.ts");
  copySharedFileIfPresent(files, packagePrefix, "source/src/lib/materials/model.ts");
  copySharedFileIfPresent(files, packagePrefix, "source/src/lib/materials/rendering.ts");
  copySharedFileIfPresent(files, packagePrefix, "source/src/types/material.ts");

  const importRecord = {
    ...integration,
    label,
    capabilities,
    importedAt: new Date().toISOString(),
    importedFrom: path.basename(packagePath),
    importFormat: "legacy_source_bundle",
    preservedExistingTypes: preserveExistingTypes,
    preservedExistingCalculation: preserveExistingCalculation,
    installedFiles: moduleEntries
      .map((entryName) => entryName.slice(`${packagePrefix}${moduleSourcePrefix}`.length))
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
  regenerateModuleIndexFiles();

  const action = dryRun ? "Validated" : "Imported";
  console.log(`${action} ${integration.moduleType} -> src/modules/${integration.moduleFolder}`);
}

function installPortablePackage(files: ZipFiles) {
  const inspection = inspectPortablePackage(files, path.basename(packagePath));
  const blockingIssues = inspection.issues.filter((issue) => issue.severity === "error");
  if (blockingIssues.length > 0) {
    throw new Error(
      `Portable package validation failed:\n${blockingIssues
        .map((issue) => `- [${issue.code}] ${issue.message}${issue.path ? ` (${issue.path})` : ""}`)
        .join("\n")}`
    );
  }

  const packageRootDir = inspection.rootDir;
  const packageFiles = [...files.keys()]
    .filter((entryName) => entryName === MODULE_PACKAGE_ARCHIVE_MANIFEST || entryName.startsWith(`${packageRootDir}/`))
    .map((entryName) => (entryName === MODULE_PACKAGE_ARCHIVE_MANIFEST ? entryName : entryName.slice(`${packageRootDir}/`.length)))
    .filter(Boolean)
    .sort();

  const importRecords: Array<Record<string, unknown>> = [];

  for (const moduleEntry of inspection.payload.moduleEntries) {
    const moduleType = moduleEntry.moduleType;
    const moduleFolder = toCamelCase(moduleType);
    const moduleName = toPascalCase(moduleType);
    const paramsTypeName = `${moduleName}Params`;
    const builderExportName = `build${moduleName}`;
    const controlsExportName = `create${moduleName}Controls`;
    const defaultFactoryName = `makeDefault${moduleName}Params`;
    const validatorName = `validate${moduleName}`;
    const normalizerName = `normalize${moduleName}Params`;

    assertSafeSegment(moduleFolder, "moduleFolder");
    assertSafeSegment(builderExportName, "builderExportName");
    assertSafeSegment(controlsExportName, "controlsExportName");
    assertSafeSegment(defaultFactoryName, "defaultFactoryName");
    assertSafeSegment(validatorName, "validatorName");
    assertSafeSegment(paramsTypeName, "paramsTypeName");

    const moduleDest = path.join(repoRoot, "src", "modules", moduleFolder);
    const moduleImportPath = path.join(moduleDest, "module.import.json");
    const existingImportRecord =
      existsSync(moduleImportPath) && existsSync(moduleDest)
        ? (JSON.parse(readFileSync(moduleImportPath, "utf8")) as Record<string, unknown>)
        : null;
    const replaceExistingPortableModule = existingImportRecord?.importFormat === "portable_modpkg";

    if (replaceExistingPortableModule && !dryRun) {
      rmSync(moduleDest, { recursive: true, force: true });
    }

    const packageDest = path.join(moduleDest, "package");
    unpackPortablePackage(files, packageRootDir, packageDest);

    const hasSystemParameters =
      files.has(joinPosix(packageRootDir, "definitions", "system-parameters.schema.json")) &&
      files.has(joinPosix(packageRootDir, "definitions", `${moduleType}.system-parameters.json`));
    const hasLiveState = files.has(joinPosix(packageRootDir, "integration", "current-live-state.json"));

    const generatedCoreFiles = [
      {
        fileName: "types.ts",
        contents: generatePortableTypesSource({
          moduleType,
          paramsTypeName,
          defaultFactoryName,
          validatorName,
          normalizerName
        })
      },
      {
        fileName: "geometry.ts",
        contents: generatePortableGeometrySource({
          moduleType,
          paramsTypeName,
          builderExportName,
          hasLiveState
        })
      },
      {
        fileName: "controls.ts",
        contents: generatePortableControlsSource({
          moduleType,
          paramsTypeName,
          controlsExportName,
          hasSystemParameters
        })
      },
      {
        fileName: "calculation.ts",
        contents: generatePortableCalculationSource({
          moduleType,
          paramsTypeName
        })
      }
    ];

    const preservedCoreFiles: string[] = [];
    const createdCoreFiles: string[] = [];
    const overwrittenCoreFiles: string[] = [];

    for (const file of generatedCoreFiles) {
      const targetPath = path.join(moduleDest, file.fileName);
      if (existsSync(targetPath) && !replaceExistingPortableModule) {
        preservedCoreFiles.push(file.fileName);
        continue;
      }
      if (existsSync(targetPath)) {
        overwrittenCoreFiles.push(file.fileName);
      } else {
        createdCoreFiles.push(file.fileName);
      }
      writeFileIfNotDryRun(targetPath, file.contents);
    }

    const systemParameterValues =
      inspection.payload.systemParameters.modules.find((entry) => entry.moduleType === moduleType)?.values ?? null;

    const importRecord: IntegrationMeta & Record<string, unknown> = {
      schemaVersion: "local-module-integration.v1",
      packageName: inspection.packageName,
      packageVersion: inspection.packageVersion,
      moduleType,
      moduleFolder,
      paramsTypeName,
      builderExportName,
      controlsExportName,
      defaultFactoryName,
      validatorName,
      bomExportName: "calculateBOM",
      label: moduleEntry.displayName,
      capabilities: moduleEntry.capabilities ?? {},
      importedAt: new Date().toISOString(),
      importedFrom: path.basename(packagePath),
      importFormat: "portable_modpkg",
      packageRootDir,
      packageKey: inspection.packageKey,
      packageIssues: inspection.issues,
      moduleParameterSnapshot: inspection.moduleParameterSnapshots[moduleType] ?? null,
      systemParameterSchemaVersion: inspection.payload.systemParameters.schemaVersion,
      systemParameterValues,
      preservedCoreFiles,
      overwrittenCoreFiles,
      generatedCoreFiles: createdCoreFiles,
      portablePackageFiles: packageFiles,
      installedFiles: [...createdCoreFiles, ...overwrittenCoreFiles, ...packageFiles].sort()
    };

    writeFileIfNotDryRun(
      path.join(moduleDest, "module.import.json"),
      `${JSON.stringify(importRecord, null, 2)}\n`
    );
    importRecords.push(importRecord);

    const action = dryRun ? "Validated" : "Imported";
    const preservedText =
      preservedCoreFiles.length > 0 ? ` (preserved core files: ${preservedCoreFiles.join(", ")})` : "";
    console.log(`${action} ${moduleType} -> src/modules/${moduleFolder}${preservedText}`);
  }

  writeFileIfNotDryRun(
    path.join(repoRoot, "src", "modules", "import-summary.json"),
    `${JSON.stringify(
      {
        latest: importRecords.at(-1) ?? null,
        importedModules: importRecords
      },
      null,
      2
    )}\n`
  );
  regenerateModuleIndexFiles();

  if (inspection.issues.length > 0) {
    const warningCount = inspection.issues.filter((issue) => issue.severity !== "error").length;
    if (warningCount > 0) {
      console.log(`Imported with ${warningCount} non-blocking package issue(s). See module.import.json for details.`);
    }
  }
}

const files = readZip(path.resolve(packagePath));
const legacyIntegrationPath = [...files.keys()].find((name) => name.endsWith("integration/local-module-integration.json"));

if (legacyIntegrationPath) {
  installLegacyPackage(files, legacyIntegrationPath);
} else if (files.has("modpkg.archive.json")) {
  installPortablePackage(files);
} else {
  throw new Error("Unsupported package format. Expected legacy integration bundle or portable .modpkg archive.");
}

if (!dryRun) {
  console.log("Regenerated src/model/cabinetTypes.ts and src/modules/registry.ts");
}
