import assert from "node:assert/strict";
import { Pool } from "pg";
import type { ClientContext } from "../src/core/client/client-context";
import { createSystemSeedClientCatalogRepository } from "../src/core/catalog/catalog-repository";
import { createPostgresClientCatalogRepository } from "../src/core/catalog/catalog-postgres-repository";
import { createCatalogModuleDefinitionFromPackage } from "../src/core/module-package/module-package-catalog";
import { createPostgresModulePackageRepository } from "../src/core/module-package/module-package-postgres-repository";
import { createModulePackageService } from "../src/core/module-package/module-package-service";
import { computeModulePackageHash } from "../src/core/module-package/module-package-file";
import { createDefaultModulePackageParameters } from "../src/core/module-package/runtime/module-runtime-adapter";
import { systemModulePackageTemplates } from "../src/system/module-packages";
import { closeSchemaPools } from "../src/core/database/postgres-client";
import { assertDisposableDatabaseName, RESTORE_DRILL_SCHEMA } from "./postgresRestoreDrillConfig";

/** Real SQL regressions, only inside the existing disposable local restore drill. */
export async function verifyModuleParameterPresetDatabase(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Preset DB probe requires loopback");
  assertDisposableDatabaseName(url.pathname.slice(1));
  const database = {connectionString, schema: RESTORE_DRILL_SCHEMA};
  const pool = new Pool({connectionString, max: 1});
  const client = await pool.connect();
  const contexts: ClientContext[] = ["alpha", "beta"].map(name => ({clientId:`tenant_preset_${name}`,userId:`user_preset_${name}`,role:"admin"}));
  const packages = createPostgresModulePackageRepository(database);
  const catalogs = createPostgresClientCatalogRepository(database);
  const sourceTypes = ["fwm_catalog_base_drawers", "fwm_catalog_wall_cabinet"];
  const fixtures = sourceTypes.map((type, index) => {
    const fixture = structuredClone(systemModulePackageTemplates.find(item => item.module.moduleType === type)!);
    fixture.module.modulePackageId = `preset_probe_${index}`;
    return fixture;
  });
  const input = {
    modulePackageId: fixtures[0].module.modulePackageId,
    name: "Rovnaký názov", note: "Synthetic database regression",
    parameters: {...createDefaultModulePackageParameters(fixtures[0]), width:1100, height:900, depth:580, hasDoors:false, drawerCount:2, frontMaterialId:"target_front"}
  };
  try {
    await client.query(`SET search_path TO ${RESTORE_DRILL_SCHEMA}, public`);
    for (const context of contexts) {
      await client.query("INSERT INTO arcigy_organizations (organization_id, name, legal_name, settings, created_at, updated_at) VALUES ($1, 'Synthetic preset probe', 'Synthetic preset probe', '{}'::jsonb, now(), now())", [context.clientId]);
      const catalog = structuredClone(createSystemSeedClientCatalogRepository().getCatalogForClient("client_arcigy_demo"));
      catalog.clientId = context.clientId;
      catalog.modules = [];
      for (const [index, fixture] of fixtures.entries()) {
        const saved = await packages.savePackage(context, fixture, {source:"dev-json"});
        catalog.modules.push({...createCatalogModuleDefinitionFromPackage(saved,{catalog,enabled:index!==0,packageHash:saved.integrity.packageHash}),id:`client_catalog_${index}`,name:`Client label ${index}`,pricingRef:Object.keys(catalog.priceList.prices)[0]});
      }
      await catalogs.saveCatalog(context, catalog);
    }
    const context = contexts[0];
    const service = createModulePackageService({context,packageRepository:packages,catalogRepository:catalogs});
    const original = await packages.getPackage(context,input.modulePackageId);
    const originalCatalog = await catalogs.getCatalog(context);
    assert.ok(original);
    const baselinePresets = original.parameterPresets?.presets ?? [];
    const revisionBefore = await packages.getRevision(context);
    const concurrent = await Promise.all([
      service.createParameterPreset(input), service.createParameterPreset(input), service.createParameterPreset(input),
      service.createParameterPreset({...input,modulePackageId:fixtures[1].module.modulePackageId,parameters:{hasDoors:false,shelfCount:3}})
    ]);
    assert.equal(new Set(concurrent.slice(0,3).map(item=>item.preset.presetId)).size,3,"Concurrent duplicate names must get unique IDs");
    await closeSchemaPools(); // Reopen through fresh DB connections, not service-local state.
    const reopened = createPostgresModulePackageRepository(database);
    const stored = await reopened.getPackage(context,input.modulePackageId);
    assert.ok(stored);
    assert.equal(stored.parameterPresets?.presets.length,baselinePresets.length+3,"No concurrent preset is lost");
    assert.deepEqual(stored.parameterPresets?.presets.slice(0,baselinePresets.length),baselinePresets,"Existing presets remain byte-equivalent");
    for (const created of concurrent.slice(0,3)) {
      assert.deepEqual(stored.parameterPresets?.presets.find(p=>p.presetId===created.preset.presetId),created.preset);
      assert.equal(created.preset.parameterValues.hasDoors,false);
      for (const free of ["width","height","depth","frontMaterialId","bodyMaterialId","code","heightCarcass","depthCarcass"]) assert.equal(Object.hasOwn(created.preset.parameterValues,free),false,`${free} stays free`);
    }
    const catalogAfter = await catalogs.getCatalog(context);
    for (const [index, fixture] of fixtures.entries()) {
      const saved = await reopened.getPackage(context,fixture.module.modulePackageId);
      assert.ok(saved);
      assert.equal(saved.integrity.packageHash,computeModulePackageHash(saved));
      assert.deepEqual(catalogAfter.modules[index],{...originalCatalog.modules[index],packageHash:saved.integrity.packageHash});
    }
    const otherTenant = await reopened.getPackage(contexts[1],input.modulePackageId);
    assert.deepEqual(otherTenant?.parameterPresets?.presets ?? [],baselinePresets,"Other tenant remains unchanged");
    assert.notDeepEqual(await reopened.getRevision(context),revisionBefore,"Response-cache revision changes after commit");
    const revision = await reopened.getRevision(context);
    await client.query(`CREATE FUNCTION ${RESTORE_DRILL_SCHEMA}.reject_preset_probe_catalog() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic catalog write failure'; END $$`);
    await client.query(`CREATE TRIGGER reject_preset_probe_catalog BEFORE UPDATE ON arcigy_client_catalogs FOR EACH ROW WHEN (OLD.client_id = 'tenant_preset_alpha') EXECUTE FUNCTION ${RESTORE_DRILL_SCHEMA}.reject_preset_probe_catalog()`);
    try {
      await assert.rejects(service.createParameterPreset({...input,name:"Must roll back"}),/Synthetic catalog write failure/);
    } finally {
      await client.query("DROP TRIGGER reject_preset_probe_catalog ON arcigy_client_catalogs");
      await client.query(`DROP FUNCTION ${RESTORE_DRILL_SCHEMA}.reject_preset_probe_catalog()`);
    }
    assert.deepEqual(await reopened.getPackage(context,input.modulePackageId),stored,"Failed second write rolls back package and timestamp");
    assert.deepEqual(await reopened.getRevision(context),revision,"Failed save does not invalidate stored revision");
    assert.deepEqual(await catalogs.getCatalog(context),catalogAfter,"Failed save preserves catalog");
    await assert.rejects(service.createParameterPreset({...input,name:"Invalid boolean",parameters:{hasDoors:"false"}}));
    assert.deepEqual(await reopened.getPackage(context,input.modulePackageId),stored,"Invalid configuration is rejected before persistence");
    console.log("PostgreSQL preset regressions passed: concurrent create, unique IDs, fresh read, false, free dimensions/materials, tenant isolation, catalog preservation, cache revision and rollback.");
  } finally {
    client.release(); await pool.end(); await closeSchemaPools();
  }
}
