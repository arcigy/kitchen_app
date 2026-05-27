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

from material_loader import create_material_from_manifest
from physical_uv import apply_physical_box_uv


PROFILES = [
    "wood_raw_matte",
    "wood_standard_matte",
    "wood_soft_touch_supermat",
    "wood_satin_lacquer",
    "wood_gloss_laminate",
]


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def _update_report(project_root: Path, key: str, value: str) -> None:
    path = project_root / "reports" / "material_pipeline_report.json"
    if not path.exists():
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        data.setdefault(key, [])
        if value not in data[key]:
            data[key].append(value)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    except Exception:
        pass


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
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
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
        bg.inputs["Color"].default_value = (0.78, 0.8, 0.84, 1)
        bg.inputs["Strength"].default_value = 0.18


def _cube(name: str, loc: tuple[float, float, float], scale: tuple[float, float, float], mat) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction="vertical")
    obj.data.materials.append(mat)


def _label(text: str, loc: tuple[float, float, float]) -> None:
    label_mat = bpy.data.materials.get("preview_label_dark") or bpy.data.materials.new("preview_label_dark")
    label_mat.diffuse_color = (0.02, 0.02, 0.02, 1.0)
    curve = bpy.data.curves.new(f"label_{text}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = 0.075
    obj = bpy.data.objects.new(f"label_{text}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(label_mat)
    obj.location = loc
    obj.rotation_euler = (math.radians(68), 0, 0)


def _light(name: str, loc: tuple[float, float, float], size: float, energy: float) -> None:
    data = bpy.data.lights.new(name, type="AREA")
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    direction = Vector((0, 0, 0)) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    data.size = size
    data.energy = energy


def _camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -4.5, 2.3)
    direction = Vector((0, 0, 0.18)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 5.2
    bpy.context.scene.camera = cam


def build_scene(project_root: Path) -> None:
    _reset_scene()
    _set_render()
    floor_mat = bpy.data.materials.new("matte_neutral_floor")
    floor_mat.diffuse_color = (0.43, 0.43, 0.42, 1)
    _cube("floor", (0, 0, -0.04), (6.3, 2.4, 0.05), floor_mat)
    _light("LongReflectionArea", (-2.3, -2.0, 2.8), 2.0, 520)
    _light("SoftFrontFill", (2.5, -2.5, 1.6), 4.0, 85)
    for i, profile in enumerate(PROFILES):
        x = -2.25 + i * 1.12
        mat = create_material_from_manifest("wood_oak_natural", surface_profile=profile, project_root=str(project_root))
        _cube(profile, (x, 0, 0.18), (0.95, 0.72, 0.08), mat)
        _label(profile, (x, -0.62, 0.06))
    _camera()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "wood_surface_profiles_preview.blend"
    out_png = project_root / "blender" / "previews" / "wood_surface_profiles_preview.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    try:
        build_scene(project_root)
        bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
        _update_report(project_root, "previewBlendFiles", "blender/previews/wood_surface_profiles_preview.blend")
        bpy.context.scene.render.filepath = str(out_png)
        bpy.context.scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        _update_report(project_root, "previewRenderFiles", "blender/previews/wood_surface_profiles_preview.png")
    except Exception as exc:
        _update_report(project_root, "warnings", f"Wood profile preview failed: {exc}")
        try:
            bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
            _update_report(project_root, "previewBlendFiles", "blender/previews/wood_surface_profiles_preview.blend")
        except Exception:
            pass
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
