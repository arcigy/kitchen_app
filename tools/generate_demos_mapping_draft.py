from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

from prepare_demos_mapping_master_csv import MASTER_COLUMNS, slugify


CORE_FIELDS = {
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
}


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), [dict(row) for row in reader]


def write_csv(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def lower_text(row: dict[str, str]) -> str:
    return " ".join(str(row.get(k, "")) for k in ["displayName", "slug", "vendorSku", "materialType", "decorFamily", "colorFamily", "surfaceHint"]).lower()


def match_keywords(text: str, rules: list[dict[str, Any]]) -> dict[str, Any] | None:
    for rule in rules:
        for keyword in rule.get("keywords", []):
            if str(keyword).lower() in text:
                return rule
    return None


def match_struct(row: dict[str, str], rules: list[dict[str, Any]]) -> dict[str, Any] | None:
    text = lower_text(row)
    for rule in rules:
        if any(str(k).lower() in text for k in rule.get("keywords", [])):
            return rule
        if row.get("decorFamily") and row["decorFamily"] in rule.get("decorFamilies", []):
            return rule
        if row.get("materialType") and row["materialType"] in rule.get("materialTypes", []):
            return rule
    return None


def set_value(row: dict[str, str], key: str, value: Any, *, only_empty: bool, protected: bool) -> bool:
    if protected and key in CORE_FIELDS:
        return False
    if only_empty and not blank(row.get(key)):
        return False
    if value is None:
        return False
    current = row.get(key, "")
    new_value = str(value)
    if current == new_value:
        return False
    row[key] = new_value
    return True


def draft_row(row: dict[str, str], rules: dict[str, Any], *, only_empty: bool, preserve_locked: bool) -> tuple[bool, dict[str, bool]]:
    changed = False
    stats = {"target": False, "color": False}
    locked = str(row.get("mappingLocked", "")).lower() == "true"
    protected = preserve_locked and locked
    text = lower_text(row)
    defaults = rules["defaults"]
    for key in MASTER_COLUMNS:
        row.setdefault(key, "")
    if blank(row.get("vendorDecorId")):
        name = row.get("displayName") or row.get("vendorSku") or "decor"
        changed |= set_value(row, "vendorDecorId", f"demos_{slugify(name)}", only_empty=only_empty, protected=False)
    if blank(row.get("slug")):
        changed |= set_value(row, "slug", slugify(row.get("displayName") or row.get("vendorDecorId") or "decor"), only_empty=only_empty, protected=False)
    changed |= set_value(row, "vendor", row.get("vendor") or defaults["vendor"], only_empty=only_empty, protected=False)

    material_rule = match_keywords(text, rules.get("materialTypeRules", []))
    if material_rule:
        changed |= set_value(row, "materialType", material_rule.get("materialType"), only_empty=only_empty, protected=protected)
        changed |= set_value(row, "decorFamily", material_rule.get("decorFamily"), only_empty=only_empty, protected=protected)
    else:
        changed |= set_value(row, "materialType", "generic", only_empty=only_empty, protected=protected)
        changed |= set_value(row, "decorFamily", "unknown", only_empty=only_empty, protected=protected)

    color_rule = match_keywords(text, rules.get("colorFamilyRules", []))
    changed |= set_value(row, "colorFamily", color_rule.get("colorFamily") if color_rule else "unknown", only_empty=only_empty, protected=protected)
    surface_rule = match_keywords(text, rules.get("surfaceHintRules", []))
    changed |= set_value(row, "surfaceHint", surface_rule.get("surfaceHint") if surface_rule else "unknown", only_empty=only_empty, protected=protected)

    target_rule = match_struct(row, rules.get("targetTemplateRules", []))
    if target_rule:
        changed |= set_value(row, "targetInternalMaterialId", target_rule.get("targetInternalMaterialId"), only_empty=only_empty, protected=protected)
        changed |= set_value(row, "proceduralTemplate", target_rule.get("proceduralTemplate"), only_empty=only_empty, protected=protected)
        stats["target"] = True
    grain_rule = match_struct(row, rules.get("grainPatternRules", []))
    changed |= set_value(row, "grainPatternId", grain_rule.get("grainPatternId") if grain_rule else "generic_noise", only_empty=only_empty, protected=protected)

    profile = "generic_matte"
    for rule in rules.get("surfaceProfileRules", []):
        if rule.get("materialType") == "non_wood" and row.get("materialType") != "wood":
            profile = rule["surfaceProfile"]
        elif rule.get("materialType") == row.get("materialType") and rule.get("surfaceHint") == row.get("surfaceHint"):
            profile = rule["surfaceProfile"]
            break
    changed |= set_value(row, "surfaceProfile", profile, only_empty=only_empty, protected=protected)

    preset = next((r for r in rules.get("colorPresetRules", []) if r.get("colorFamily") == row.get("colorFamily")), None)
    preset = preset or next((r for r in rules.get("colorPresetRules", []) if r.get("colorFamily") == "unknown"), {})
    changed |= set_value(row, "baseColorHex", preset.get("baseColorHex"), only_empty=only_empty, protected=protected)
    changed |= set_value(row, "grainColorHex", preset.get("grainColorHex"), only_empty=only_empty, protected=protected)
    stats["color"] = bool(preset)

    defaults_map = {
        "colorTransformMode": "tint_multiply" if row.get("materialType") == "wood" else "solid_color",
        "tintStrength": 0.35 if row.get("materialType") == "wood" else 1.0,
        "grainContrast": 0.3 if row.get("materialType") == "wood" else 0.0,
        "hueShiftDegrees": 0.0,
        "saturationScale": 1.0,
        "valueScale": 1.0,
        "contrastScale": 1.0,
        "roughnessMultiplier": 1.0,
        "bumpMultiplier": 1.0,
        "grainDepth": 0.25 if row.get("materialType") == "wood" else 0.0,
        "coatMultiplier": 1.0,
        "tileSizeMeters": defaults["tileSizeMeters"],
        "uvScale": defaults["uvScale"],
        "grainDirectionDefault": "vertical" if row.get("materialType") == "wood" else "none",
        "patternRotationDegrees": 0.0,
        "edgeStrategy": "match_grain" if row.get("materialType") == "wood" else "solid_edge",
    }
    for key, value in defaults_map.items():
        changed |= set_value(row, key, value, only_empty=only_empty, protected=protected)

    if not protected:
        row["mappingStatus"] = "needs_review"
        row["mappingLocked"] = "false"
        confidence = 0.35
        if stats["target"] and stats["color"] and row.get("surfaceHint") != "unknown":
            confidence = 0.68
        elif stats["target"] and stats["color"]:
            confidence = 0.55
        elif stats["target"] or stats["color"]:
            confidence = 0.4
        row["confidence"] = str(min(float(row.get("confidence") or confidence), 0.69) if row.get("colorSourceMethod") == "rule_inferred" else confidence)
        row["colorSourceMethod"] = "rule_inferred"
        notes = row.get("notes", "")
        suffix = defaults["notesSuffix"]
        if suffix not in notes:
            row["notes"] = (notes + " " + suffix).strip()
        changed = True
    return changed, stats


def run(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.project_root).resolve()
    input_path = Path(args.input)
    output_path = Path(args.output)
    rules_path = Path(args.rules)
    if not input_path.is_absolute():
        input_path = root / input_path
    if not output_path.is_absolute():
        output_path = root / output_path
    if not rules_path.is_absolute():
        rules_path = root / rules_path
    columns, rows = read_csv(input_path)
    for col in MASTER_COLUMNS:
        if col not in columns:
            columns.append(col)
    if args.limit:
        rows = rows[: args.limit]
    rules = load_json(rules_path)
    changed = preserved = target = color = missing = needs = mapped = 0
    for row in rows:
        if args.preserve_locked and str(row.get("mappingLocked", "")).lower() == "true":
            preserved += 1
        row_changed, stats = draft_row(row, rules, only_empty=args.only_empty, preserve_locked=args.preserve_locked)
        changed += int(row_changed)
        target += int(stats["target"])
        color += int(stats["color"])
        needs += int(row.get("mappingStatus") == "needs_review")
        mapped += int(row.get("mappingStatus") == "mapped")
        if any(not row.get(k) for k in ["vendorDecorId", "targetInternalMaterialId", "surfaceProfile", "baseColorHex", "grainPatternId"]):
            missing += 1
    summary = {
        "dryRun": args.dry_run,
        "rowsProcessed": len(rows),
        "rowsChanged": changed,
        "rowsPreservedLocked": preserved,
        "rowsWithSuggestedTargetInternalMaterialId": target,
        "rowsWithSuggestedColor": color,
        "rowsStillMissingRequiredFields": missing,
        "needs_review": needs,
        "mapped": mapped,
        "warnings": [],
    }
    if not args.dry_run:
        write_csv(output_path, columns, rows)
    report_path = Path(args.report)
    if not report_path.is_absolute():
        report_path = root / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--rules", default="backend/materials/demos_mapping_rules.json")
    parser.add_argument("--preserve-locked", action="store_true")
    parser.add_argument("--only-empty", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", default="backend/materials/reports/demos_mapping_draft_report.json")
    args = parser.parse_args()
    print(json.dumps(run(args), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
