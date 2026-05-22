from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from prepare_demos_mapping_master_csv import MASTER_COLUMNS


MATERIAL_TYPES = {"wood", "stone", "concrete", "solid", "metal", "generic"}
SURFACE_HINTS = {"raw", "matte", "supermat", "satin", "gloss", "unknown"}
COLOR_MODES = {"none", "tint_multiply", "tint_mix", "solid_color", "hsv_adjust"}
MAPPING_STATUSES = {"mapped", "needs_review", "unmapped"}
COLOR_SOURCE_METHODS = {
    "physical_sample",
    "official_swatch",
    "website_visual_match",
    "manual_approx",
    "internal_review",
    "rule_inferred",
    "unknown",
}
GRAIN_DIRECTIONS = {"vertical", "horizontal", "lengthwise", "none"}
EDGE_STRATEGIES = {"match_base", "match_grain", "solid_edge", "none", "unknown"}
FORBIDDEN_FIELDS = {
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


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), [dict(row) for row in reader]


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["row", "vendorDecorId", "severity", "code", "message"]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "locked"}


def as_float(value: Any) -> float | None:
    if blank(value):
        return None
    try:
        return float(str(value).strip())
    except Exception:
        return None


def valid_hex(value: Any, allow_empty: bool = True) -> bool:
    if blank(value):
        return allow_empty
    return HEX_RE.match(str(value).strip()) is not None


def add_issue(issues: list[dict[str, Any]], row_index: int, row: dict[str, str], severity: str, code: str, message: str) -> None:
    issues.append(
        {
            "row": row_index,
            "vendorDecorId": row.get("vendorDecorId", ""),
            "severity": severity,
            "code": code,
            "message": message,
        }
    )


def row_has_error(issues_by_row: dict[int, list[dict[str, Any]]], row_index: int) -> bool:
    return any(issue["severity"] == "error" for issue in issues_by_row.get(row_index, []))


