# Material Pipeline

This is the backend-driven material system for the kitchen/interior Blender pipeline.

## What It Does

- Normalizes local PBR ZIPs/folders into `assets/materials/**`.
- Generates `material_manifest.json`, `surface_profiles.json`, frontend catalog, schemas, and reports.
- Uses master templates plus texture sets, not handmade Blender shaders per asset.
- Converts a simple frontend material request into a Blender material through `material_loader.py`.
- Applies material requests to exported scene objects and demo kitchen objects.

## Normalize Assets

```powershell
python tools\normalize_material_assets.py `
  --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" `
  --raw-path "C:\Users\laube\Downloads\Wood049_2K-JPG.zip" `
  --raw-path "C:\Users\laube\Downloads\kiara_interior_2k.exr" `
  --overwrite
```

Pass every downloaded ZIP, extracted folder, `.blend.zip`, or HDRI file as another `--raw-path`.

## Material Request

Frontend sends only this product-level payload:

```json
{
  "materialId": "wood_oak_natural",
  "surfaceProfile": "wood_standard_matte",
  "baseColor": "#B88755",
  "tileSizeMeters": 0.4,
  "uvScale": 2.5,
  "rotation": 0.0,
  "textureStrength": 0.5,
  "reflectivity": 0.35,
  "grainDirection": "vertical"
}
```

Frontend must not send Blender node names, IOR, Fresnel, clearcoat internals, color spaces, or shader graph values.

Vendor/decor payloads are also supported:

```json
{
  "vendor": "demos",
  "vendorDecorId": "demos_wood_oak_natural_001",
  "surfaceProfile": "wood_satin_lacquer",
  "tileSizeMeters": 0.4,
  "grainDirection": "horizontal"
}
```

`materialId` is the internal render material id. `vendorDecorId` is the stable Demos catalog id selected by the user. Demos records do not provide render textures. `surfaceProfile` is only surface behavior, `colorTransform` approximates color, `tileSizeMeters` controls real physical scale, `uvScale` is its Blender repeat value, and `grainDirection` controls orientation on physical UVs.

## Surface Profiles

`surfaceProfileDefault` in `material_manifest.json` is the default surface behavior for a material. `surfaceProfile` in a request can override it per object.

The texture/decor decides the visible pattern and color. The surface profile decides how that same decor reflects light: roughness, subtle roughness variation, bump strength, specular level, and coat/clearcoat values. This lets one wood decor render as raw matte, standard matte, soft-touch supermat, satin lacquer, or gloss laminate without creating separate handmade shaders.

Current wood profiles:

- `wood_raw_matte`
- `wood_standard_matte`
- `wood_soft_touch_supermat`
- `wood_satin_lacquer`
- `wood_gloss_laminate`

`wood_standard_matte` is the default fallback for normal wood decors. `generic_matte` is the safe fallback for non-wood materials. Surface profiles do not control scale; `tileSizeMeters` and `uvScaleDefault` control scale through the `physical_meters` UV layer.

## Demos Decor Mapping Without External Textures

Demos is not a render asset source. Do not scrape, download, copy, or use Demos photos/textures as Blender materials. Demos decor data lives in `backend/materials/vendor_catalogs/demos_decor_mappings.json`.

A Demos record is only a catalog mapping:

- `vendorDecorId`: stable Demos/decor identifier selected by the user.
- `targetInternalMaterialId`: our internal render material from `material_manifest.json`.
- `colorTransform`: approximate tint/color adjustment applied to our material.
- `surfaceProfile`: surface behavior such as matte, satin, gloss.
- `tileSizeMeters` and `uvScale`: physical texture scale.
- `grainDirectionDefault`: default orientation for physical UVs.

Forbidden in Demos mapping records: `baseColorAsset`, `baseColorSource`, `normalAsset`, `normalSource`, `roughnessAsset`, `roughnessSource`, and `thumbnailAsset`. If a Demos decor needs a more exact render, add or improve our internal material/texture and point `targetInternalMaterialId` to it.

`wood_varnished_satin` is now an internal material mapped to `Wood050`. That is not a Demos fallback asset anymore. Internal asset status is tracked in `backend/materials/material_asset_report.json`; Demos mapping quality is tracked in `backend/materials/demos_mapping_report.json`.

Flow:

```text
User selects Demos decor
-> app sends vendor + vendorDecorId
-> resolver loads demos_decor_mappings.json
-> mapping points to targetInternalMaterialId
-> resolver loads our internal material
-> resolver applies colorTransform + surfaceProfile
-> Blender renders our material
-> no Demos texture is used
```

## Demos Mapping Import Pipeline

Demos mapping imports do not copy image files. They upsert mapping records only. Prepare mapping JSON with `records[]`. See:

- `backend/materials/imports/demos_mapping_template.json`
- `backend/materials/imports/demos_mapping_sample.json`

Run dry-run first. It validates and reports what would be inserted or updated, but writes nothing:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_sample.json --dry-run
```

