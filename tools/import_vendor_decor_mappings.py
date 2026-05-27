from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any

MATERIALS_MODULE_DIR = Path(__file__).resolve().parents[1] / "backend" / "materials"
if str(MATERIALS_MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MATERIALS_MODULE_DIR))

from demos_mapping_safety import FORBIDDEN_DEMOS_ASSET_FIELDS, is_production_safe_demos_mapping


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
MATERIAL_TYPES = {"wood", "stone", "concrete", "solid", "metal", "generic"}
SURFACE_HINTS = {"raw", "matte", "supermat", "satin", "gloss", "unknown"}
GRAIN_DIRECTIONS = {"vertical", "horizontal", "lengthwise", "none"}
COLOR_MODES = {"none", "tint_multiply", "tint_mix", "solid_color", "hsv_adjust"}
MAPPING_STATUSES = {"mapped", "needs_review", "unmapped"}
COLOR_SOURCE_METHODS = {"physical_sample", "official_swatch", "website_visual_match", "manual_approx", "internal_review", "rule_inferred", "unknown"}
EDGE_STRATEGIES = {"match_base", "match_grain", "solid_edge", "none", "unknown"}
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
FORBIDDEN_VENDOR_ASSET_FIELDS = FORBIDDEN_DEMOS_ASSET_FIELDS


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    text = value.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "decor"


def blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def clean(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return None if value == "" else value
    return value


def parse_float(value: Any, default: float | None = None) -> float | None:
    value = clean(value)
    if value is None:
        return default
    try:
        return float(value)
    except Exception:
        return default


def parse_bool(value: Any, default: bool = False) -> bool:
    value = clean(value)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "y", "locked"}


def manifest_by_id(project_root: Path) -> dict[str, dict[str, Any]]:
    items = load_json(project_root / "backend" / "materials" / "material_manifest.json")
    return {item["id"]: item for item in items if isinstance(item, dict) and isinstance(item.get("id"), str)}


def profiles(project_root: Path) -> dict[str, Any]:
    return load_json(project_root / "backend" / "materials" / "surface_profiles.json")


def infer_surface_profile(material_type: str, surface_hint: str) -> str:
    if material_type != "wood":
        return "generic_matte"
    return {
        "raw": "wood_raw_matte",
        "matte": "wood_standard_matte",
        "supermat": "wood_soft_touch_supermat",
        "satin": "wood_satin_lacquer",
        "gloss": "wood_gloss_laminate",
        "unknown": "wood_standard_matte",
    }.get(surface_hint, "wood_standard_matte")


def color_for_record(record: dict[str, Any]) -> str:
    text = " ".join(str(record.get(k, "")) for k in ["displayName", "decorFamily", "colorFamily", "materialType"]).lower()
    if "black" in text or "dark" in text or "espresso" in text:
        return "#3b261b"
    if "white" in text or "cream" in text:
        return "#f0ece4"
    if "grey" in text or "gray" in text or "concrete" in text or "metal" in text:
        return "#8a8a8a"
    if "beige" in text:
        return "#d8c7aa"
    if "walnut" in text or "orech" in text:
        return "#75482e"
    if "warm" in text:
        return "#c38345"
    if "light" in text:
        return "#d9bd91"
    return "#b98a55" if record.get("materialType") == "wood" else "#c8c2b8"


def grain_color_for(base_hex: str) -> str:
    if not HEX_RE.match(base_hex):
        return "#6f4425"
    r = max(0, int(base_hex[1:3], 16) - 70)
    g = max(0, int(base_hex[3:5], 16) - 70)
    b = max(0, int(base_hex[5:7], 16) - 70)
    return f"#{r:02x}{g:02x}{b:02x}"


