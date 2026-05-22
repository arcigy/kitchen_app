from __future__ import annotations

import argparse
import json
import re
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


def tag_from_path(path: Path) -> str:
    match = re.search(r"(\d{4}_\d{4})", path.stem)
    return match.group(1) if match else "0000_0000"


def load_summary(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except Exception:
        return {}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--master", required=True)
    parser.add_argument("--reviewed", required=True)
    parser.add_argument("--reviewed-by", required=True)
    parser.add_argument("--lock-approved", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-update-locked", action="store_true")
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    master = resolve(root, args.master)
    reviewed = resolve(root, args.reviewed)
    tag = tag_from_path(master)
    output_root = root / "backend" / "materials" / "imports" / "pilot" / "output"
    reviewed_master = output_root / f"demos_mapping_master_reviewed_{tag}.csv"
    summary_path = output_root / f"review_import_summary_{tag}.json"
    audit_json = output_root / "audit" / f"demos_mapping_master_reviewed_audit_{tag}.json"
    audit_csv = output_root / "audit" / f"demos_mapping_master_reviewed_audit_{tag}.csv"

    commands: list[dict[str, Any]] = []
    cmd = [sys.executable, "tools/import_reviewed_demos_mapping_batch.py", "--project-root", str(root), "--master", str(master), "--reviewed", str(reviewed), "--output", str(reviewed_master), "--reviewed-by", args.reviewed_by]
    if args.lock_approved:
        cmd.append("--lock-approved")
    if args.allow_update_locked:
        cmd.append("--allow-update-locked")
    if args.dry_run:
        cmd.append("--dry-run")
    commands.append(run_cmd(root, cmd, False))
    if not args.dry_run:
        commands.append(run_cmd(root, [sys.executable, "tools/audit_demos_mapping_master_csv.py", "--project-root", str(root), "--input", str(reviewed_master), "--output-json", str(audit_json), "--output-csv", str(audit_csv)]))
        commands.append(run_cmd(root, [sys.executable, "tools/import_vendor_decor_mappings.py", "--project-root", str(root), "--vendor", "demos", "--input", str(reviewed_master), "--catalog-mode", "staging", "--respect-locked"]))
        commands.append(run_cmd(root, [sys.executable, "tools/import_vendor_decor_mappings.py", "--project-root", str(root), "--vendor", "demos", "--input", str(reviewed_master), "--catalog-mode", "production", "--respect-locked"]))

    staging = load_summary(commands[-2]["stdout"]) if len(commands) >= 3 else {}
    production = load_summary(commands[-1]["stdout"]) if len(commands) >= 4 else {}
    summary = {
        "master": str(master),
        "reviewed": str(reviewed),
        "reviewedMaster": str(reviewed_master),
        "stagingRecords": staging.get("mapped", 0) + staging.get("needs_review", 0) + staging.get("unmapped", 0),
        "productionRecords": production.get("mapped", 0),
        "stagingSummary": staging,
        "productionSummary": production,
        "commands": commands,
        "dryRun": args.dry_run,
    }
    if not args.dry_run:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