Run the real import:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_sample.json
```

Useful flags:

- `--dry-run`: validate and summarize without writing.
- `--fail-on-unmapped`: fail when any record cannot map to an internal material.
- `--limit 10`: import only the first records.

Import behavior:

- `uvScale = 1 / tileSizeMeters`.
- wood `surfaceHint` maps to wood profiles: raw, matte, supermat, satin, gloss.
- non-wood currently maps to `generic_matte`.
- `colorTransform` controls approximate color on top of our material.
- `mappingStatus` is `mapped`, `needs_review`, or `unmapped`.
- `usesExternalVendorTexture` must stay false.

The old `tools/import_vendor_materials.py` is legacy/internal asset import only. It is not the Demos workflow.

## Demos 6000 Board CSV Mapping

For the real Demos catalog, CSV is the source of truth. `demos_decor_mappings.json` is only the normalized generated output.

Flow:

```text
Demos 6000 CSV
-> prepare_demos_mapping_master_csv.py adds mapping columns
-> human/internal process fills approved render values
-> mappingLocked=true for approved records
-> import_vendor_decor_mappings.py generates demos_decor_mappings.json
-> resolver loads the mapping
-> Blender uses our internal template + colorTransform
-> physical_meters keeps real scale
-> NO DEMOS TEXTURE
```

Master files:

- `backend/materials/imports/demos_mapping_master_template.csv`
- `backend/materials/imports/demos_mapping_master_sample.csv`

Prepare an existing 6000-row Demos CSV:

```powershell
python tools\prepare_demos_mapping_master_csv.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --input path\to\existing_demos_6000.csv --output backend\materials\imports\demos_mapping_master.csv
```

Import the approved mapping CSV:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_master.csv --respect-locked
```

Important fields:

- `targetInternalMaterialId`: our internal render material/template.
- `proceduralTemplate`: procedural shader base, for example `wood_oak_neutral`.
- `grainPatternId`: wood grain variant, for example `oak_medium_grain`.
- `baseColorHex`: approved render base color. Website-picked colors are `website_visual_match`, not physical measurement.
- `grainColorHex`: approved grain/fiber color.
- `surfaceProfile`: roughness, bump, specular, and coat behavior.
- `roughnessOverride`: optional explicit roughness override.
- `mappingLocked`: approved rows must be locked so imports do not overwrite them.
- `confidence`: reliability of the mapping, `mapped` rows require at least `0.7`.
- `colorSourceMethod`: `physical_sample`, `official_swatch`, `website_visual_match`, `manual_approx`, `internal_review`, or `unknown`.

Mapped rows must be explicit and locked. Draft or inferred rows should stay `needs_review`.

Demos 6000 draft and review workflow:

```text
raw Demos CSV
-> prepare_demos_mapping_master_csv.py
-> demos_mapping_master.csv
-> generate_demos_mapping_draft.py
-> demos_mapping_master_draft.csv
-> audit_demos_mapping_master_csv.py
-> export_demos_mapping_review_batches.py
-> human review edits batch CSV
-> import_reviewed_demos_mapping_batch.py
-> demos_mapping_master_reviewed.csv
-> import_vendor_decor_mappings.py
-> demos_decor_mappings.json
-> Blender batch preview
```

