from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


def resolve(root: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else root / path


def run_cmd(root: Path, args: list[str], dry_run: bool = False) -> dict[str, Any]:
    if dry_run:
        return {"command": args, "returncode": 0, "stdout": "", "stderr": "", "dryRun": True}
    proc = subprocess.run(args, cwd=root, text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(args)}\n{proc.stdout}\n{proc.stderr}")
    return {"command": args, "returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}


def slice_csv(input_path: Path, output_path: Path, offset: int, limit: int) -> int:
    with input_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = [dict(row) for row in reader]
        fieldnames = list(reader.fieldnames or [])
    selected = rows[offset : offset + limit]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(selected)
    return len(selected)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-blender", action="store_true")
    parser.add_argument("--reviewed-by", default="Laube")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    input_path = resolve(root, args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Pilot input CSV not found: {input_path}")

    start = args.offset
    end = args.offset + args.limit
    tag = f"{start:04d}_{end:04d}"
    output_root = root / "backend" / "materials" / "imports" / "pilot" / "output"
    audit_dir = output_root / "audit"
    batches_dir = output_root / "review_batches"
    slice_path = output_root / f"demos_raw_pilot_{tag}.csv"
    master_csv = output_root / f"demos_mapping_master_pilot_{tag}.csv"
    draft_csv = output_root / f"demos_mapping_master_pilot_draft_{tag}.csv"
    audit_json = audit_dir / "demos_mapping_master_audit.json"
    audit_csv = audit_dir / "demos_mapping_master_audit.csv"
    summary_json = output_root / f"summary_{tag}.json"

    rows_processed = 0 if args.dry_run else slice_csv(input_path, slice_path, args.offset, args.limit)
    commands: list[dict[str, Any]] = []
    commands.append(run_cmd(root, [sys.executable, "tools/prepare_demos_mapping_master_csv.py", "--project-root", str(root), "--input", str(slice_path), "--output", str(master_csv)], args.dry_run))
    commands.append(run_cmd(root, [sys.executable, "tools/generate_demos_mapping_draft.py", "--project-root", str(root), "--input", str(master_csv), "--output", str(draft_csv), "--preserve-locked", "--only-empty", "--report", str(output_root / "demos_mapping_draft_report.json")], args.dry_run))
    commands.append(run_cmd(root, [sys.executable, "tools/audit_demos_mapping_master_csv.py", "--project-root", str(root), "--input", str(draft_csv), "--output-json", str(audit_json), "--output-csv", str(audit_csv)], args.dry_run))
    commands.append(run_cmd(root, [sys.executable, "tools/export_demos_mapping_review_batches.py", "--project-root", str(root), "--input", str(draft_csv), "--batch-size", str(args.batch_size), "--output-dir", str(batches_dir)], args.dry_run))

    audit_summary = {}
    batch_files: list[str] = []
    if not args.dry_run:
        audit_summary = load_json(audit_json).get("summary", {})
        batch_files = [str(path) for path in sorted(batches_dir.glob("demos_review_batch_*.csv"))]
    summary = {
        "input": str(input_path),
        "offset": args.offset,
        "limit": args.limit,
        "rowsProcessed": rows_processed,
        "mapped": audit_summary.get("mapped", 0),
        "needs_review": audit_summary.get("needs_review", 0),
        "unmapped": audit_summary.get("unmapped", 0),
        "locked": audit_summary.get("locked", 0),
        "unlocked": audit_summary.get("unlocked", 0),
        "ruleInferred": 0 if args.dry_run else load_json(audit_json).get("distributions", {}).get("colorSourceMethod", {}).get("rule_inferred", 0),
        "readyForImport": audit_summary.get("readyForImport", 0),
        "needsHumanReview": audit_summary.get("needsHumanReview", 0),
        "invalid": audit_summary.get("invalid", 0),
        "productionSafe": audit_summary.get("productionSafe", 0),
        "usesExternalVendorTexture": 0,
        "forbiddenAssetFieldsFound": audit_summary.get("forbiddenAssetFields", 0),
        "reviewBatchCount": len(batch_files),
        "outputs": {
            "masterCsv": str(master_csv),
            "draftCsv": str(draft_csv),
            "auditJson": str(audit_json),
            "auditCsv": str(audit_csv),
            "reviewBatchesDir": str(batches_dir),
        },
        "commands": commands,
        "dryRun": args.dry_run,
    }
    if not args.dry_run:
        summary_json.parent.mkdir(parents=True, exist_ok=True)
        summary_json.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
