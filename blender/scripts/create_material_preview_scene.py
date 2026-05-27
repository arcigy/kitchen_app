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

from material_loader import create_material_from_manifest, load_json
from physical_uv import apply_physical_box_uv


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


def _set_render(project_root: Path) -> None:
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
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.view_transform = "Filmic"
            scene.view_settings.look = "Medium High Contrast"
        except Exception:
            pass

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    bg = nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.78, 0.82, 0.88, 1.0)
        bg.inputs["Strength"].default_value = 0.25

    hdri = project_root / "assets" / "hdri" / "hdri_kiara_interior.exr"
    if hdri.exists() and bg:
        try:
            env = nodes.new(type="ShaderNodeTexEnvironment")
            env.image = bpy.data.images.load(str(hdri), check_existing=True)
            world.node_tree.links.new(env.outputs["Color"], bg.inputs["Color"])
            bg.inputs["Strength"].default_value = 0.18
        except Exception:
            pass


def _add_area_light(name: str, loc: tuple[float, float, float], rot: tuple[float, float, float], size: float, energy: float) -> None:
    data = bpy.data.lights.new(name, type="AREA")
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    data.size = size
    data.energy = energy


def _cube(name: str, loc: tuple[float, float, float], scale: tuple[float, float, float], mat) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_physical_box_uv(obj, grain_direction="vertical" if "wood" in name else "none")
    obj.data.materials.append(mat)
    return obj


def _cylinder(name: str, loc: tuple[float, float, float], mat) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.09, depth=1.0, location=loc, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    apply_physical_box_uv(obj, grain_direction="none")
    obj.data.materials.append(mat)
    return obj


def _label(text: str, loc: tuple[float, float, float], size: float = 0.09) -> None:
    label_mat = bpy.data.materials.get("preview_label_dark") or bpy.data.materials.new("preview_label_dark")
    label_mat.diffuse_color = (0.02, 0.02, 0.02, 1.0)
    curve = bpy.data.curves.new(f"label_{text}", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.size = size
    obj = bpy.data.objects.new(f"label_{text}", curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(label_mat)
    obj.location = loc
    obj.rotation_euler = (math.radians(70), 0, 0)


def _setup_camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.0, -7.2, 4.5)
    target = Vector((0.0, 0.0, 0.35))
    direction = target - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 7.2
    bpy.context.scene.camera = cam


def build_scene(project_root: Path) -> None:
    manifest = load_json(project_root / "backend" / "materials" / "material_manifest.json")
    _reset_scene()
    _set_render(project_root)
    floor_mat = bpy.data.materials.new("preview_neutral_floor")
    floor_mat.diffuse_color = (0.42, 0.42, 0.4, 1)
    _cube("preview_floor", (0, 0, -0.04), (7.5, 5.2, 0.06), floor_mat)
    _add_area_light("KeyArea", (-2.5, -3.5, 5.0), (math.radians(55), 0, math.radians(-25)), 4.5, 600)
    _add_area_light("ReflectionStrip", (3.0, -2.2, 2.7), (math.radians(75), 0, math.radians(35)), 1.4, 180)

    groups = [
        ("wood", -2.7, 1.55, (1.0, 0.45, 0.06)),
        ("lacquer", 2.3, 1.55, (1.0, 0.45, 0.045)),
        ("stone", -2.2, 0.5, (1.0, 0.38, 0.08)),
        ("metal", 2.1, 0.45, None),
        ("wall", -1.9, -0.65, (0.8, 0.05, 0.8)),
        ("tile", 0.4, -0.65, (0.8, 0.05, 0.8)),
        ("overlays", 2.4, -0.65, (0.42, 0.03, 0.42)),
    ]
    by_cat: dict[str, list[dict]] = {}
    for item in manifest:
        by_cat.setdefault(item["category"], []).append(item)

    for category, start_x, y, dims in groups:
        items = by_cat.get(category, [])
        for idx, item in enumerate(items):
            x = start_x + (idx % 4) * 1.12
            yy = y - (idx // 4) * 0.62
            mat = create_material_from_manifest(item["id"], project_root=str(project_root))
            if category == "metal":
                _cylinder(item["id"], (x, yy, 0.3), mat)
                _label(item["id"], (x, yy - 0.42, 0.08), 0.06)
            else:
                z = 0.22 if dims[2] < 0.2 else 0.4
                _cube(item["id"], (x, yy, z), dims, mat)
                _label(item["id"], (x, yy - 0.34, 0.05), 0.055)

    _setup_camera()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "material_library_preview.blend"
    out_png = project_root / "blender" / "previews" / "material_library_preview.png"
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    try:
        build_scene(project_root)
        bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
        _update_report(project_root, "previewBlendFiles", "blender/previews/material_library_preview.blend")
        bpy.context.scene.render.filepath = str(out_png)
        bpy.context.scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
        _update_report(project_root, "previewRenderFiles", "blender/previews/material_library_preview.png")
    except Exception as exc:
        _update_report(project_root, "warnings", f"Material library preview failed: {exc}")
        try:
            bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
            _update_report(project_root, "previewBlendFiles", "blender/previews/material_library_preview.blend")
        except Exception:
            pass
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