Rule-based automation only proposes values. It must keep rows as `needs_review`, `mappingLocked=false`, `confidence < 0.7`, and `colorSourceMethod=rule_inferred`. Production truth starts only after review:

```text
mappingStatus = mapped
mappingLocked = true
confidence >= 0.7
colorSourceMethod != rule_inferred
```

Rules live in `backend/materials/demos_mapping_rules.json`. They infer draft material family, target neutral template, grain pattern, surface profile, and color preset from names like dub/oak, orech/walnut, concrete, white, black, matte, supermat, satin, and gloss. These are not approved values; they are a review queue starter.

Prepare a raw Demos CSV:

```powershell
python tools\prepare_demos_mapping_master_csv.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --input path\to\demos_6000.csv --output backend\materials\imports\demos_mapping_master.csv
```

Generate draft values:

```powershell
python tools\generate_demos_mapping_draft.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --input backend\materials\imports\demos_mapping_master.csv --output backend\materials\imports\demos_mapping_master_draft.csv --preserve-locked --only-empty
```

Audit the draft:

```powershell
python tools\audit_demos_mapping_master_csv.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --input backend\materials\imports\demos_mapping_master_draft.csv
```

Export review batches:

```powershell
python tools\export_demos_mapping_review_batches.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --input backend\materials\imports\demos_mapping_master_draft.csv --batch-size 100 --output-dir backend\materials\imports\review_batches
```

Promote a reviewed batch back into the master:

```powershell
python tools\import_reviewed_demos_mapping_batch.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --master backend\materials\imports\demos_mapping_master_draft.csv --reviewed backend\materials\imports\review_batches\demos_review_batch_0000_0099.csv --output backend\materials\imports\demos_mapping_master_reviewed.csv --reviewed-by "Laube" --lock-approved
```

Import the reviewed master into staging first:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_master_reviewed.csv --catalog-mode staging --respect-locked
```

Then generate the production catalog:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_master_reviewed.csv --catalog-mode production --respect-locked
```

`demos_mapping_report.json` reports the production JSON catalog. `demos_mapping_staging_report.json` reports staging. `backend/materials/reports/demos_mapping_master_audit.*` reports the CSV master/review workflow.

## Demos Production vs Staging Catalogs

CSV master remains the source of truth. Catalog JSON files are generated outputs:

- `backend/materials/vendor_catalogs/demos_decor_mappings_staging.json`: internal staging/review catalog. It may contain `needs_review`, `unmapped`, unlocked, and `rule_inferred` records.
- `backend/materials/vendor_catalogs/demos_decor_mappings.json`: production catalog. It contains only production-safe records.

Production-safe means:

```text
mappingStatus = mapped
mappingLocked = true
confidence >= 0.7
colorSourceMethod != rule_inferred
usesExternalVendorTexture = false
no forbidden Demos asset fields
```

Frontend default catalog `material_frontend_catalog.json` is production-only. Review/internal tooling can read `material_frontend_catalog_staging.json`. Resolver default mode is production; staging must be requested explicitly for review scripts.

Import staging:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_master_sample_draft.csv --catalog-mode staging --respect-locked
```

Import production:

```powershell
python tools\import_vendor_decor_mappings.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --vendor demos --input backend\materials\imports\demos_mapping_master_sample_draft.csv --catalog-mode production --respect-locked
```

Production preview:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_demos_mapping_batch_preview.py -- --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --catalog-mode production --offset 0 --limit 100
```

