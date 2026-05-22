from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


DEFAULT_BLENDER = Path(r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe")


def resolve(root: Path, value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else root / path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--catalog-mode", choices=["production", "staging"], default="staging")
    parser.add_argument("--csv")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--blender", default=str(DEFAULT_BLENDER))
    args = parser.parse_args()

    root = Path(args.project_root).resolve()
    blender = Path(args.blender)
    csv_path = resolve(root, args.csv)
    command = [str(blender), "-b", "--python", "blender\\scripts\\create_demos_mapping_batch_preview.py", "--", "--project-root", str(root)]
    if csv_path:
        command += ["--csv", str(csv_path)]
    else:
        command += ["--catalog-mode", args.catalog_mode, "--offset", str(args.offset), "--limit", str(args.limit)]
    if not blender.exists():
        print(json.dumps({"ok": False, "reason": "Blender executable not found", "command": command}, indent=2, ensure_ascii=False))
        return 0
    proc = subprocess.run(command, cwd=root, text=True, capture_output=True)
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
