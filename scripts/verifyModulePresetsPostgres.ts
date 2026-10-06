import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { ClientContext } from "../src/core/client/client-context";
import { createPostgresClientCatalogRepository } from "../src/core/catalog/catalog-postgres-repository";
import { createCatalogModuleDefinitionFromPackage } from "../src/core/module-package/module-package-catalog";
import { createPostgresModulePackageRepository } from "../src/core/module-package/module-package-postgres-repository";
import { createModulePackageService } from "../src/core/module-package/module-package-service";
import { computeModulePackageHash } from "../src/core/module-package/module-package-file";
import { ModulePackageRevisionConflictError } from "../src/core/module-package/module-package-write-lock";
import { systemModulePackageTemplates } from "../src/system/module-packages";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { RESTORE_DRILL_SCHEMA } from "./postgresRestoreDrillConfig";

export type PresetRestoreEvidence = { context: ClientContext; modulePackageId: string; packageHash: string; presetId: string };

/** Runs only in the existing disposable database restore drill. */
export async function verifyModulePresetsPostgres(connectionString: string): Promise<PresetRestoreEvidence> {
  const url = new URL(connectionString);
  assert.equal(url.hostname, "127.0.0.1");
  assert.match(url.pathname, /^\/arcigy_restore_drill_/);
  const repository = createPostgresModulePackageRepository({ connectionString, schema: RESTORE_DRILL_SCHEMA });
  const context: ClientContext = { clientId: "preset_drill_company", userId: "preset_drill_owner", role: "owner" };
  const catalogRepository = createPostgresClientCatalogRepository({ connectionString, schema: RESTORE_DRILL_SCHEMA });
  const service = createModulePackageService({ context, packageRepository: repository, catalogRepository });
  const template = structuredClone(systemModulePackageTemplates.find(pkg => pkg.module.moduleType === "fwm_catalog_base_drawers")!);
  const initial = await repository.savePackage(context, template, { expectedPackageHash: null });
  await assert.rejects(repository.savePackage(context, template, { expectedPackageHash: null }), ModulePackageRevisionConflictError);
  const catalog = await catalogRepository.ensureCatalogExists(context);
  const commercialModule = { ...createCatalogModuleDefinitionFromPackage(initial, { catalog }),
    id: "company_drawer_identity", name: "Company drawer label", description: "Company description", enabled: false,
    defaultWidth: 742, pricingRef: Object.keys(catalog.priceList.prices)[0], tags: ["company-tag"] };
  catalog.modules = [commercialModule];
  await catalogRepository.saveCatalog(context, catalog);
  const assertCatalogPreserved = async (hash: string) => {
    const actual = await catalogRepository.getCatalog(context);
    assert.deepEqual(actual, { ...catalog, modules: [{ ...commercialModule, packageHash: hash }] });
  };
  const persistedState = () => withSchemaClient(connectionString, RESTORE_DRILL_SCHEMA, async client => {
    const result = await client.query<{ package: unknown; package_updated: string; catalog: unknown; catalog_updated: string }>(`
      SELECT p.package,p.updated_at::text AS package_updated,c.catalog,c.db_updated_at::text AS catalog_updated
      FROM arcigy_module_packages p JOIN arcigy_client_catalogs c USING(client_id)
      WHERE p.client_id=$1 AND p.module_package_id=$2`, [context.clientId, template.module.modulePackageId]);
    return result.rows[0]!;
  });
  const request: Parameters<typeof service.createParameterPreset>[0] = { modulePackageId: template.module.modulePackageId,
    name: "Synthetic durability preset", note: "Isolated PostgreSQL drill", parameters: { drawerCount: 2, hasDoors: false },
    laborRate: { amount: 0, currency: "EUR" }, expectedPackageHash: initial.integrity.packageHash, operationId: "postgres_drill_create" };
  const repeated = await Promise.all(Array.from({ length: 8 }, () => service.createParameterPreset(request)));
  assert.equal(new Set(repeated.map(result => result.preset.presetId)).size, 1);
  const created = repeated[0]!;
  await assertCatalogPreserved(created.modulePackage.integrity.packageHash!);
  const committedState = await persistedState();
  await service.createParameterPreset(request);
  assert.deepEqual(await persistedState(), committedState, "Exact creation retry performs no writes");
  assert.equal(created.preset.parameterValues.hasDoors, false);
  assert.equal(created.preset.laborRate?.amount, 0);
  const stored = await repository.getPackage(context, request.modulePackageId);
  assert.equal(stored!.parameterPresets!.presets.filter(p => p.creationOperation?.operationId === request.operationId).length, 1);
  await assert.rejects(service.createParameterPreset({ ...request, parameters: { drawerCount: 3 } }), ModulePackageRevisionConflictError);
  await assert.rejects(repository.savePackage(context, template), ModulePackageRevisionConflictError);
  await assert.rejects(repository.savePackage(context, template, { expectedPackageHash: stored!.integrity.packageHash }), ModulePackageRevisionConflictError);
  assert.equal(await repository.getPackage({ ...context, clientId: "preset_drill_other" }, request.modulePackageId), null);

  const raceRevision = stored!.integrity.packageHash;
  const race = await Promise.allSettled(["a", "b"].map(suffix => service.createParameterPreset({ ...request,
    name: `Concurrent ${suffix}`, operationId: `postgres_drill_race_${suffix}`, expectedPackageHash: raceRevision })));
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
  const failed = race.find(result => result.status === "rejected");
  assert(failed?.status === "rejected" && failed.reason instanceof ModulePackageRevisionConflictError);
  // Force the second half of the transaction to fail after the package UPDATE.
  await withSchemaClient(connectionString, RESTORE_DRILL_SCHEMA, async client => {
    await client.query(`CREATE FUNCTION reject_preset_catalog_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.client_id='preset_drill_company' THEN RAISE EXCEPTION 'synthetic catalog failure'; END IF; RETURN NEW; END $$`);
    await client.query(`CREATE TRIGGER reject_preset_catalog BEFORE UPDATE ON arcigy_client_catalogs
      FOR EACH ROW EXECUTE FUNCTION reject_preset_catalog_update()`);
  });
  const beforeFailure = await persistedState();
  const rolledBackRequest = { ...request, name: "Must roll back", operationId: "postgres_drill_rollback",
    expectedPackageHash: (await repository.getPackage(context, request.modulePackageId))!.integrity.packageHash };
  await assert.rejects(service.createParameterPreset(rolledBackRequest), /synthetic catalog failure/);
  assert.deepEqual(await persistedState(), beforeFailure, "Catalog failure rolls back preset creation");
  const rolledBackLabor = { modulePackageId: request.modulePackageId, presetId: created.preset.presetId,
    expectedPackageHash: rolledBackRequest.expectedPackageHash!, laborRate: { amount: 72, currency: "EUR" as const }, operationId: "postgres_drill_rollback_labor" };
  await assert.rejects(service.updatePresetLabor(rolledBackLabor), /synthetic catalog failure/);
  assert.deepEqual(await persistedState(), beforeFailure, "Catalog failure rolls back labor edit");
  await withSchemaClient(connectionString, RESTORE_DRILL_SCHEMA, async client => {
    await client.query("DROP TRIGGER reject_preset_catalog ON arcigy_client_catalogs");
    await client.query("DROP FUNCTION reject_preset_catalog_update()");
  });
  const recovered = await service.createParameterPreset(rolledBackRequest);
  assert.equal(recovered.preset.creationOperation?.operationId, rolledBackRequest.operationId);
  await assertCatalogPreserved(recovered.modulePackage.integrity.packageHash!);

  // Different packages share one catalog. Both references must survive.
  const otherTemplate = structuredClone(systemModulePackageTemplates.find(pkg => pkg.module.moduleType === "fwm_catalog_base_doors")!);
  const otherInitial = await repository.savePackage(context, otherTemplate, { expectedPackageHash: null });
  const otherRequest = { ...request, modulePackageId: otherTemplate.module.modulePackageId, name: "Other package preset",
    expectedPackageHash: otherInitial.integrity.packageHash, operationId: "postgres_drill_other_package", parameters: {} };
  const twoPackages = await Promise.all([
    service.createParameterPreset({ ...request, name: "First package parallel", operationId: "postgres_drill_parallel_first", expectedPackageHash: recovered.modulePackage.integrity.packageHash }),
    service.createParameterPreset(otherRequest)
  ]);
  const parallelCatalog = await catalogRepository.getCatalog(context);
  for (const result of twoPackages) assert(parallelCatalog.modules.some(module =>
    module.modulePackageId === result.modulePackage.module.modulePackageId && module.packageHash === result.modulePackage.integrity.packageHash));
  assert.deepEqual(parallelCatalog.modules[0], { ...commercialModule, packageHash: twoPackages[0]!.modulePackage.integrity.packageHash });
  const { modules: _beforeModules, ...beforeCommercial } = catalog;
  const { modules: _afterModules, ...afterCommercial } = parallelCatalog;
  assert.deepEqual(afterCommercial, beforeCommercial);

  const beforeRefresh = await repository.getPackage(context, request.modulePackageId);
  const env = { ...process.env }; delete env.DATABASE_URL; delete env.KITCHEN_PROJECT_DATABASE_URL;
  for (const selection of [request.modulePackageId, template.module.moduleType, "all"]) {
    execFileSync(process.execPath, ["--import", "tsx", "scripts/assignClientModules.ts", "--storage", "postgres",
      "--database-url", connectionString, "--schema", RESTORE_DRILL_SCHEMA, "--app-env", "test", "--clientId", context.clientId,
      "--modules", selection, "--refresh-packages", "--write"], { env, stdio: "pipe", timeout: 60_000 });
    const current = await repository.getPackage(context, request.modulePackageId);
    for (const preset of beforeRefresh!.parameterPresets!.presets) assert.deepEqual(current!.parameterPresets!.presets.find(p => p.presetId === preset.presetId), preset);
  }
  const imported = await service.importPackage({ package: template });
  assert.deepEqual(imported.modulePackage.parameterPresets!.presets.find(p => p.presetId === created.preset.presetId), created.preset);
  const labor = { modulePackageId: request.modulePackageId, presetId: created.preset.presetId,
    expectedPackageHash: imported.modulePackage.integrity.packageHash!, laborRate: null, operationId: "postgres_drill_labor" };
  const laborWrites = await Promise.all(Array.from({ length: 8 }, () => service.updatePresetLabor(labor)));
  assert.equal(new Set(laborWrites.map(result => result.modulePackage.integrity.packageHash)).size, 1);
  assert.equal(laborWrites[0]!.preset.laborRate, null);
  const laborState = await persistedState();
  await service.updatePresetLabor(labor);
  assert.deepEqual(await persistedState(), laborState, "Exact labor retry performs no writes");
  await assert.rejects(createModulePackageService({ context: { ...context, role: "viewer" }, packageRepository: repository, catalogRepository }).createParameterPreset(request), /Viewer/);
  await assert.rejects(repository.mutatePreset!({ ...context, role: "viewer" }, request.modulePackageId, () => { throw new Error("must not prepare"); }), /Viewer/);

  // An old system row must retain its user presets during normalization and CAS.
  const legacy = structuredClone(systemModulePackageTemplates.find(pkg => pkg.module.modulePackageId === "wall_corner_90")!);
  const customPreset = { presetId: "legacy_client_preset", label: "Client", note: "Saved before normalization", parameterValues: { doorCount: 1 } };
  legacy.parameterPresets = { freeParameterKeys: [], presets: [customPreset] };
  legacy.module.moduleType = "wall_corner_90";
  await withSchemaClient(connectionString, RESTORE_DRILL_SCHEMA, async client => {
    await client.query(`INSERT INTO arcigy_module_packages (client_id,module_package_id,module_type,package_version,package_hash,package,source,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,'system-template',now(),now()) ON CONFLICT(client_id,module_package_id) DO UPDATE
      SET module_type=EXCLUDED.module_type,package_hash=EXCLUDED.package_hash,package=EXCLUDED.package,source=EXCLUDED.source`,
    [context.clientId, legacy.module.modulePackageId, legacy.module.moduleType, legacy.module.version, computeModulePackageHash(legacy), JSON.stringify(legacy)]);
  });
  const normalized = await repository.getPackage(context, legacy.module.modulePackageId);
  assert.deepEqual(normalized!.parameterPresets!.presets, [customPreset]);
  await repository.savePackage(context, normalized!, { expectedPackageHash: computeModulePackageHash(normalized!) });
  assert.deepEqual((await repository.getPackage(context, legacy.module.modulePackageId))!.parameterPresets!.presets, [customPreset]);

  await closeSchemaPools();
  const final = await repository.getPackage(context, request.modulePackageId);
  assert(final?.parameterPresets?.presets.some(p => p.presetId === created.preset.presetId));
  console.log(JSON.stringify({ event: "module_presets_postgres", outcome: "passed", concurrentDeliveries: 8,
    refreshSelections: ["id", "type", "all"], tenantIsolation: true, legacyPresetRetention: true,
    catalogMetadataPreserved: true, rollbackCreationAndLabor: true, differentPackageConcurrency: true, noWriteOnExactRetry: true }));
  return { context, modulePackageId: request.modulePackageId, packageHash: final.integrity.packageHash!, presetId: created.preset.presetId };
}

export async function verifyRestoredModulePreset(connectionString: string, evidence: PresetRestoreEvidence): Promise<void> {
  const repository = createPostgresModulePackageRepository({ connectionString, schema: RESTORE_DRILL_SCHEMA });
  const restored = await repository.getPackage(evidence.context, evidence.modulePackageId);
  assert.equal(restored?.integrity.packageHash, evidence.packageHash);
  assert(restored?.parameterPresets?.presets.some(p => p.presetId === evidence.presetId && p.creationOperation));
}