Staging preview:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_demos_mapping_batch_preview.py -- --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --catalog-mode staging --offset 0 --limit 100
```

## Demos Real CSV Pilot Workflow

Use this before touching all 6000 Demos rows. The pilot prepares review data only; it does not import anything into staging or production.

Flow:

```text
1. put raw Demos CSV into backend/materials/imports/pilot/
2. run run_demos_mapping_pilot.py --limit 100
3. inspect audit JSON/CSV
4. open review batch CSV
5. edit or approve rows
6. run run_demos_mapping_pilot_review_import.py
7. run preview
8. continue with the next batch only after visual review
```

Put the real file here:

```text
backend/materials/imports/pilot/demos_raw_pilot.csv
```

Prepare the first 100 rows:

```powershell
python tools\run_demos_mapping_pilot.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --input backend\materials\imports\pilot\demos_raw_pilot.csv --offset 0 --limit 100 --batch-size 50
```

Outputs:

```text
backend/materials/imports/pilot/output/demos_mapping_master_pilot_0000_0100.csv
backend/materials/imports/pilot/output/demos_mapping_master_pilot_draft_0000_0100.csv
backend/materials/imports/pilot/output/audit/demos_mapping_master_audit.json
backend/materials/imports/pilot/output/audit/demos_mapping_master_audit.csv
backend/materials/imports/pilot/output/review_batches/
backend/materials/imports/pilot/output/summary_0000_0100.json
```

After editing a review batch:

```powershell
python tools\run_demos_mapping_pilot_review_import.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --master backend\materials\imports\pilot\output\demos_mapping_master_pilot_draft_0000_0100.csv --reviewed backend\materials\imports\pilot\output\review_batches\demos_review_batch_0000_0049.csv --reviewed-by "Laube" --lock-approved
```

Preview staging or production:

```powershell
python tools\run_demos_mapping_pilot_preview.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --catalog-mode staging --offset 0 --limit 100
```

Preview a specific review batch CSV:

```powershell
python tools\run_demos_mapping_pilot_preview.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" --csv backend\materials\imports\pilot\output\review_batches\demos_review_batch_0000_0049.csv
```

Demos mapping preview:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_demos_decor_mapping_preview.py -- --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

Outputs:

- `blender/previews/demos_decor_mapping_preview.blend`
- `blender/previews/demos_decor_mapping_preview.png`

## Backend Resolver

Use `backend/materials/material_resolver.py` outside Blender:

```python
from material_resolver import resolve_material_request

normalized = resolve_material_request(request, r"C:\Users\laube\Documents\GitHub\kitchen_app")
```

The resolver validates `materialId`, allowed `surfaceProfile`, numeric ranges, `baseColor`, `tileSizeMeters`, `uvScale`, and `grainDirection`.
It also resolves `vendor + vendorDecorId` requests through `demos_decor_mappings.json`, then loads our internal material from `material_manifest.json`. The returned Blender payload always includes `usesExternalVendorTexture: false`.

Surface profile precedence:

1. Object assignment `surfaceProfile`.
2. Manifest `surfaceProfileDefault`.
3. `wood_standard_matte` for wood.
4. `generic_matte` for everything else.

`tileSizeMeters` is the product-level truth. `uvScaleDefault` is the Blender implementation detail.

```text
uvScaleDefault = 1 / tileSizeMeters
```

For the current material library:

```text
tileSizeMeters = 0.4
uvScaleDefault = 2.5
```

That means one texture tile covers `0.4m x 0.4m`, or 40 cm by 40 cm.

Blender uses the UV layer `physical_meters`. UV coordinates in that layer are stored in real meters, so a 0.8 m board has twice the UV span of a 0.4 m board. The material then applies `uvScale = 2.5`, giving one repeat per 0.4 m.

Precedence:

1. If an assignment sends `tileSizeMeters`, Blender uses `uvScale = 1 / tileSizeMeters`.
2. Else if it sends `uvScale`, the resolver derives `tileSizeMeters = 1 / uvScale`.
3. Else it uses `tileSizeMeters` and `uvScaleDefault` from `material_manifest.json`.
4. If `grainDirection` is missing, it uses `grainDirectionDefault` from the manifest.

Allowed `grainDirection` values are `vertical`, `horizontal`, `lengthwise`, and `none`. Old `auto` or `null` inputs are tolerated by the backend and normalized to the manifest default.

## Blender Loader

Use `blender/scripts/material_loader.py` as the single source for Blender shader nodes:

```python
from material_loader import create_material_from_manifest

