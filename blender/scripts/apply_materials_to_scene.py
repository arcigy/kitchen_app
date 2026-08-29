from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from material_loader import create_material_from_payload
from physical_uv import PHYSICAL_UV_LAYER, apply_physical_box_uv


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def _material_hash(request: dict[str, Any]) -> str:
    payload = json.dumps(request, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _apply_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    if not hasattr(obj.data, "materials"):
        return
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--materials-json", required=True)
    parser.add_argument("--output-blend", required=True)
    args = parser.parse_args(_argv())

    project_root = Path(args.project_root).resolve()
    data = json.loads(Path(args.materials_json).read_text(encoding="utf-8-sig"))
    entries = data.get("objects", []) if isinstance(data, dict) else []
    report = {
        "objectsRequested": len(entries) if isinstance(entries, list) else 0,
        "objectsMaterialApplied": 0,
        "objectsMissing": [],
        "materialErrors": {},
        "warnings": [],
    }
    cache: dict[str, bpy.types.Material] = {}

    if not isinstance(entries, list):
        report["warnings"].append("materials-json objects must be a list")
        entries = []

    for entry in entries:
        if not isinstance(entry, dict):
            report["warnings"].append("Skipped non-object material entry")
            continue
        object_name = entry.get("objectName")
        request = entry.get("material")
        if not isinstance(object_name, str) or not object_name:
            report["warnings"].append("Skipped entry without objectName")
            continue
        obj = bpy.data.objects.get(object_name)
        if obj is None:
            report["objectsMissing"].append(object_name)
            continue
        if not isinstance(request, dict):
            report["materialErrors"][object_name] = "Missing material request"
            continue
        try:
            if not apply_physical_box_uv(obj, PHYSICAL_UV_LAYER, request.get("grainDirection")):
                report["warnings"].append(f"{object_name} has no physical_meters UV layer fallback available")
            h = _material_hash(request)
            if h not in cache:
                material_id = request.get("materialId") or request.get("vendorDecorId")
                profile = request.get("surfaceProfile")
                mat_name = f"{material_id}__{profile or 'default'}__{h}"
                cache[h] = create_material_from_payload(request, material_name=mat_name, project_root=str(project_root))
            _apply_material(obj, cache[h])
            report["objectsMaterialApplied"] += 1
        except Exception as exc:
            report["materialErrors"][object_name] = str(exc)

    Path(args.output_blend).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.output_blend).resolve()))
    write_path = project_root / "reports" / "apply_materials_report.json"
    write_path.parent.mkdir(parents=True, exist_ok=True)
    write_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if not report["materialErrors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
