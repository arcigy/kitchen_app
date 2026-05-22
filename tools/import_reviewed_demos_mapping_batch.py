from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from pathlib import Path
from typing import Any

from prepare_demos_mapping_master_csv import MASTER_COLUMNS


REVIEW_ACTIONS = {"approve", "edit", "keep_needs_review", "reject", ""}
REQUIRED_FOR_APPROVAL = ["targetInternalMaterialId", "surfaceProfile", "grainPatternId", "baseColorHex", "tileSizeMeters", "uvScale"]
REVIEW_COLUMNS = {"reviewAction", "reviewComment"}


def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames or []), [dict(row) for row in reader]


def write_csv(path: Path, columns: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clean_columns = [col for col in columns if col not in REVIEW_COLUMNS]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=clean_columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "locked"}


def ensure_float_at_least(value: str, minimum: float) -> str:
    try:
        return str(max(float(value), minimum))
    except Exception:
        return str(minimum)


def merge_reviewed(master_path: Path, reviewed_path: Path, output_path: Path, reviewed_by: str, *, lock_approved: bool, dry_run: bool, allow_update_locked: bool) -> dict[str, Any]:
    master_columns, master_rows = read_csv(master_path)
    reviewed_columns, reviewed_rows = read_csv(reviewed_path)
    columns = list(master_columns)
    for col in MASTER_COLUMNS:
        if col not in columns:
            columns.append(col)
    reviewed_by_id = {row.get("vendorDecorId", ""): row for row in reviewed_rows if row.get("vendorDecorId")}
    today = date.today().isoformat()
    summary = {
        "masterRows": len(master_rows),
        "reviewedRows": len(reviewed_rows),
        "approved": 0,
        "edited": 0,
        "keptNeedsReview": 0,
        "rejected": 0,
        "noAction": 0,
        "skippedLocked": 0,
        "errors": [],
        "dryRun": dry_run,
    }
    for row in master_rows:
        reviewed = reviewed_by_id.get(row.get("vendorDecorId", ""))
        if not reviewed:
            continue
        action = reviewed.get("reviewAction", "").strip()
        if action not in REVIEW_ACTIONS:
            summary["errors"].append(f"{row.get('vendorDecorId')}: invalid reviewAction {action!r}")
            continue
        if not action:
            summary["noAction"] += 1
            continue
        if truthy(row.get("mappingLocked")) and not allow_update_locked:
            summary["skippedLocked"] += 1
            continue
        if action == "approve":
            missing = [key for key in REQUIRED_FOR_APPROVAL if not reviewed.get(key)]
            if missing:
                summary["errors"].append(f"{row.get('vendorDecorId')}: cannot approve, missing {', '.join(missing)}")
                continue
            for col in columns:
                if col in REVIEW_COLUMNS:
                    continue
                if col in reviewed:
                    row[col] = reviewed.get(col, "")
            row["mappingStatus"] = "mapped"
            if lock_approved:
                row["mappingLocked"] = "true"
            row["confidence"] = ensure_float_at_least(row.get("confidence", ""), 0.7)
            row["reviewedBy"] = reviewed_by
            row["reviewedAt"] = today
            note = row.get("notes", "")
            suffix = "Approved in review batch. No Demos texture used."
            if suffix not in note:
                row["notes"] = (note + " " + suffix).strip()
            summary["approved"] += 1
        elif action == "edit":
            for col in columns:
                if col in REVIEW_COLUMNS:
                    continue
                if col in reviewed:
                    row[col] = reviewed.get(col, "")
            summary["edited"] += 1
        elif action == "keep_needs_review":
            row["mappingStatus"] = "needs_review"
            row["mappingLocked"] = "false"
            summary["keptNeedsReview"] += 1
        elif action == "reject":
            row["mappingStatus"] = "unmapped"
            row["mappingLocked"] = "false"
            summary["rejected"] += 1
    if not dry_run and not summary["errors"]:
        write_csv(output_path, columns, master_rows)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--master", required=True)
    parser.add_argument("--reviewed", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--reviewed-by", required=True)
    parser.add_argument("--lock-approved", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-update-locked", action="store_true")
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    master = Path(args.master)
    reviewed = Path(args.reviewed)
    output = Path(args.output)
    if not master.is_absolute():
        master = root / master
    if not reviewed.is_absolute():
        reviewed = root / reviewed
    if not output.is_absolute():
        output = root / output
    summary = merge_reviewed(
        master,
        reviewed,
        output,
        args.reviewed_by,
        lock_approved=args.lock_approved,
        dry_run=args.dry_run,
        allow_update_locked=args.allow_update_locked,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
