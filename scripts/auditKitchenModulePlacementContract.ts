import { createHmac } from "node:crypto";
import { createSystemSeedClientCatalogRepository } from "../src/core/catalog/catalog-repository";
import type { FurnQuoteModulePackage } from "../src/core/module-package/module-package-types";
import { buildModulePackageGeometryFromPackage } from "../src/core/module-package/runtime/module-runtime-adapter";
import { systemModulePackageTemplates } from "../src/system/module-packages";
import {
  auditKitchenModuleGeometryContract,
  auditKitchenModulePlacementContract,
  type KitchenModulePlacementContractIssue
} from "../src/layout/kitchenModulePlacementContract";

type AuditRow = KitchenModulePlacementContractIssue & {
  modulePackageId: string;
  moduleType: string;
};

function argValue(name: string): string | null {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function makeDevSessionCookie(clientId: string) {
  const userId = argValue("--user") ?? (clientId === "client_delfi" ? "user_delfi_ales_rohrich" : `audit_${clientId}`);
  const session = {
    version: 1,
    userId,
    clientId,
    role: "owner",
    displayName: clientId,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const sig = createHmac("sha256", process.env.ARCIGY_DEV_SESSION_SECRET ?? "arcigy-dev-session-secret-change-me")
    .update(payload)
    .digest("base64url");
  return `arcigy_client_session=${payload}.${sig}`;
}

async function loadPackages(): Promise<{ packages: FurnQuoteModulePackage[]; clientId: string }> {
  const clientId = argValue("--client") ?? "client_delfi";
  const url = argValue("--url");
  if (!url || hasArg("--system")) return { packages: [...systemModulePackageTemplates], clientId };

  const response = await fetch(`${url.replace(/\/$/, "")}/api/modules`, {
    headers: { cookie: makeDevSessionCookie(clientId) }
  });
  if (!response.ok) throw new Error(`Failed to read ${url}/api/modules: ${response.status} ${response.statusText}`);
  const body = await response.json() as { modules?: FurnQuoteModulePackage[] };
  return { packages: body.modules ?? [], clientId };
}

function filterPackages(packages: FurnQuoteModulePackage[]) {
  const ids = new Set((argValue("--module-ids") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  const types = new Set((argValue("--module-types") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  if (ids.size === 0 && types.size === 0) return packages;
  return packages.filter((modulePackage) =>
    ids.has(modulePackage.module.modulePackageId) || types.has(modulePackage.module.moduleType)
  );
}

function formatIssue(issue: AuditRow) {
  const path = issue.path ? ` (${issue.path})` : "";
  return `${issue.severity.toUpperCase()} ${issue.modulePackageId} ${issue.code}: ${issue.message}${path}`;
}

async function main() {
  const loaded = await loadPackages();
  const packages = filterPackages(loaded.packages);
  const clientId = loaded.clientId;
  const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient(clientId);
  const rows: AuditRow[] = [];

  for (const modulePackage of packages) {
    const placementIssues = auditKitchenModulePlacementContract(modulePackage);
    rows.push(...placementIssues.map((issue) => ({
      ...issue,
      modulePackageId: modulePackage.module.modulePackageId,
      moduleType: modulePackage.module.moduleType
    })));

    try {
      const geometry = buildModulePackageGeometryFromPackage({ modulePackage, catalog });
      const geometryIssues = auditKitchenModuleGeometryContract(modulePackage, geometry);
      rows.push(...geometryIssues.map((issue) => ({
        ...issue,
        modulePackageId: modulePackage.module.modulePackageId,
        moduleType: modulePackage.module.moduleType
      })));
    } catch (error) {
      rows.push({
        severity: "error",
        code: "geometry.build",
        message: error instanceof Error ? error.message : String(error),
        modulePackageId: modulePackage.module.modulePackageId,
        moduleType: modulePackage.module.moduleType
      });
    }
  }

  const errors = rows.filter((issue) => issue.severity === "error");
  const warnings = rows.filter((issue) => issue.severity === "warning");
  if (hasArg("--json")) {
    console.log(JSON.stringify({ checked: packages.length, errors, warnings }, null, 2));
  } else if (rows.length === 0) {
    console.log(`Kitchen module placement contract OK (${packages.length} packages checked).`);
  } else {
    for (const issue of rows) console.log(formatIssue(issue));
    console.log(`Checked ${packages.length} packages: ${errors.length} errors, ${warnings.length} warnings.`);
  }

  if (errors.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