mat = create_material_from_manifest(
    material_id="wood_oak_natural",
    surface_profile="wood_standard_matte",
    base_color="#B88755",
    tile_size_meters=0.4,
    uv_scale=2.5,
    rotation_degrees=0.0,
    grain_direction="vertical",
    texture_strength=0.5,
    reflectivity=0.35,
    project_root="/path/to/project",
)
```

## Apply Materials To Existing Scene

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b input.blend --python blender\scripts\apply_materials_to_scene.py -- `
  --project-root "C:\Users\laube\Documents\GitHub\kitchen_app" `
  --materials-json "C:\path\to\object_materials.json" `
  --output-blend "C:\path\to\output.blend"
```

`object_materials.json` contains `objects[]` with `objectName` and `material`. The script caches identical requests so repeated doors do not create duplicate Blender materials. It writes `reports/apply_materials_report.json`.

## Demo Kitchen Scene

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_demo_kitchen_material_scene.py -- `
  --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

Outputs:

- `blender/previews/demo_kitchen_material_scene.blend`
- `blender/previews/demo_kitchen_material_scene.png`

## Physical UV Scale Test

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_uv_scale_physical_test.py -- `
  --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

Outputs:

- `blender/previews/uv_scale_physical_test.blend`
- `blender/previews/uv_scale_physical_test.png`

This scene verifies that `uvScale = 2.5` produces approximately 1 tile on a 0.4 m board, 2 tiles on a 0.8 m board, and 4 tiles on a 1.6 m board. It also shows `vertical`, `horizontal`, and `lengthwise` grain direction.

## Preview Scenes

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_material_preview_scene.py -- --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_surface_profile_preview.py -- --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

Surface profile preview outputs:

- `blender/previews/surface_profile_preview.blend`
- `blender/previews/surface_profile_preview.png`

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --python blender\scripts\create_demos_decor_mapping_preview.py -- --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

Demos mapping preview outputs:

- `blender/previews/demos_decor_mapping_preview.blend`
- `blender/previews/demos_decor_mapping_preview.png`

## Validate

```powershell
python tools\validate_material_pipeline.py --project-root "C:\Users\laube\Documents\GitHub\kitchen_app"
```

The validator checks manifest shape, unique ids, allowed profiles, physical map paths, basecolor fallbacks, metal profiles, frontend catalog ids, and demo material requests. It writes `reports/material_validation_report.json`.

## Key Files

- Manifest: `backend/materials/material_manifest.json`
- Request schema: `backend/materials/material_request_schema.json`
- Surface profiles: `backend/materials/surface_profiles.json`
- Frontend catalog: `backend/materials/material_frontend_catalog.json`
- Demos mappings: `backend/materials/vendor_catalogs/demos_decor_mappings.json`
- Demos mapping report: `backend/materials/demos_mapping_report.json`
- Asset report: `backend/materials/material_asset_report.json`
- Backend resolver: `backend/materials/material_resolver.py`
- Blender loader: `blender/scripts/material_loader.py`
- Object applier: `blender/scripts/apply_materials_to_scene.py`

## fallbackBaseColor

If a material has no `basecolor` map, it must either be an overlay or define `fallbackBaseColor` in the manifest. The loader uses that explicit color before category fallbacks. Missing `roughness` or `normal` is a warning and gets a safe procedural fallback. Missing `displacement`, `opacity`, and most `metallic` maps is usually OK.

## Add A New PBR Material

1. Add the downloaded asset path to the normalizer command.
2. Add or adjust the mapping in `tools/normalize_material_assets.py`.
3. Run normalization with `--overwrite`.
4. Check `source.json`, manifest paths, and reports.
5. Run validation and regenerate previews.

## AI Later

AI must generate only material request JSON. It must not generate Blender nodes or shader internals. Blender materials stay controlled by the manifest, surface profiles, resolver, and `material_loader.py`.

## Do Not Do

- Do not create handmade shaders per asset.
- Do not manually edit Blender nodes per asset.
- Do not rename map files outside `tools/normalize_material_assets.py`.
- Do not expose internal shader parameters to frontend.
- Do not hardcode absolute asset paths in manifests.
