from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any


MASTER_COLUMNS = [
    "vendor",
    "vendorDecorId",
    "vendorSku",
    "displayName",
    "slug",
    "materialType",
    "decorFamily",
    "colorFamily",
    "surfaceHint",
    "targetInternalMaterialId",
    "proceduralTemplate",
    "grainPatternId",
    "surfaceProfile",
    "colorTransformMode",
    "baseColorHex",
    "grainColorHex",
    "secondaryColorHex",
    "tintStrength",
    "grainContrast",
    "hueShiftDegrees",
    "saturationScale",
    "valueScale",
    "contrastScale",
    "roughnessMultiplier",
    "roughnessOverride",
    "bumpMultiplier",
    "grainDepth",
    "coatMultiplier",
    "tileSizeMeters",
    "uvScale",
    "grainDirectionDefault",
    "patternRotationDegrees",
    "edgeStrategy",
    "edgeColorHex",
    "mappingStatus",
    "mappingLocked",
    "confidence",
    "colorSourceMethod",
    "sourceReference",
    "reviewedBy",
    "reviewedAt",
    "notes",
]
GRAIN_DIRECTIONS = {"vertical", "horizontal", "lengthwise", "none"}
MATERIAL_TYPES = {"wood", "stone", "concrete", "solid", "metal", "generic"}
SURFACE_HINTS = {"raw", "matte", "supermat", "satin", "gloss", "unknown"}
COLOR_MODES = {"none", "tint_multiply", "tint_mix", "solid_color", "hsv_adjust"}
MAPPING_STATUSES = {"mapped", "needs_review", "unmapped"}
COLOR_SOURCE_METHODS = {"physical_sample", "official_swatch", "website_visual_match", "manual_approx", "internal_review", "rule_inferred", "unknown"}
EDGE_STRATEGIES = {"match_base", "match_grain", "solid_edge", "none", "unknown"}
FORBIDDEN_DEMOS_ASSET_FIELDS = {
    "baseColorSource",
    "baseColorAsset",
    "normalSource",
    "normalAsset",
    "roughnessSource",
    "roughnessAsset",
    "thumbnailAsset",
    "externalTexture",
    "vendorTexture",
    "demosTexture",
}
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def rel(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except Exception:
        return str(path)


def add_error(report: dict[str, Any], message: str) -> None:
    report["errors"].append(message)


def add_warning(report: dict[str, Any], message: str) -> None:
    report["warnings"].append(message)


def is_hex(value: Any, allow_empty: bool = True) -> bool:
    if value in (None, ""):
        return allow_empty
    return isinstance(value, str) and HEX_RE.match(value) is not None


def check_range(report: dict[str, Any], label: str, value: Any, lo: float, hi: float, allow_null: bool = False) -> None:
    if value is None and allow_null:
        return
    if not isinstance(value, (int, float)) or not lo <= float(value) <= hi:
        add_error(report, f"{label} must be a number from {lo} to {hi}")


def validate(project_root: Path) -> dict[str, Any]:
    report: dict[str, Any] = {
        "ok": False,
        "errors": [],
        "warnings": [],
        "materialsChecked": 0,
        "frontendCatalogChecked": 0,
        "vendorRecordsChecked": 0,
        "demosMappingsChecked": 0,
        "demoObjectsChecked": 0,
    }
    materials_dir = project_root / "backend" / "materials"
    if str(materials_dir) not in sys.path:
        sys.path.insert(0, str(materials_dir))
    from demos_mapping_safety import FORBIDDEN_DEMOS_ASSET_FIELDS as SAFETY_FORBIDDEN_FIELDS
    from demos_mapping_safety import is_production_safe_demos_mapping

    required_files = [
        materials_dir / "material_manifest.json",
        materials_dir / "surface_profiles.json",
        materials_dir / "material_frontend_catalog.json",
        materials_dir / "demo_kitchen_material_test.json",
        materials_dir / "material_asset_report.json",
        materials_dir / "demos_mapping_report.json",
        materials_dir / "demos_mapping_staging_report.json",
        materials_dir / "demos_mapping_rules.json",
        materials_dir / "material_frontend_catalog_staging.json",
        materials_dir / "vendor_catalogs" / "demos_decor_mappings.json",
        materials_dir / "vendor_catalogs" / "demos_decor_mappings_staging.json",
        materials_dir / "imports" / "demos_mapping_master_template.csv",
        materials_dir / "imports" / "demos_mapping_master_sample.csv",
        project_root / "tools" / "prepare_demos_mapping_master_csv.py",
        project_root / "tools" / "import_vendor_decor_mappings.py",
        project_root / "tools" / "generate_demos_mapping_draft.py",
        project_root / "tools" / "audit_demos_mapping_master_csv.py",
        project_root / "tools" / "export_demos_mapping_review_batches.py",
        project_root / "tools" / "import_reviewed_demos_mapping_batch.py",
        project_root / "tools" / "run_demos_mapping_pilot.py",
        project_root / "tools" / "run_demos_mapping_pilot_review_import.py",
        project_root / "tools" / "run_demos_mapping_pilot_preview.py",
        materials_dir / "imports" / "pilot" / "REVIEW_INSTRUCTIONS.md",
    ]
    for path in required_files:
        if not path.exists():
            add_error(report, f"Missing required file: {rel(project_root, path)}")
    if report["errors"]:
        return report

    with (materials_dir / "imports" / "demos_mapping_master_template.csv").open(newline="", encoding="utf-8-sig") as f:
        header = next(csv.reader(f))
    if header != MASTER_COLUMNS:
        add_error(report, "demos_mapping_master_template.csv header does not match required master header")

    manifest_items = load_json(materials_dir / "material_manifest.json")
    profiles = load_json(materials_dir / "surface_profiles.json")
    catalog = load_json(materials_dir / "material_frontend_catalog.json")
    demo = load_json(materials_dir / "demo_kitchen_material_test.json")
    mappings = load_json(materials_dir / "vendor_catalogs" / "demos_decor_mappings.json")
    staging_mappings = load_json(materials_dir / "vendor_catalogs" / "demos_decor_mappings_staging.json")
    mapping_report = load_json(materials_dir / "demos_mapping_report.json")
    staging_mapping_report = load_json(materials_dir / "demos_mapping_staging_report.json")
    mapping_rules = load_json(materials_dir / "demos_mapping_rules.json")
    asset_report = load_json(materials_dir / "material_asset_report.json")
    legacy_vendor_path = materials_dir / "vendor_catalogs" / "demos_materials.json"
    legacy_vendor = load_json(legacy_vendor_path) if legacy_vendor_path.exists() else []

    if not isinstance(profiles, dict):
        add_error(report, "surface_profiles.json must be an object")
        profiles = {}
    for profile_id, profile in profiles.items():
        if not isinstance(profile, dict):
            add_error(report, f"Surface profile {profile_id} must be an object")
            continue
        for key in ["category", "roughnessBase", "roughnessVariation", "bumpStrength", "specularLevel", "coatWeight", "coatRoughness"]:
            if key not in profile:
                add_error(report, f"Surface profile {profile_id} missing {key}")
        for key in ["roughnessBase", "roughnessVariation", "bumpStrength", "specularLevel", "coatWeight", "coatRoughness"]:
            check_range(report, f"Surface profile {profile_id}.{key}", profile.get(key), 0.0, 1.0)

    manifest: dict[str, dict[str, Any]] = {}
    if not isinstance(manifest_items, list):
        add_error(report, "material_manifest.json must be a list")
        manifest_items = []
    for item in manifest_items:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            add_error(report, "Manifest material missing id")
            continue
        if item["id"] in manifest:
            add_error(report, f"Duplicate materialId: {item['id']}")
        manifest[item["id"]] = item
    report["materialsChecked"] = len(manifest)

    for material_id, item in manifest.items():
        for key in ["category", "template", "maps", "defaultSurfaceProfile", "surfaceProfileDefault", "allowedSurfaceProfiles", "tileSizeMeters", "uvScaleDefault", "grainDirectionDefault"]:
            if key not in item:
                add_error(report, f"{material_id} missing {key}")
        tile = item.get("tileSizeMeters")
        uv = item.get("uvScaleDefault")
        if isinstance(tile, (int, float)) and float(tile) > 0 and isinstance(uv, (int, float)):
            if abs(float(uv) - 1.0 / float(tile)) >= 0.001:
                add_error(report, f"{material_id} uvScaleDefault is not 1 / tileSizeMeters")
        else:
            add_error(report, f"{material_id} missing valid tileSizeMeters/uvScaleDefault")
        if item.get("grainDirectionDefault") not in GRAIN_DIRECTIONS:
            add_error(report, f"{material_id} has invalid grainDirectionDefault")
        allowed = item.get("allowedSurfaceProfiles", [])
        if not isinstance(allowed, list) or not allowed:
            add_error(report, f"{material_id} allowedSurfaceProfiles must be a non-empty list")
            allowed = []
        for profile_id in allowed:
            if profile_id not in profiles:
                add_error(report, f"{material_id} references unknown profile {profile_id}")
        if item.get("defaultSurfaceProfile") not in allowed:
            add_error(report, f"{material_id} defaultSurfaceProfile is not allowed")
        if item.get("surfaceProfileDefault") not in profiles:
            add_error(report, f"{material_id} surfaceProfileDefault does not exist")
        maps = item.get("maps", {})
        if not isinstance(maps, dict):
            add_error(report, f"{material_id} maps must be an object")
            maps = {}
        for role, value in maps.items():
            if value is None:
                continue
            if not isinstance(value, str) or Path(value).is_absolute() or not (project_root / value).exists():
                add_error(report, f"{material_id}.{role} map is invalid: {value!r}")
        if maps.get("basecolor") is None and item.get("category") != "overlays" and not item.get("fallbackBaseColor"):
            add_error(report, f"{material_id} has no basecolor and no fallbackBaseColor")

    if isinstance(catalog, list):
        report["frontendCatalogChecked"] = len(catalog)
        for entry in catalog:
            if not isinstance(entry, dict):
                add_error(report, "Frontend catalog contains a non-object entry")
                continue
            if entry.get("id") is not None and entry.get("id") not in manifest:
                add_error(report, f"Frontend catalog references unknown materialId: {entry.get('id')!r}")
            if entry.get("catalogType") == "demosDecorMapping" and entry.get("usesExternalVendorTexture") is not False:
                add_error(report, f"Frontend Demos entry {entry.get('vendorDecorId')!r} must have usesExternalVendorTexture=false")
            if entry.get("catalogType") == "demosDecorMapping" and entry.get("productionSafe") is not True:
                add_error(report, f"Production frontend Demos entry {entry.get('vendorDecorId')!r} must be productionSafe=true")
    else:
        add_error(report, "material_frontend_catalog.json must be a list")
    staging_catalog_path = materials_dir / "material_frontend_catalog_staging.json"
    staging_catalog = load_json(staging_catalog_path)
    if isinstance(staging_catalog, list):
        for entry in staging_catalog:
            if not isinstance(entry, dict) or entry.get("catalogType") != "demosDecorMapping":
                continue
            if entry.get("usesExternalVendorTexture") is not False:
                add_error(report, f"Staging frontend Demos entry {entry.get('vendorDecorId')!r} must have usesExternalVendorTexture=false")
            if entry.get("mappingStatus") != "mapped" and entry.get("productionSafe") is not False:
                add_error(report, f"Staging frontend Demos entry {entry.get('vendorDecorId')!r} must have productionSafe=false when not mapped")
    else:
        add_error(report, "material_frontend_catalog_staging.json must be a list")

    if isinstance(legacy_vendor, list):
        report["vendorRecordsChecked"] = len(legacy_vendor)

    if not isinstance(mapping_rules, dict):
        add_error(report, "demos_mapping_rules.json must be an object")
        mapping_rules = {}
    for key in ["defaults", "targetTemplateRules", "grainPatternRules", "surfaceProfileRules", "colorPresetRules"]:
        if key not in mapping_rules:
            add_error(report, f"demos_mapping_rules.json missing {key}")
    defaults = mapping_rules.get("defaults", {})
    if isinstance(defaults, dict):
        if defaults.get("mappingStatus") != "needs_review":
            add_error(report, "demos_mapping_rules defaults.mappingStatus must be needs_review")
        if defaults.get("mappingLocked") is not False:
            add_error(report, "demos_mapping_rules defaults.mappingLocked must be false")
        if defaults.get("colorSourceMethod") != "rule_inferred":
            add_error(report, "demos_mapping_rules defaults.colorSourceMethod must be rule_inferred")
        if defaults.get("usesExternalVendorTexture") is not False:
            add_error(report, "demos_mapping_rules defaults.usesExternalVendorTexture must be false")

    if not isinstance(mappings, list):
        add_error(report, "demos_decor_mappings.json must be a list")
        mappings = []
    report["demosMappingsChecked"] = len(mappings)
    seen: set[str] = set()
    for record in mappings:
        if not isinstance(record, dict):
            add_error(report, "Demos mapping contains a non-object entry")
            continue
        decor_id = record.get("vendorDecorId")
        for key in ["targetInternalMaterialId", "surfaceProfile", "colorTransform", "tileSizeMeters", "uvScale", "grainDirectionDefault", "mappingStatus", "mappingLocked", "usesExternalVendorTexture"]:
            if key not in record:
                add_error(report, f"Demos mapping {decor_id!r} missing {key}")
        forbidden = sorted(FORBIDDEN_DEMOS_ASSET_FIELDS.intersection(record))
        if forbidden:
            add_error(report, f"Demos mapping {decor_id!r} contains forbidden asset fields: {', '.join(forbidden)}")
        safety_ok, safety_reasons = is_production_safe_demos_mapping(record, manifest, profiles)
        if not safety_ok:
            add_error(report, f"Production Demos mapping {decor_id!r} is not production-safe: {'; '.join(safety_reasons)}")
        if record.get("usesExternalVendorTexture") is not False:
            add_error(report, f"Demos mapping {decor_id!r} must have usesExternalVendorTexture=false")
        if not isinstance(decor_id, str) or not decor_id:
            add_error(report, "Demos mapping missing vendorDecorId")
        elif decor_id in seen:
            add_error(report, f"Duplicate Demos vendorDecorId: {decor_id}")
        else:
            seen.add(decor_id)
        if record.get("materialType") not in MATERIAL_TYPES:
            add_error(report, f"Demos mapping {decor_id!r} has invalid materialType")
        if record.get("surfaceHint") not in SURFACE_HINTS:
            add_error(report, f"Demos mapping {decor_id!r} has invalid surfaceHint")
        target_id = record.get("targetInternalMaterialId")
        if target_id not in manifest and record.get("mappingStatus") != "unmapped":
            add_error(report, f"Demos mapping {decor_id!r} targetInternalMaterialId does not exist: {target_id!r}")
        if record.get("surfaceProfile") not in profiles:
            add_error(report, f"Demos mapping {decor_id!r} references unknown surfaceProfile")
        tile = record.get("tileSizeMeters")
        uv = record.get("uvScale")
        if not isinstance(tile, (int, float)) or float(tile) <= 0 or not isinstance(uv, (int, float)) or float(uv) <= 0:
            add_error(report, f"Demos mapping {decor_id!r} has invalid tileSizeMeters/uvScale")
        elif abs(float(uv) - 1.0 / float(tile)) >= 0.001:
            add_error(report, f"Demos mapping {decor_id!r} has inconsistent tileSizeMeters/uvScale")
        if record.get("grainDirectionDefault") not in GRAIN_DIRECTIONS:
            add_error(report, f"Demos mapping {decor_id!r} has invalid grainDirectionDefault")
        status = record.get("mappingStatus")
        if status not in MAPPING_STATUSES:
            add_error(report, f"Demos mapping {decor_id!r} has invalid mappingStatus")
        transform = record.get("colorTransform")
        if not isinstance(transform, dict):
            add_error(report, f"Demos mapping {decor_id!r} colorTransform must be an object")
            transform = {}
        mode = transform.get("mode")
        if mode not in COLOR_MODES:
            add_error(report, f"Demos mapping {decor_id!r} has invalid colorTransform mode")
        for key in ["baseColorHex", "grainColorHex", "secondaryColorHex"]:
            if not is_hex(transform.get(key)):
                add_error(report, f"Demos mapping {decor_id!r} {key} must be #RRGGBB when filled")
        if not is_hex(record.get("edgeColorHex")):
            add_error(report, f"Demos mapping {decor_id!r} edgeColorHex must be #RRGGBB when filled")
        check_range(report, f"Demos mapping {decor_id!r} tintStrength", transform.get("tintStrength"), 0, 1)
        check_range(report, f"Demos mapping {decor_id!r} grainContrast", transform.get("grainContrast"), 0, 1)
        check_range(report, f"Demos mapping {decor_id!r} roughnessMultiplier", record.get("roughnessMultiplier"), 0, 2)
        check_range(report, f"Demos mapping {decor_id!r} roughnessOverride", record.get("roughnessOverride"), 0, 1, allow_null=True)
        check_range(report, f"Demos mapping {decor_id!r} bumpMultiplier", record.get("bumpMultiplier"), 0, 2)
        check_range(report, f"Demos mapping {decor_id!r} grainDepth", record.get("grainDepth"), 0, 2)
        check_range(report, f"Demos mapping {decor_id!r} coatMultiplier", record.get("coatMultiplier"), 0, 2)
        check_range(report, f"Demos mapping {decor_id!r} confidence", record.get("confidence"), 0, 1)
        if record.get("colorSourceMethod") not in COLOR_SOURCE_METHODS:
            add_error(report, f"Demos mapping {decor_id!r} has invalid colorSourceMethod")
        if record.get("edgeStrategy") not in EDGE_STRATEGIES:
            add_error(report, f"Demos mapping {decor_id!r} has invalid edgeStrategy")
        if status == "mapped":
            if record.get("mappingLocked") is not True:
                add_error(report, f"Mapped Demos record {decor_id!r} must be locked")
            if not isinstance(record.get("confidence"), (int, float)) or float(record.get("confidence")) < 0.7:
                add_error(report, f"Mapped Demos record {decor_id!r} must have confidence >= 0.7")
            if record.get("colorSourceMethod") == "rule_inferred":
                add_error(report, f"Mapped Demos record {decor_id!r} cannot use rule_inferred")
            for key in ["targetInternalMaterialId", "surfaceProfile", "grainPatternId"]:
                if not record.get(key):
                    add_error(report, f"Mapped Demos record {decor_id!r} missing {key}")
            if not is_hex(transform.get("baseColorHex"), allow_empty=False):
                add_error(report, f"Mapped Demos record {decor_id!r} missing valid baseColorHex")
            if target_id in manifest and manifest[target_id].get("allowVendorMapping") is not True:
                add_error(report, f"Mapped Demos record {decor_id!r} targets material without allowVendorMapping=true: {target_id}")
        if record.get("colorSourceMethod") == "rule_inferred":
            if status == "mapped" or record.get("mappingLocked") is True or (isinstance(record.get("confidence"), (int, float)) and float(record.get("confidence")) >= 0.7):
                add_error(report, f"Rule-inferred Demos record {decor_id!r} must stay needs_review, unlocked, confidence < 0.7")

    if not isinstance(staging_mappings, list):
        add_error(report, "demos_decor_mappings_staging.json must be a list")
        staging_mappings = []
    for record in staging_mappings:
        if not isinstance(record, dict):
            add_error(report, "Staging Demos mapping contains a non-object entry")
            continue
        decor_id = record.get("vendorDecorId")
        forbidden = sorted(SAFETY_FORBIDDEN_FIELDS.intersection(record))
        if forbidden:
            add_error(report, f"Staging Demos mapping {decor_id!r} contains forbidden asset fields: {', '.join(forbidden)}")
        if record.get("usesExternalVendorTexture") is not False:
            add_error(report, f"Staging Demos mapping {decor_id!r} must have usesExternalVendorTexture=false")

    if not isinstance(mapping_report, dict):
        add_error(report, "demos_mapping_report.json must be an object")
    else:
        expected = {
            "total": len(mappings),
            "productionSafe": len(mappings),
            "mapped": sum(1 for r in mappings if isinstance(r, dict) and r.get("mappingStatus") == "mapped"),
            "needs_review": sum(1 for r in mappings if isinstance(r, dict) and r.get("mappingStatus") == "needs_review"),
            "unmapped": sum(1 for r in mappings if isinstance(r, dict) and r.get("mappingStatus") == "unmapped"),
            "locked": sum(1 for r in mappings if isinstance(r, dict) and r.get("mappingLocked") is True),
            "unlocked": sum(1 for r in mappings if isinstance(r, dict) and r.get("mappingLocked") is not True),
            "usesExternalVendorTexture": sum(1 for r in mappings if isinstance(r, dict) and r.get("usesExternalVendorTexture")),
        }
        summary = mapping_report.get("summary", {})
        for key, value in expected.items():
            if summary.get(key) != value:
                add_error(report, f"demos_mapping_report summary {key}={summary.get(key)!r}, expected {value}")
    if not isinstance(staging_mapping_report, dict):
        add_error(report, "demos_mapping_staging_report.json must be an object")
    else:
        expected = {
            "total": len(staging_mappings),
            "mapped": sum(1 for r in staging_mappings if isinstance(r, dict) and r.get("mappingStatus") == "mapped"),
            "needs_review": sum(1 for r in staging_mappings if isinstance(r, dict) and r.get("mappingStatus") == "needs_review"),
            "unmapped": sum(1 for r in staging_mappings if isinstance(r, dict) and r.get("mappingStatus") == "unmapped"),
            "locked": sum(1 for r in staging_mappings if isinstance(r, dict) and r.get("mappingLocked") is True),
            "unlocked": sum(1 for r in staging_mappings if isinstance(r, dict) and r.get("mappingLocked") is not True),
            "usesExternalVendorTexture": sum(1 for r in staging_mappings if isinstance(r, dict) and r.get("usesExternalVendorTexture")),
        }
        summary = staging_mapping_report.get("summary", {})
        for key, value in expected.items():
            if summary.get(key) != value:
                add_error(report, f"demos_mapping_staging_report summary {key}={summary.get(key)!r}, expected {value}")

    if not isinstance(asset_report, dict) or "summary" not in asset_report:
        add_error(report, "material_asset_report.json missing summary")

    from material_resolver import resolve_material_request

    entries = demo.get("objects", []) if isinstance(demo, dict) else []
    if not isinstance(entries, list):
        add_error(report, "demo_kitchen_material_test.json objects must be a list")
        entries = []
    for entry in entries:
        if not isinstance(entry, dict):
            add_error(report, "Demo material entry must be an object")
            continue
        request = entry.get("material")
        object_name = entry.get("objectName")
        if not isinstance(object_name, str) or not object_name:
            add_error(report, "Demo material entry missing objectName")
        if not isinstance(request, dict):
            add_error(report, f"Demo material entry {object_name!r} missing material object")
            continue
        try:
            resolve_material_request(request, str(project_root))
            report["demoObjectsChecked"] += 1
        except Exception as exc:
            add_error(report, f"Demo material entry {object_name!r} invalid: {exc}")

    report["ok"] = not report["errors"]
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()
    project_root = Path(args.project_root).resolve()
    report = validate(project_root)
    report_path = project_root / "reports" / "material_validation_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
