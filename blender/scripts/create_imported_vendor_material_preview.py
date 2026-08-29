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
        scene.cycles.samples = 80
        scene.cycles.use_denoising = True
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except Exception:
            scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1050
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
        bg.inputs["Color"].default_value = (0.74, 0.76, 0.80, 1)
        bg.inputs["Strength"].default_value = 0.22


def _records(project_root: Path) -> list[dict]:
    records = json.loads((project_root / "backend" / "materials" / "vendor_catalogs" / "demos_materials.json").read_text(encoding="utf-8-sig"))
    imported = [r for r in records if str(r.get("vendorDecorId", "")).startswith("demos_import_")]
    return imported[-8:] if imported else records[-8:]


def _box(name: str, loc: tuple[float, float, float], mat: bpy.types.Material, grain: str) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (0.8, 0.8, 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction=grain)
    obj.data.materials.append(mat)


def _label(text: str, loc: tuple[float, float, float]) -> None:
    mat = bpy.data.materials.get("label_dark") or bpy.data.materials.new("label_dark")
    mat.diffuse_color = (0.02, 0.02, 0.02, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf and "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    curve = bpy.data.curves.new(f"label_{text[:24]}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = 0.052
    obj = bpy.data.objects.new(f"label_{text[:24]}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = (math.radians(67), 0, 0)


def _lights() -> None:
    for name, loc, size, energy in [
        ("LargeSoftbox", (-3.2, -3.4, 3.4), 4.2, 760),
        ("SideReflection", (3.4, -2.0, 1.7), 0.9, 320),
    ]:
        data = bpy.data.lights.new(name, type="AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, 0.2)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.size = size
        data.energy = energy


def _camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -4.8, 3.0)
    direction = Vector((0.0, 0.0, 0.0)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 4.0
    bpy.context.scene.camera = cam


def build_scene(project_root: Path) -> None:
    _reset_scene()
    _set_render()
    floor_mat = bpy.data.materials.new("neutral_floor")
    floor_mat.diffuse_color = (0.47, 0.47, 0.45, 1)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.055))
    floor = bpy.context.object
    floor.name = "floor"
    floor.dimensions = (4.3, 3.2, 0.04)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    floor.data.materials.append(floor_mat)

    for i, record in enumerate(_records(project_root)):
        col = i % 3
        row = i // 3
        x = (col - 1) * 1.15
        y = 0.75 - row * 1.35
        payload = {
            "vendor": record["vendor"],
            "vendorDecorId": record["vendorDecorId"],
            "surfaceProfile": record["surfaceProfile"],
            "tileSizeMeters": record["tileSizeMeters"],
            "uvScale": record["uvScale"],
            "grainDirection": record["grainDirectionDefault"],
            "textureStrength": 0.6,
            "reflectivity": 0.65,
        }
        mat = create_material_from_payload(payload, material_name=f"imported_{record['vendorDecorId']}", project_root=str(project_root))
        _box(record["vendorDecorId"], (x, y, 0.04), mat, record["grainDirectionDefault"])
        status = record["assetStatus"]
        status_label = "FALLBACK" if status == "fallback_asset" else "MISSING" if status == "missing_asset" else "READY"
        _label(
            f"{status_label} - {record['displayName']}\n{record['vendorDecorId']}\n{record['surfaceProfile']} | {record['tileSizeMeters']}m",
            (x, y - 0.62, 0.08),
        )
    _lights()
    _camera()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "imported_vendor_material_preview.blend"
    out_png = project_root / "blender" / "previews" / "imported_vendor_material_preview.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    build_scene(project_root)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