def pick_internal_material(record: dict[str, Any], manifest: dict[str, dict[str, Any]]) -> str:
    direct = clean(record.get("targetInternalMaterialId") or record.get("materialId"))
    if isinstance(direct, str) and direct in manifest:
        return direct
    material_type = clean(record.get("materialType"))
    decor = str(record.get("decorFamily", "")).lower()
    color = str(record.get("colorFamily", "")).lower()
    if material_type == "wood":
        if "walnut" in decor or "orech" in decor:
            return "wood_walnut_neutral_template"
        if "deep" in decor or "rustic" in decor:
            return "wood_deep_grain_neutral_template"
        if "fine" in decor:
            return "wood_fine_grain_neutral_template"
        if "subtle" in decor or "cream" in color:
            return "wood_subtle_grain_neutral_template"
        return "wood_oak_neutral_template"
    if material_type == "solid":
        return "solid_color_neutral_template"
    return "generic_neutral_template"


def infer_procedural_template(target_id: str, material_type: str) -> str:
    if target_id.endswith("_template"):
        return target_id.replace("_template", "")
    if material_type == "wood":
        return "wood_oak_neutral"
    if material_type == "solid":
        return "solid_color_neutral"
    return "generic_neutral"


def infer_grain_pattern(record: dict[str, Any], procedural_template: str) -> str:
    value = clean(record.get("grainPatternId"))
    if isinstance(value, str):
        return value
    if procedural_template.startswith("solid") or procedural_template.startswith("generic"):
        return "solid_none" if procedural_template.startswith("solid") else "generic_none"
    decor = str(record.get("decorFamily", "oak")).lower()
    hint = str(record.get("surfaceHint", "")).lower()
    if "walnut" in decor or "orech" in decor:
        return "walnut_medium_grain"
    if "deep" in procedural_template or "rustic" in hint:
        return "oak_rustic_deep_grain"
    if "fine" in procedural_template:
        return "fine_light_linear_grain"
    if "subtle" in procedural_template:
        return "subtle_soft_grain"
    return "oak_medium_grain"