def audit(project_root: Path, input_path: Path) -> dict[str, Any]:
    columns, rows = read_csv(input_path)
    materials_dir = project_root / "backend" / "materials"
    manifest = {
        item["id"]: item
        for item in load_json(materials_dir / "material_manifest.json")
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    profiles = load_json(materials_dir / "surface_profiles.json")
    profile_ids = set(profiles if isinstance(profiles, dict) else {})
    issues: list[dict[str, Any]] = []
    missing_columns = [col for col in MASTER_COLUMNS if col not in columns]
    for col in missing_columns:
        add_issue(issues, 0, {}, "error", "missing_column", f"Missing master CSV column {col}")

    ids = Counter(row.get("vendorDecorId", "") for row in rows if not blank(row.get("vendorDecorId")))
    distributions: dict[str, Counter[str]] = defaultdict(Counter)
    for index, row in enumerate(rows, start=2):
        for key in [
            "materialType",
            "decorFamily",
            "colorFamily",
            "surfaceHint",
            "targetInternalMaterialId",
            "grainPatternId",
            "surfaceProfile",
            "colorSourceMethod",
            "mappingStatus",
        ]:
            distributions[key][row.get(key, "") or "(blank)"] += 1
        decor_id = row.get("vendorDecorId", "")
        status = row.get("mappingStatus", "")
        locked = truthy(row.get("mappingLocked"))
        confidence = as_float(row.get("confidence")) or 0.0
        target_id = row.get("targetInternalMaterialId", "")

        if blank(decor_id):
            add_issue(issues, index, row, "error", "missing_vendorDecorId", "Missing vendorDecorId")
        elif ids[decor_id] > 1:
            add_issue(issues, index, row, "error", "duplicate_vendorDecorId", "Duplicate vendorDecorId")
        if blank(row.get("displayName")):
            add_issue(issues, index, row, "error", "missing_displayName", "Missing displayName")
        if row.get("materialType") not in MATERIAL_TYPES:
            add_issue(issues, index, row, "error", "invalid_materialType", "Invalid materialType")
        if row.get("surfaceHint") not in SURFACE_HINTS:
            add_issue(issues, index, row, "error", "invalid_surfaceHint", "Invalid surfaceHint")
        if status not in MAPPING_STATUSES:
            add_issue(issues, index, row, "error", "invalid_mappingStatus", "Invalid mappingStatus")
        if row.get("colorTransformMode") not in COLOR_MODES:
            add_issue(issues, index, row, "error", "invalid_colorTransformMode", "Invalid colorTransformMode")
        if row.get("grainDirectionDefault") not in GRAIN_DIRECTIONS:
            add_issue(issues, index, row, "error", "invalid_grainDirectionDefault", "Invalid grainDirectionDefault")
        if row.get("edgeStrategy") and row.get("edgeStrategy") not in EDGE_STRATEGIES:
            add_issue(issues, index, row, "error", "invalid_edgeStrategy", "Invalid edgeStrategy")
        if row.get("colorSourceMethod") not in COLOR_SOURCE_METHODS:
            add_issue(issues, index, row, "error", "invalid_colorSourceMethod", "Invalid colorSourceMethod")
        for key in ["baseColorHex", "grainColorHex", "secondaryColorHex", "edgeColorHex"]:
            if not valid_hex(row.get(key)):
                add_issue(issues, index, row, "error", "invalid_hex", f"{key} must be #RRGGBB when filled")
        tile = as_float(row.get("tileSizeMeters"))
        uv = as_float(row.get("uvScale"))
        if tile is None or tile <= 0 or uv is None or uv <= 0:
            add_issue(issues, index, row, "error", "invalid_scale", "tileSizeMeters and uvScale must be positive numbers")
        elif abs(uv - 1.0 / tile) >= 0.001:
            add_issue(issues, index, row, "error", "scale_mismatch", "uvScale must equal 1 / tileSizeMeters")
        forbidden = sorted(set(columns).intersection(FORBIDDEN_FIELDS))
        if forbidden:
            add_issue(issues, index, row, "error", "forbidden_asset_fields", f"Forbidden Demos asset fields present: {', '.join(forbidden)}")
        if str(row.get("usesExternalVendorTexture", "false")).strip().lower() not in {"", "false", "0", "no"}:
            add_issue(issues, index, row, "error", "external_vendor_texture", "usesExternalVendorTexture must be false")
        if target_id and target_id not in manifest:
            add_issue(issues, index, row, "error", "invalid_target", "targetInternalMaterialId does not exist")
        if target_id in manifest and manifest[target_id].get("allowVendorMapping") is not True:
            add_issue(issues, index, row, "error", "target_not_allowed", "target material does not allow vendor mapping")
        if row.get("surfaceProfile") and row.get("surfaceProfile") not in profile_ids:
            add_issue(issues, index, row, "error", "invalid_surfaceProfile", "surfaceProfile does not exist")
        if row.get("colorSourceMethod") == "rule_inferred" and (status == "mapped" or locked or confidence >= 0.7):
            add_issue(issues, index, row, "error", "rule_inferred_promoted", "rule_inferred rows must stay needs_review, unlocked, confidence < 0.7")
        if status == "mapped":
            if not locked:
                add_issue(issues, index, row, "error", "mapped_unlocked", "Mapped row must be locked")
            if confidence < 0.7:
                add_issue(issues, index, row, "error", "mapped_low_confidence", "Mapped row must have confidence >= 0.7")
            if row.get("colorSourceMethod") == "rule_inferred":
                add_issue(issues, index, row, "error", "mapped_rule_inferred", "Mapped row cannot use rule_inferred")
            for key in ["baseColorHex", "grainPatternId", "targetInternalMaterialId", "surfaceProfile"]:
                if blank(row.get(key)):
                    add_issue(issues, index, row, "error", f"mapped_missing_{key}", f"Mapped row missing {key}")

    issues_by_row: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for issue in issues:
        issues_by_row[int(issue["row"])].append(issue)

    mapped = [row for row in rows if row.get("mappingStatus") == "mapped"]
    needs_review = [row for row in rows if row.get("mappingStatus") == "needs_review"]
    unmapped = [row for row in rows if row.get("mappingStatus") == "unmapped"]
    locked_count = sum(1 for row in rows if truthy(row.get("mappingLocked")))
    ready_for_import = 0
    production_safe = 0
    invalid_rows = set(issue["row"] for issue in issues if issue["severity"] == "error" and issue["row"])
    for index, row in enumerate(rows, start=2):
        if row.get("mappingStatus") == "mapped" and truthy(row.get("mappingLocked")) and (as_float(row.get("confidence")) or 0) >= 0.7 and not row_has_error(issues_by_row, index):
            ready_for_import += 1
            production_safe += 1
    needs_human_review = sum(
        1
        for row in rows
        if row.get("mappingStatus") == "needs_review" or (not truthy(row.get("mappingLocked")) and row.get("mappingStatus") != "unmapped")
    )
    summary = {
        "rows": len(rows),
        "mapped": len(mapped),
        "needs_review": len(needs_review),
        "unmapped": len(unmapped),
        "locked": locked_count,
        "unlocked": len(rows) - locked_count,
        "mappedButUnlocked": sum(1 for row in mapped if not truthy(row.get("mappingLocked"))),
        "mappedLowConfidence": sum(1 for row in mapped if (as_float(row.get("confidence")) or 0) < 0.7),
        "mappedMissingBaseColorHex": sum(1 for row in mapped if blank(row.get("baseColorHex"))),
        "mappedMissingGrainPatternId": sum(1 for row in mapped if blank(row.get("grainPatternId"))),
        "mappedMissingTargetInternalMaterialId": sum(1 for row in mapped if blank(row.get("targetInternalMaterialId"))),
        "mappedMissingSurfaceProfile": sum(1 for row in mapped if blank(row.get("surfaceProfile"))),
        "duplicateVendorDecorId": sum(1 for _id, count in ids.items() if count > 1),
        "forbiddenAssetFields": len(set(columns).intersection(FORBIDDEN_FIELDS)),
        "readyForImport": ready_for_import,
        "needsHumanReview": needs_human_review,
        "invalid": len(invalid_rows),
        "productionSafe": production_safe,
    }
    return {
        "input": str(input_path),
        "summary": summary,
        "distributions": {key: dict(counter) for key, counter in distributions.items()},
        "issues": issues,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-json")
    parser.add_argument("--output-csv")
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = root / input_path
    report = audit(root, input_path)
    out_dir = root / "backend" / "materials" / "reports"
    json_path = Path(args.output_json) if args.output_json else out_dir / "demos_mapping_master_audit.json"
    csv_path = Path(args.output_csv) if args.output_csv else out_dir / "demos_mapping_master_audit.csv"
    if not json_path.is_absolute():
        json_path = root / json_path
    if not csv_path.is_absolute():
        csv_path = root / csv_path
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_csv(csv_path, report["issues"])
    print(json.dumps(report["summary"], indent=2, ensure_ascii=False))
    return 0 if report["summary"]["invalid"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
