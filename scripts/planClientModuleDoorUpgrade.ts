import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { FurnQuoteModulePackage } from "../src/core/module-package/module-package-types";
import type { ClientModuleDefinition } from "../src/core/catalog/catalog-types";
import { systemModulePackageTemplates } from "../src/system/module-packages";
import { planClientModuleDoorUpgrade } from "../src/core/catalog/client-module-door-upgrade";
import { validateFurnQuoteModulePackage } from "../src/core/module-package/module-package-validation";

// Read-only, suitable for piping a scoped snapshot on its existing host. Never prints package payloads.
const values = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = argument.match(/^--(client-id|schema|package-ids|updated-at)=(.+)$/);
  if (!match) throw new Error("Expected --client-id, --schema, --package-ids and --updated-at; this command cannot write data.");
  if (values.has(match[1]!)) throw new Error("Duplicate argument.");
  values.set(match[1]!, match[2]!);
}
const clientId = values.get("client-id");
const schema = values.get("schema");
const updatedAt = values.get("updated-at");
const modulePackageIds = values.get("package-ids")?.split(",").map(value => value.trim());
if (!clientId || !["dev", "prod"].includes(schema ?? "") || !updatedAt || !Number.isFinite(Date.parse(updatedAt)) || !modulePackageIds?.length) throw new Error("Explicit client, schema, exact package IDs and a valid fixed timestamp are required.");
const raw = readFileSync(0, "utf8");
if (Buffer.byteLength(raw) > 16 * 1024 * 1024) throw new Error("Scoped snapshot exceeds the size limit.");
const input = JSON.parse(raw) as { clientId: string; schema: string; packages: FurnQuoteModulePackage[]; catalogModules: ClientModuleDefinition[] };
if (input.clientId !== clientId || input.schema !== schema || !Array.isArray(input.packages) || !Array.isArray(input.catalogModules)) throw new Error("Snapshot does not match the requested tenant and environment.");
if (input.packages.length > 100 || input.catalogModules.length > 200) throw new Error("Snapshot exceeds the targeted upgrade scope.");
const plan = planClientModuleDoorUpgrade({ packages: input.packages, catalogModules: input.catalogModules, sourcePackages: systemModulePackageTemplates, modulePackageIds, updatedAt });
for (const change of plan.changes) {
  try {
    validateFurnQuoteModulePackage(change.nextPackage);
  } catch {
    throw new Error(`Upgraded package is invalid: ${change.modulePackageId}`);
  }
}
const summary = {
  dryRun: true, executable: false, clientId, schema, updatedAt,
  catalogBeforeHash: createHash("sha256").update(JSON.stringify(input.catalogModules)).digest("hex"),
  catalogAfterHash: createHash("sha256").update(JSON.stringify(plan.catalogModules)).digest("hex"),
  changes: plan.changes.map(({ nextPackage, ...change }) => ({
    ...change,
    hasDoorsDefault: nextPackage.parameters.parameters.find(parameter => parameter.key === "hasDoors")?.defaultValue,
    presetCount: nextPackage.parameterPresets?.presets.length ?? 0,
  })),
};
console.log(JSON.stringify({ ...summary, planHash: createHash("sha256").update(JSON.stringify(summary)).digest("hex") }, null, 2));
