from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from prepare_demos_mapping_master_csv import MASTER_COLUMNS


REVIEW_COLUMNS = ["reviewAction", "reviewComment"]
REQUIRED_FOR_MAPPED = ["targetInternalMaterialId", "surfaceProfile", "grainPatternId", "baseColorHex", "tileSizeMeters", "uvScale"]


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


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "locked"}


def needs_review(row: dict[str, str]) -> bool:
    return (
        row.get("mappingStatus") == "needs_review"
        or not truthy(row.get("mappingLocked"))
        or any(not row.get(key) for key in REQUIRED_FOR_MAPPED)
    )


def export_batches(input_path: Path, output_dir: Path, batch_size: int) -> dict[str, Any]:
    columns, rows = read_csv(input_path)
    output_columns = list(columns)
    for column in MASTER_COLUMNS:
        if column not in output_columns:
            output_columns.append(column)
    for column in REVIEW_COLUMNS:
        if column not in output_columns:
            output_columns.append(column)
    selected = [row for row in rows if needs_review(row)]
    selected.sort(key=lambda row: (
        row.get("materialType", ""),
        row.get("decorFamily", ""),
        row.get("colorFamily", ""),
        row.get("surfaceHint", ""),
        row.get("displayName", ""),
    ))
    files: list[str] = []
    for start in range(0, len(selected), batch_size):
        batch = selected[start : start + batch_size]
        for row in batch:
            row.setdefault("reviewAction", "")
            row.setdefault("reviewComment", "")
        end = start + batch_size - 1
        path = output_dir / f"demos_review_batch_{start:04d}_{end:04d}.csv"
        write_csv(path, output_columns, batch)
        files.append(str(path))
    return {
        "inputRows": len(rows),
        "reviewRows": len(selected),
        "batchSize": batch_size,
        "batchFiles": files,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    if not input_path.is_absolute():
        input_path = root / input_path
    if not output_dir.is_absolute():
        output_dir = root / output_dir
    summary = export_batches(input_path, output_dir, args.batch_size)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
