from __future__ import annotations

import argparse
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
    scene.render.resolution_y = 1000
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
        bg.inputs["Color"].default_value = (0.76, 0.78, 0.82, 1)
        bg.inputs["Strength"].default_value = 0.18


def _box(name: str, loc: tuple[float, float, float], dims: tuple[float, float, float], mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction="vertical")
    obj.data.materials.append(mat)
    return obj


def _label(text: str, loc: tuple[float, float, float]) -> None:
    mat = bpy.data.materials.get("label_dark") or bpy.data.materials.new("label_dark")
    mat.diffuse_color = (0.02, 0.02, 0.02, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf and "Base Color" in bsdf.inputs:
        bsdf.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    curve = bpy.data.curves.new(f"label_{text}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = 0.065
    obj = bpy.data.objects.new(f"label_{text}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = (math.radians(90), 0, 0)


def _lights() -> None:
    for name, loc, size, energy in [
        ("LongSideSoftbox", (-3.4, -2.2, 2.3), 3.2, 650),
        ("GlossReflectionStrip", (2.8, -1.4, 1.6), 0.42, 950),
        ("WeakFill", (0.0, -3.2, 2.5), 5.0, 45),
    ]:
        data = bpy.data.lights.new(name, type="AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, 0.18)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.size = size
        data.energy = energy


def _camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -4.0, 1.25)
    direction = Vector((0.0, 0.0, 0.58)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 4.9
    bpy.context.scene.camera = cam


def build_scene(project_root: Path) -> None:
    _reset_scene()
    _set_render()
    floor_mat = bpy.data.materials.new("neutral_floor")
    floor_mat.diffuse_color = (0.47, 0.47, 0.45, 1)
    _box("floor", (0, 0, -0.035), (5.3, 2.4, 0.04), floor_mat)
    wall_mat = bpy.data.materials.new("neutral_back_wall")
    wall_mat.diffuse_color = (0.62, 0.62, 0.60, 1)
    _box("back_wall", (0, 0.18, 0.62), (5.3, 0.04, 1.45), wall_mat)
    for i, profile in enumerate(PROFILES):
        x = (i - 2) * 0.92
        mat = create_material_from_manifest(
            material_id="wood_oak_natural",
            surface_profile=profile,
            tile_size_meters=0.4,
            uv_scale=2.5,
            grain_direction="vertical",
            texture_strength=0.65,
            reflectivity=0.85,
            project_root=str(project_root),
            material_name=f"preview_{profile}",
        )
        _box(f"board_{profile}", (x, -0.05, 0.56), (0.8, 0.045, 0.8), mat)
        _label(profile, (x, -0.11, 1.05))
    _lights()
    _camera()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "surface_profile_preview.blend"
    out_png = project_root / "blender" / "previews" / "surface_profile_preview.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    build_scene(project_root)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
