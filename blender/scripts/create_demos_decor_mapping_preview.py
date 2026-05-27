from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from material_loader import create_material_from_payload
from physical_uv import apply_physical_box_uv


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def _reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def _set_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 96
        scene.cycles.use_denoising = True
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1200
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
        bg.inputs["Strength"].default_value = 0.18


def _mat(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf and "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = color
    return mat


def _box(name: str, loc: tuple[float, float, float], mat: bpy.types.Material, grain: str) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (0.8, 0.045, 0.8)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction=grain)
    obj.data.materials.append(mat)
    return obj


def _label(text: str, loc: tuple[float, float, float], size: float = 0.045) -> None:
    curve = bpy.data.curves.new(f"label_{len(bpy.data.curves)}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    obj = bpy.data.objects.new(f"label_{len(bpy.data.objects)}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(_mat("label_dark", (0.02, 0.02, 0.02, 1)))
    obj.location = loc
    obj.rotation_euler = (math.radians(90), 0, 0)


def _lights() -> None:
    for name, loc, size, energy in [
        ("MainSoftbox", (-3.2, -2.6, 2.4), 3.2, 700),
        ("ReflectionStrip", (3.0, -1.8, 1.7), 0.5, 950),
        ("WeakFill", (0, -3.5, 2.8), 5.0, 65),
    ]:
        data = bpy.data.lights.new(name, type="AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, 0.5)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.size = size
        data.energy = energy


def _camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0, -5.2, 2.05)
    direction = Vector((0, 0, 0.62)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 5.2
    bpy.context.scene.camera = cam


def _select(records: list[dict]) -> list[dict]:
    picked: list[dict] = []
    for status in ["needs_review", "unmapped", "mapped"]:
        for record in records:
            if record.get("mappingStatus") == status and record not in picked:
                picked.append(record)
            if len(picked) >= 8:
                return picked
    for record in records:
        if record not in picked:
            picked.append(record)
        if len(picked) >= 8:
            break
    return picked


def build_scene(project_root: Path, catalog_mode: str) -> None:
    _reset_scene()
    _set_render()
    floor = _mat("neutral_floor", (0.48, 0.48, 0.46, 1))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.12, -0.04))
    floor_obj = bpy.context.object
    floor_obj.name = "floor"
    floor_obj.dimensions = (5.3, 2.6, 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    floor_obj.data.materials.append(floor)

    suffix = "_staging" if catalog_mode == "staging" else ""
    path = project_root / "backend" / "materials" / "vendor_catalogs" / f"demos_decor_mappings{suffix}.json"
    records = json.loads(path.read_text(encoding="utf-8-sig")) if path.exists() else []
    selected = _select(records)
    if not selected:
        print(f"[warn] No Demos records available for {catalog_mode} preview")
    for index, record in enumerate(selected):
        row, col = divmod(index, 4)
        x = (col - 1.5) * 1.15
        y = 0.15 + row * 0.95
        transform = record.get("colorTransform", {}) if isinstance(record.get("colorTransform"), dict) else {}
        payload = {
            "vendor": "demos",
            "vendorDecorId": record["vendorDecorId"],
            "catalogMode": catalog_mode,
            "allowUnreviewed": catalog_mode == "staging",
        }
        mat = create_material_from_payload(payload, material_name=f"demos_mapping_{record['vendorDecorId']}", project_root=str(project_root))
        _box(record["vendorDecorId"], (x, y, 0.52), mat, record.get("grainDirectionDefault", "none"))
        _label(
            "\n".join([
                str(record.get("displayName")),
                str(record.get("vendorDecorId")),
                f"target: {record.get('targetInternalMaterialId')}",
                f"{record.get('surfaceProfile')} | {transform.get('baseColorHex')} @ {transform.get('tintStrength')}",
                f"{record.get('mappingStatus')} | conf {record.get('confidence')}",
                f"{catalog_mode} | productionSafe: {record.get('productionSafe', record.get('mappingStatus') == 'mapped')}",
                "NO DEMOS TEXTURE",
            ]),
            (x, y - 0.09, 1.12),
        )
    _lights()
    _camera()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--catalog-mode", choices=["production", "staging"], default="production")
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "demos_decor_mapping_preview.blend"
    out_png = project_root / "blender" / "previews" / "demos_decor_mapping_preview.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    build_scene(project_root, args.catalog_mode)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
