from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from material_loader import create_material_from_payload, create_or_update_material_from_assignment
from physical_uv import apply_physical_box_uv


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def _reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def _set_render(limit: int) -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 2200
    scene.render.resolution_y = 1600 if limit > 50 else 1200
    scene.render.resolution_percentage = 100
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        pass
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.74, 0.76, 0.8, 1)
        bg.inputs["Strength"].default_value = 0.2


def _mat(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    return mat


def _box(name: str, loc: tuple[float, float, float], mat: bpy.types.Material, grain: str) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (0.8, 0.045, 0.8)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction=grain)
    obj.data.materials.append(mat)


def _label(text: str, loc: tuple[float, float, float]) -> None:
    curve = bpy.data.curves.new(f"label_{len(bpy.data.curves)}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 0.035
    obj = bpy.data.objects.new(f"label_{len(bpy.data.objects)}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(_mat("label_dark", (0.02, 0.02, 0.02, 1)))
    obj.location = loc
    obj.rotation_euler = (math.radians(90), 0, 0)


def _lights() -> None:
    for name, loc, size, energy in [
        ("MainSoftbox", (-4.8, -3.0, 3.2), 5.0, 1050),
        ("ReflectionStrip", (4.0, -2.0, 2.4), 0.55, 1300),
        ("WeakFill", (0, -4.0, 3.5), 6.0, 80),
    ]:
        data = bpy.data.lights.new(name, type="AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, 0.55)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.size = size
        data.energy = energy


def _camera(cols: int, rows: int) -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    center_x = (cols - 1) * 0.58
    center_y = (rows - 1) * 0.52
    cam.location = (center_x, -7.2, 3.3)
    direction = Vector((center_x, center_y, 0.55)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(4.5, rows * 1.25)
    bpy.context.scene.camera = cam


def _read_csv_records(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as f:
        return [dict(row) for row in csv.DictReader(f)]


def _float(value: object, default: float) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except Exception:
        return default


def _bool(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "locked"}


def _csv_material(project_root: Path, record: dict[str, str]):
    manifest = json.loads((project_root / "backend" / "materials" / "material_manifest.json").read_text(encoding="utf-8-sig"))
    manifest_by_id = {item["id"]: item for item in manifest if isinstance(item, dict) and isinstance(item.get("id"), str)}
    target_id = record.get("targetInternalMaterialId") or "generic_neutral_template"
    material = manifest_by_id.get(target_id, {})
    maps = material.get("maps", {}) if isinstance(material.get("maps"), dict) else {}
    base_path = maps.get("basecolor")
    if base_path:
        base_path = str(project_root / base_path)
    color_transform = {
        "mode": record.get("colorTransformMode") or "tint_multiply",
        "baseColorHex": record.get("baseColorHex") or None,
        "grainColorHex": record.get("grainColorHex") or None,
        "secondaryColorHex": record.get("secondaryColorHex") or None,
        "tintStrength": _float(record.get("tintStrength"), 0.35),
        "grainContrast": _float(record.get("grainContrast"), 0.3),
        "hueShiftDegrees": _float(record.get("hueShiftDegrees"), 0.0),
        "saturationScale": _float(record.get("saturationScale"), 1.0),
        "valueScale": _float(record.get("valueScale"), 1.0),
        "contrastScale": _float(record.get("contrastScale"), 1.0),
    }
    rough_override = record.get("roughnessOverride")
    return create_or_update_material_from_assignment(
        material_name=f"csv_{record.get('vendorDecorId', 'decor')}",
        base_color_texture_path=base_path,
        surface_profile=record.get("surfaceProfile") or "generic_matte",
        uv_scale=_float(record.get("uvScale"), 2.5),
        tile_size_meters=_float(record.get("tileSizeMeters"), 0.4),
        grain_direction=record.get("grainDirectionDefault") or "none",
        color_transform=color_transform,
        roughness_multiplier=_float(record.get("roughnessMultiplier"), 1.0),
        roughness_override=_float(rough_override, None) if rough_override not in (None, "") else None,
        bump_multiplier=_float(record.get("bumpMultiplier"), 1.0),
        grain_depth=_float(record.get("grainDepth"), 0.0),
        coat_multiplier=_float(record.get("coatMultiplier"), 1.0),
        procedural_template=record.get("proceduralTemplate") or None,
        grain_pattern_id=record.get("grainPatternId") or None,
        mapping_status=record.get("mappingStatus") or None,
        mapping_locked=_bool(record.get("mappingLocked")),
        confidence=_float(record.get("confidence"), 0.0),
        project_root=str(project_root),
    )


def _setup_grid(selected: list[dict], limit: int) -> tuple[int, int]:
    cols = min(10, max(1, math.ceil(math.sqrt(max(1, len(selected))))))
    rows = math.ceil(len(selected) / cols)
    _reset_scene()
    _set_render(limit)
    floor = _mat("neutral_floor", (0.48, 0.48, 0.46, 1))
    bpy.ops.mesh.primitive_cube_add(size=1, location=((cols - 1) * 0.58, (rows - 1) * 0.52, -0.04))
    floor_obj = bpy.context.object
    floor_obj.name = "floor"
    floor_obj.dimensions = (cols * 1.25, rows * 1.15, 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    floor_obj.data.materials.append(floor)
    return cols, rows


def _add_records(project_root: Path, selected: list[dict], cols: int, rows: int, *, csv_mode: bool, catalog_mode: str = "production") -> None:
    for index, record in enumerate(selected):
        row, col = divmod(index, cols)
        x = col * 1.15
        y = row * 1.04
        transform = record.get("colorTransform", {}) if isinstance(record.get("colorTransform"), dict) else {}
        if csv_mode:
            transform = {
                "baseColorHex": record.get("baseColorHex"),
                "grainColorHex": record.get("grainColorHex"),
            }
            mat = _csv_material(project_root, record)
            grain = record.get("grainDirectionDefault", "none")
            locked = _bool(record.get("mappingLocked"))
        else:
            mat = create_material_from_payload(
                {
                    "vendor": "demos",
                    "vendorDecorId": record["vendorDecorId"],
                    "catalogMode": catalog_mode,
                    "allowUnreviewed": catalog_mode == "staging",
                },
                material_name=f"batch_{record['vendorDecorId']}",
                project_root=str(project_root),
            )
            grain = record.get("grainDirectionDefault", "none")
            locked = bool(record.get("mappingLocked"))
        production_safe = bool(record.get("productionSafe")) or (record.get("mappingStatus") == "mapped" and locked and float(record.get("confidence", 0) or 0) >= 0.7 and record.get("colorSourceMethod") != "rule_inferred")
        _box(record["vendorDecorId"], (x, y, 0.52), mat, grain)
        _label(
            "\n".join([
                str(record.get("displayName")),
                str(record.get("vendorDecorId")),
                f"target: {record.get('targetInternalMaterialId')}",
                f"grain: {record.get('grainPatternId')}",
                f"{record.get('surfaceProfile')} | {transform.get('baseColorHex')} / {transform.get('grainColorHex')}",
                f"{record.get('mappingStatus')} | conf {record.get('confidence')} | {'LOCKED' if locked else 'UNLOCKED'}",
                f"source: {record.get('colorSourceMethod', '')}",
                f"{catalog_mode} | productionSafe: {production_safe}",
                "NO DEMOS TEXTURE",
            ]),
            (x, y - 0.09, 1.14),
        )
    _lights()
    _camera(cols, rows)


def build_scene(project_root: Path, offset: int, limit: int, catalog_mode: str) -> tuple[int, int]:
    suffix = "_staging" if catalog_mode == "staging" else ""
    records = json.loads((project_root / "backend" / "materials" / "vendor_catalogs" / f"demos_decor_mappings{suffix}.json").read_text(encoding="utf-8-sig"))
    selected = records[offset : offset + limit]
    cols, rows = _setup_grid(selected, limit)
    _add_records(project_root, selected, cols, rows, csv_mode=False, catalog_mode=catalog_mode)
    return offset, offset + len(selected)


def build_scene_from_csv(project_root: Path, csv_path: Path) -> tuple[str, int]:
    selected = _read_csv_records(csv_path)
    cols, rows = _setup_grid(selected, len(selected))
    _add_records(project_root, selected, cols, rows, csv_mode=True)
    stem = csv_path.stem
    if stem.startswith("demos_review_batch_"):
        stem = "demos_mapping_review_batch_" + stem.removeprefix("demos_review_batch_")
    else:
        stem = "demos_mapping_" + stem
    return stem, len(selected)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--catalog-mode", choices=["production", "staging"], default="production")
    parser.add_argument("--csv")
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    if args.csv:
        csv_path = Path(args.csv)
        if not csv_path.is_absolute():
            csv_path = project_root / csv_path
        stem, _count = build_scene_from_csv(project_root, csv_path)
        out_blend = project_root / "blender" / "previews" / f"{stem}.blend"
        out_png = project_root / "blender" / "previews" / f"{stem}.png"
    else:
        start, end = build_scene(project_root, args.offset, args.limit, args.catalog_mode)
        out_blend = project_root / "blender" / "previews" / f"demos_mapping_batch_{args.catalog_mode}_{start:04d}_{end:04d}.blend"
        out_png = project_root / "blender" / "previews" / f"demos_mapping_batch_{args.catalog_mode}_{start:04d}_{end:04d}.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
