from __future__ import annotations

import argparse
import csv
import json
import re
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


def slugify(value: str) -> str:
    text = value.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "decor"


def first_value(row: dict[str, str], keys: list[str]) -> str:
    lower = {k.lower(): v for k, v in row.items()}
    for key in keys:
        value = lower.get(key.lower())
        if value:
            return value.strip()
    return ""


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), [dict(row) for row in reader]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def prepare(input_path: Path, output_path: Path) -> dict[str, Any]:
    original_columns, rows = read_csv(input_path)
    output_columns = list(original_columns)
    for col in MASTER_COLUMNS:
        if col not in output_columns:
            output_columns.append(col)
    had_vendor_id = 0
    generated_vendor_id = 0
    mapped = needs_review = locked = 0
    used_ids: set[str] = set()
    for index, row in enumerate(rows, start=1):
        for col in MASTER_COLUMNS:
            row.setdefault(col, "")
        if not row.get("vendor"):
            row["vendor"] = "demos"
        if row.get("vendorDecorId"):
            had_vendor_id += 1
            vendor_id = row["vendorDecorId"].strip()
        else:
            name = first_value(row, ["displayName", "name", "title", "decorName", "vendorSku", "sku"]) or f"row-{index}"
            vendor_id = f"demos_{slugify(name)}"
            suffix = 2
            while vendor_id in used_ids:
                vendor_id = f"demos_{slugify(name)}_{suffix:03d}"
                suffix += 1
            row["vendorDecorId"] = vendor_id
            generated_vendor_id += 1
        used_ids.add(vendor_id)
        if not row.get("displayName"):
            row["displayName"] = first_value(row, ["name", "title", "decorName", "vendorSku", "sku"]) or vendor_id
        if not row.get("vendorSku"):
            row["vendorSku"] = first_value(row, ["sku", "code", "productCode"])
        if not row.get("slug"):
            row["slug"] = slugify(row.get("displayName") or vendor_id)
        if not row.get("tileSizeMeters"):
            row["tileSizeMeters"] = "0.4"
        if not row.get("uvScale"):
            try:
                row["uvScale"] = str(1.0 / float(row["tileSizeMeters"]))
            except Exception:
                row["uvScale"] = "2.5"
        if not row.get("mappingStatus"):
            row["mappingStatus"] = "needs_review"
        if not row.get("mappingLocked"):
            row["mappingLocked"] = "false"
        if not row.get("confidence"):
            row["confidence"] = "0.0"
        if row["mappingStatus"] == "mapped":
            mapped += 1
        if row["mappingStatus"] == "needs_review":
            needs_review += 1
        if str(row["mappingLocked"]).lower() == "true":
            locked += 1
    write_csv(output_path, output_columns, rows)
    return {
        "rows": len(rows),
        "hadVendorDecorId": had_vendor_id,
        "generatedVendorDecorId": generated_vendor_id,
        "needs_review": needs_review,
        "mapped": mapped,
        "locked": locked,
        "output": str(output_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    input_path = Path(args.input)
    output_path = Path(args.output)
    if not input_path.is_absolute():
        input_path = root / input_path
    if not output_path.is_absolute():
        output_path = root / output_path
    summary = prepare(input_path, output_path)
    report_path = root / "reports" / "prepare_demos_mapping_master_csv_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
