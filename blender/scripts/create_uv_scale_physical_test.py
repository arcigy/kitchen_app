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

from physical_uv import PHYSICAL_UV_LAYER, apply_physical_box_uv


def _argv() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def _reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def _set_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 64
        scene.cycles.use_denoising = True
    except Exception:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
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
        bg.inputs["Color"].default_value = (0.78, 0.82, 0.88, 1)
        bg.inputs["Strength"].default_value = 0.24


def _make_image(name: str, stripes: bool = False) -> bpy.types.Image:
    size = 256
    img = bpy.data.images.new(name, width=size, height=size)
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            if stripes:
                stripe = (x // 18) % 2
                border = x < 4 or x >= size - 4 or y < 4 or y >= size - 4
                color = (0.72, 0.42, 0.18) if stripe else (0.98, 0.74, 0.34)
                if border:
                    color = (0.08, 0.05, 0.03)
            else:
                border = x < 8 or x >= size - 8 or y < 8 or y >= size - 8
                diagonal = abs(x - y) < 4 or abs((size - 1 - x) - y) < 4
                checker = ((x // 64) + (y // 64)) % 2
                color = (0.92, 0.92, 0.88) if checker else (0.42, 0.64, 0.94)
                if border or diagonal:
                    color = (0.04, 0.04, 0.04)
            pixels.extend([color[0], color[1], color[2], 1.0])
    img.pixels.foreach_set(pixels)
    img.pack()
    return img


def _debug_material(name: str, img: bpy.types.Image, uv_scale: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    uv = nodes.new(type="ShaderNodeUVMap")
    uv.name = "PHYSICAL_UV_MAP"
    uv.uv_map = PHYSICAL_UV_LAYER
    mapping = nodes.new(type="ShaderNodeMapping")
    mapping.name = "MAPPING_NODE"
    mapping.inputs["Scale"].default_value[0] = uv_scale
    mapping.inputs["Scale"].default_value[1] = uv_scale
    tex = nodes.new(type="ShaderNodeTexImage")
    tex.name = "PHYSICAL_TILE_TEXTURE"
    tex.image = img
    tex.extension = "REPEAT"
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    out = nodes.new(type="ShaderNodeOutputMaterial")
    links.new(uv.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat["tile_size_meters"] = 1.0 / uv_scale
    mat["uv_scale"] = uv_scale
    mat["uv_layer"] = PHYSICAL_UV_LAYER
    return mat


def _box(name: str, loc: tuple[float, float, float], dims: tuple[float, float, float], mat: bpy.types.Material, grain: str) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction=grain)
    obj.data.materials.append(mat)
    return obj


def _label(text: str, loc: tuple[float, float, float], size: float = 0.065) -> None:
    mat = bpy.data.materials.get("label_dark") or bpy.data.materials.new("label_dark")
    mat.diffuse_color = (0.02, 0.02, 0.02, 1)
    curve = bpy.data.curves.new(f"label_{text}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = size
    obj = bpy.data.objects.new(f"label_{text}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = (math.radians(67), 0, 0)


def _lights() -> None:
    for name, loc, size, energy in [
        ("LargeSoftbox", (-2.4, -4.0, 4.2), 4.5, 600),
        ("SideReflection", (3.6, -2.2, 2.0), 1.4, 120),
    ]:
        data = bpy.data.lights.new(name, type="AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, 0.15)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.size = size
        data.energy = energy


def _camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -5.4, 3.2)
    direction = Vector((0.0, 0.0, 0.15)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 5.1
    bpy.context.scene.camera = cam


def build_scene() -> None:
    _reset_scene()
    _set_render()
    tile_mat = _debug_material("debug_40cm_tile", _make_image("debug_40cm_tile_image"), 2.5)
    grain_mat = _debug_material("debug_grain_direction", _make_image("debug_grain_image", stripes=True), 2.5)
    floor_mat = bpy.data.materials.new("neutral_floor")
    floor_mat.diffuse_color = (0.48, 0.48, 0.46, 1)
    _box("floor", (0, 0, -0.04), (5.2, 3.4, 0.04), floor_mat, "none")

    for name, x, size, label in [
        ("board_40cm", -1.55, 0.4, "0.4m board - expected 1 tile"),
        ("board_80cm", -0.45, 0.8, "0.8m board - expected 2 tiles"),
        ("board_160cm", 1.15, 1.6, "1.6m board - expected 4 tiles"),
    ]:
        _box(name, (x, 0.85, 0.04), (size, size, 0.04), tile_mat, "none")
        _label(label, (x, 0.85 - size / 2 - 0.28, 0.08), 0.06)

    _box("vertical_grain_door", (-1.35, -1.05, 0.8), (0.6, 0.04, 1.6), grain_mat, "vertical")
    _label("vertical grain", (-1.35, -1.42, 0.12))
    _box("horizontal_grain_door", (-0.25, -1.05, 0.8), (0.6, 0.04, 1.6), grain_mat, "horizontal")
    _label("horizontal grain", (-0.25, -1.42, 0.12))
    _box("lengthwise_worktop", (1.2, -1.05, 0.04), (1.8, 0.6, 0.04), grain_mat, "lengthwise")
    _label("lengthwise worktop", (1.2, -1.62, 0.09))
    _lights()
    _camera()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "uv_scale_physical_test.blend"
    out_png = project_root / "blender" / "previews" / "uv_scale_physical_test.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    build_scene()
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