def load_import_records(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows = [dict(row) for row in reader]
            missing = [c for c in MASTER_COLUMNS if c not in (reader.fieldnames or [])]
            if missing and "targetInternalMaterialId" in missing:
                raise ValueError(f"CSV missing required master columns: {', '.join(missing)}")
            return rows
    data = load_json(path)
    records = data.get("records", data) if isinstance(data, dict) else data
    if not isinstance(records, list):
        raise ValueError("Import file must contain a records list")
    return [r for r in records if isinstance(r, dict)]


def catalog_path(project_root: Path, catalog_mode: str) -> Path:
    suffix = "_staging" if catalog_mode == "staging" else ""
    return project_root / "backend" / "materials" / "vendor_catalogs" / f"demos_decor_mappings{suffix}.json"


def load_existing(project_root: Path, catalog_mode: str) -> list[dict[str, Any]]:
    path = catalog_path(project_root, catalog_mode)
    if path.exists():
        data = load_json(path)
        return data if isinstance(data, list) else []
    if catalog_mode == "staging":
        production_path = catalog_path(project_root, "production")
        if production_path.exists():
            data = load_json(production_path)
            return data if isinstance(data, list) else []
    legacy = project_root / "backend" / "materials" / "vendor_catalogs" / "demos_materials.json"
    if not legacy.exists():
        return []
    data = load_json(legacy)
    return data if isinstance(data, list) else []


def normalize_record(raw: dict[str, Any], vendor: str, manifest: dict[str, dict[str, Any]], profile_ids: set[str], existing_ids: set[str], *, existing: bool = False) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    forbidden = FORBIDDEN_VENDOR_ASSET_FIELDS.intersection(raw)
    if forbidden:
        raise ValueError(f"Demos mapping contains forbidden vendor asset fields: {', '.join(sorted(forbidden))}")
    display_name = str(clean(raw.get("displayName")) or clean(raw.get("name")) or clean(raw.get("vendorDecorId")) or "Unnamed Decor")
    slug = str(clean(raw.get("slug")) or slugify(display_name))
    vendor_id = clean(raw.get("vendorDecorId"))
    if not isinstance(vendor_id, str):
        base = f"{vendor}_{slug}"
        vendor_id = base
        suffix = 2
        while vendor_id in existing_ids:
            vendor_id = f"{base}_{suffix:03d}"
            suffix += 1
    existing_ids.add(vendor_id)

    material_type = str(clean(raw.get("materialType")) or "generic")
    if material_type not in MATERIAL_TYPES:
        warnings.append(f"{vendor_id}: invalid materialType {material_type!r}; using generic")
        material_type = "generic"
    surface_hint = str(clean(raw.get("surfaceHint")) or "unknown")
    if surface_hint not in SURFACE_HINTS:
        warnings.append(f"{vendor_id}: invalid surfaceHint {surface_hint!r}; using unknown")
        surface_hint = "unknown"
    target_id = pick_internal_material({**raw, "materialType": material_type}, manifest)
    surface_profile = str(clean(raw.get("surfaceProfile")) or infer_surface_profile(material_type, surface_hint))
    if surface_profile not in profile_ids:
        warnings.append(f"{vendor_id}: unknown surfaceProfile {surface_profile!r}; using generic_matte")
        surface_profile = "generic_matte"
    procedural_template = str(clean(raw.get("proceduralTemplate")) or infer_procedural_template(target_id, material_type))
    grain_pattern_id = infer_grain_pattern(raw, procedural_template)
    base_hex = str(clean(raw.get("baseColorHex")) or clean(raw.get("colorPreviewHex")) or color_for_record({"materialType": material_type, **raw}))
    if not HEX_RE.match(base_hex):
        warnings.append(f"{vendor_id}: invalid baseColorHex; using #b98a55")
        base_hex = "#b98a55"
    grain_hex = clean(raw.get("grainColorHex")) or grain_color_for(base_hex)
    secondary_hex = clean(raw.get("secondaryColorHex"))
    edge_hex = clean(raw.get("edgeColorHex"))
    mode = str(clean(raw.get("colorTransformMode")) or (raw.get("colorTransform", {}) or {}).get("mode") or ("tint_multiply" if material_type == "wood" else "solid_color"))
    if mode not in COLOR_MODES:
        warnings.append(f"{vendor_id}: invalid colorTransformMode {mode!r}; using tint_multiply")
        mode = "tint_multiply"
    tile = parse_float(raw.get("tileSizeMeters"), 0.4) or 0.4
    uv = parse_float(raw.get("uvScale"), None)
    expected_uv = 1.0 / tile
    if uv is None:
        uv = expected_uv
    elif abs(uv - expected_uv) >= 0.001:
        warnings.append(f"{vendor_id}: tileSizeMeters and uvScale mismatch; uvScale recalculated")
        uv = expected_uv
    grain_direction = str(clean(raw.get("grainDirectionDefault")) or ("vertical" if material_type == "wood" else "none"))
    if grain_direction not in GRAIN_DIRECTIONS:
        warnings.append(f"{vendor_id}: invalid grainDirectionDefault; using none")
        grain_direction = "none"
    status = str(clean(raw.get("mappingStatus")) or "needs_review")
    if status not in MAPPING_STATUSES:
        status = "needs_review"
    locked = parse_bool(raw.get("mappingLocked"), False)
    confidence = parse_float(raw.get("confidence"), 0.0) or 0.0
    if existing and ("mappingLocked" not in raw or "proceduralTemplate" not in raw or "grainPatternId" not in raw):
        status = "needs_review"
        locked = False
        confidence = min(confidence, 0.6)
    color_source_method = str(clean(raw.get("colorSourceMethod")) or "unknown")
    if color_source_method not in COLOR_SOURCE_METHODS:
        color_source_method = "unknown"
    edge_strategy = str(clean(raw.get("edgeStrategy")) or "unknown")
    if edge_strategy not in EDGE_STRATEGIES:
        edge_strategy = "unknown"

    roughness_override = parse_float(raw.get("roughnessOverride"), None)
    record = {
        "vendor": vendor,
        "vendorDecorId": vendor_id,
        "vendorSku": clean(raw.get("vendorSku")),
        "displayName": display_name,
        "slug": slug,
        "materialType": material_type,
        "decorFamily": clean(raw.get("decorFamily")) or material_type,
        "colorFamily": clean(raw.get("colorFamily")) or "unknown",
        "surfaceHint": surface_hint,
        "targetInternalMaterialId": target_id,
        "proceduralTemplate": procedural_template,
        "grainPatternId": grain_pattern_id,
        "surfaceProfile": surface_profile,
        "colorTransform": {
            "mode": mode,
            "baseColorHex": base_hex,
            "grainColorHex": grain_hex,
            "secondaryColorHex": secondary_hex,
            "tintStrength": parse_float(raw.get("tintStrength"), 0.35 if material_type == "wood" else 1.0),
            "grainContrast": parse_float(raw.get("grainContrast"), 0.3 if material_type == "wood" else 0.0),
            "hueShiftDegrees": parse_float(raw.get("hueShiftDegrees"), 0.0),
            "saturationScale": parse_float(raw.get("saturationScale"), 1.0),
            "valueScale": parse_float(raw.get("valueScale"), 1.0),
            "contrastScale": parse_float(raw.get("contrastScale"), 1.0),
        },
        "roughnessMultiplier": parse_float(raw.get("roughnessMultiplier"), 1.0),
        "roughnessOverride": roughness_override,
        "bumpMultiplier": parse_float(raw.get("bumpMultiplier"), 1.0),
        "grainDepth": parse_float(raw.get("grainDepth"), 0.25 if material_type == "wood" else 0.0),
        "coatMultiplier": parse_float(raw.get("coatMultiplier"), 1.0),
        "tileSizeMeters": tile,
        "uvScale": uv,
        "grainDirectionDefault": grain_direction,
        "patternRotationDegrees": parse_float(raw.get("patternRotationDegrees"), 0.0),
        "edgeStrategy": edge_strategy,
        "edgeColorHex": edge_hex,
        "mappingStatus": status,
        "mappingLocked": locked,
        "confidence": confidence,
        "colorSourceMethod": color_source_method,
        "sourceReference": clean(raw.get("sourceReference")),
        "reviewedBy": clean(raw.get("reviewedBy")),
        "reviewedAt": clean(raw.get("reviewedAt")),
        "usesExternalVendorTexture": False,
        "notes": clean(raw.get("notes")) or "No Demos texture used.",
    }

    if target_id not in manifest:
        record["mappingStatus"] = "unmapped"
        warnings.append(f"{vendor_id}: targetInternalMaterialId {target_id!r} does not exist")
    if record["mappingStatus"] == "mapped":
        required = ["targetInternalMaterialId", "surfaceProfile", "grainPatternId"]
        missing = [key for key in required if blank(record.get(key))]
        if not locked:
            missing.append("mappingLocked=true")
        if confidence < 0.7:
            missing.append("confidence>=0.7")
        if blank(record["colorTransform"].get("baseColorHex")):
            missing.append("baseColorHex")
        if missing:
            raise ValueError(f"{vendor_id}: mapped record is missing approved fields: {', '.join(missing)}")
        if record["colorSourceMethod"] == "rule_inferred":
            raise ValueError(f"{vendor_id}: rule_inferred records cannot be mapped")
    if record["colorSourceMethod"] == "rule_inferred":
        record["mappingStatus"] = "needs_review"
        record["mappingLocked"] = False
        record["confidence"] = min(float(record["confidence"]), 0.69)
    return record, warnings


def build_mapping_report(records: list[dict[str, Any]], manifest: dict[str, dict[str, Any]], warnings: list[str], *, catalog_mode: str, skipped_not_safe: int = 0) -> dict[str, Any]:
    mapped = [r for r in records if r.get("mappingStatus") == "mapped"]
    needs = [r for r in records if r.get("mappingStatus") == "needs_review"]
    unmapped = [r for r in records if r.get("mappingStatus") == "unmapped"]
    unlocked_mapped = [r for r in mapped if not r.get("mappingLocked")]
    low_confidence = [r for r in mapped if float(r.get("confidence", 0.0) or 0.0) < 0.7]
    rule_inferred_mapped = [r for r in mapped if r.get("colorSourceMethod") == "rule_inferred"]
    non_neutral = [r for r in mapped if not manifest.get(str(r.get("targetInternalMaterialId")), {}).get("allowVendorMapping")]
    external = [r for r in records if r.get("usesExternalVendorTexture")]
    safety = [(r, is_production_safe_demos_mapping(r, manifest)) for r in records]
    production_safe = [r for r, (ok, _reasons) in safety if ok]
    non_safe = [
        {
            "vendorDecorId": r.get("vendorDecorId"),
            "displayName": r.get("displayName"),
            "mappingStatus": r.get("mappingStatus"),
            "reasons": reasons,
        }
        for r, (ok, reasons) in safety
        if not ok
    ]
    base_summary = {
        "total": len(records),
        "productionSafe": len(production_safe),
        "mapped": len(mapped),
        "needs_review": len(needs),
        "unmapped": len(unmapped),
        "locked": sum(1 for r in records if r.get("mappingLocked")),
        "unlocked": sum(1 for r in records if not r.get("mappingLocked")),
        "usesExternalVendorTexture": len(external),
    }
    if catalog_mode == "production":
        base_summary["skippedNotProductionSafe"] = skipped_not_safe
    else:
        base_summary["needsHumanReview"] = sum(
            1
            for r in records
            if r.get("mappingStatus") == "needs_review" or (not r.get("mappingLocked") and r.get("mappingStatus") != "unmapped")
        )
        base_summary["ruleInferred"] = sum(1 for r in records if r.get("colorSourceMethod") == "rule_inferred")
    return {
        "catalogMode": catalog_mode,
        "summary": base_summary,
        "mapped": mapped,
        "needsReview": needs,
        "unmapped": unmapped,
        "unlockedMapped": unlocked_mapped,
        "lowConfidenceMapped": low_confidence,
        "ruleInferredMapped": rule_inferred_mapped,
        "nonNeutralTargets": non_neutral,
        "nonProductionSafe": non_safe,
        "warnings": warnings,
    }


def update_frontend_catalog(project_root: Path, mappings: list[dict[str, Any]], *, catalog_mode: str) -> None:
    path = project_root / "backend" / "materials" / ("material_frontend_catalog_staging.json" if catalog_mode == "staging" else "material_frontend_catalog.json")
    base_path = project_root / "backend" / "materials" / "material_frontend_catalog.json"
    catalog = load_json(base_path) if base_path.exists() else []
    base_entries = [e for e in catalog if not (isinstance(e, dict) and e.get("catalogType") in {"vendorDecor", "demosDecorMapping"})]
    mapping_entries = []
    for record in mappings:
        transform = record.get("colorTransform", {}) if isinstance(record.get("colorTransform"), dict) else {}
        production_safe, _reasons = is_production_safe_demos_mapping(record)
        mapping_entries.append({
            "catalogType": "demosDecorMapping",
            "vendor": record.get("vendor"),
            "vendorDecorId": record.get("vendorDecorId"),
            "displayName": record.get("displayName"),
            "materialType": record.get("materialType"),
            "decorFamily": record.get("decorFamily"),
            "colorFamily": record.get("colorFamily"),
            "surfaceHint": record.get("surfaceHint"),
            "targetInternalMaterialId": record.get("targetInternalMaterialId"),
            "proceduralTemplate": record.get("proceduralTemplate"),
            "grainPatternId": record.get("grainPatternId"),
            "surfaceProfile": record.get("surfaceProfile"),
            "colorPreviewHex": transform.get("baseColorHex"),
            "grainColorHex": transform.get("grainColorHex"),
            "tintStrength": transform.get("tintStrength"),
            "grainContrast": transform.get("grainContrast"),
            "tileSizeMeters": record.get("tileSizeMeters"),
            "grainDirectionDefault": record.get("grainDirectionDefault"),
            "mappingStatus": record.get("mappingStatus"),
            "mappingLocked": record.get("mappingLocked"),
            "confidence": record.get("confidence"),
            "productionSafe": production_safe,
            "usesExternalVendorTexture": False,
        })
    write_json(path, base_entries + mapping_entries)


def run(args: argparse.Namespace) -> dict[str, Any]:
    project_root = Path(args.project_root).resolve()
    manifest = manifest_by_id(project_root)
    profile_ids = set(profiles(project_root))
    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = project_root / input_path
    existing_raw = load_existing(project_root, args.catalog_mode)
    warnings: list[str] = []
    existing_ids: set[str] = set()
    by_id: dict[str, dict[str, Any]] = {}
    for raw in existing_raw:
        try:
            record, record_warnings = normalize_record(raw, args.vendor, manifest, profile_ids, existing_ids, existing=True)
            by_id[record["vendorDecorId"]] = record
            warnings.extend(record_warnings)
        except Exception as exc:
            warnings.append(f"existing record skipped: {exc}")

    raw_records = load_import_records(input_path)
    if args.limit:
        raw_records = raw_records[: args.limit]
    inserted = updated = skipped = skipped_locked = skipped_not_safe = 0
    skipped_not_safe_ids: set[str] = set()
    imported_ids: list[str] = []
    for raw in raw_records:
        try:
            incoming_id = clean(raw.get("vendorDecorId"))
            existing_record = by_id.get(incoming_id) if isinstance(incoming_id, str) else None
            if existing_record and existing_record.get("mappingLocked") and not args.allow_update_locked:
                skipped_locked += 1
                warnings.append(f"{incoming_id}: skipped locked mapping")
                continue
            record, record_warnings = normalize_record(raw, args.vendor, manifest, profile_ids, set(by_id))
            warnings.extend(record_warnings)
            if record["mappingStatus"] == "unmapped" and args.fail_on_unmapped:
                raise ValueError(f"{record['vendorDecorId']}: unmapped")
            if args.catalog_mode == "production":
                safe, reasons = is_production_safe_demos_mapping(record, manifest, profile_ids)
                if not safe:
                    skipped_not_safe += 1
                    skipped_not_safe_ids.add(str(record["vendorDecorId"]))
                    warnings.append(f"{record['vendorDecorId']}: skipped non-production-safe mapping ({'; '.join(reasons)})")
                    continue
            if record["vendorDecorId"] in by_id:
                updated += 1
            else:
                inserted += 1
            by_id[record["vendorDecorId"]] = record
            imported_ids.append(record["vendorDecorId"])
        except Exception as exc:
            skipped += 1
            warnings.append(str(exc))

    all_records = sorted(by_id.values(), key=lambda r: str(r.get("vendorDecorId")))
    existing_not_safe = 0
    if args.catalog_mode == "production":
        production_records = []
        for record in all_records:
            safe, reasons = is_production_safe_demos_mapping(record, manifest, profile_ids)
            if safe:
                production_records.append(record)
            else:
                if str(record.get("vendorDecorId")) not in skipped_not_safe_ids:
                    existing_not_safe += 1
                if record.get("vendorDecorId") not in imported_ids:
                    warnings.append(f"{record.get('vendorDecorId')}: removed from production catalog ({'; '.join(reasons)})")
        all_records = production_records
    skipped_not_safe += existing_not_safe
    report = build_mapping_report(all_records, manifest, warnings, catalog_mode=args.catalog_mode, skipped_not_safe=skipped_not_safe)
    summary = {
        "dryRun": bool(args.dry_run),
        "catalogMode": args.catalog_mode,
        "input": str(input_path),
        "imported": len(imported_ids),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "skippedLocked": skipped_locked,
        "skippedNotProductionSafe": skipped_not_safe,
        "productionSafe": report["summary"]["productionSafe"],
        "mapped": report["summary"]["mapped"],
        "needs_review": report["summary"]["needs_review"],
        "unmapped": report["summary"]["unmapped"],
        "locked": report["summary"]["locked"],
        "unlocked": report["summary"]["unlocked"],
        "warnings": warnings,
        "importedVendorDecorIds": imported_ids,
    }
    if not args.dry_run:
        write_json(catalog_path(project_root, args.catalog_mode), all_records)
        report_name = "demos_mapping_staging_report.json" if args.catalog_mode == "staging" else "demos_mapping_report.json"
        write_json(project_root / "backend" / "materials" / report_name, report)
        update_frontend_catalog(project_root, all_records, catalog_mode=args.catalog_mode)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--vendor", default="demos")
    parser.add_argument("--input", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fail-on-unmapped", action="store_true")
    parser.add_argument("--respect-locked", action="store_true")
    parser.add_argument("--allow-update-locked", action="store_true")
    parser.add_argument("--catalog-mode", choices=["production", "staging"], default="production")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    summary = run(args)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if summary["skipped"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
