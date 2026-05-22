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
    scene.render.resolution_x = 1600
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
        bg.inputs["Color"].default_value = (0.72, 0.76, 0.82, 1.0)
        bg.inputs["Strength"].default_value = 0.22


def _box(name: str, loc: tuple[float, float, float], dims: tuple[float, float, float]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def _handle(name: str, loc: tuple[float, float, float]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.035, depth=0.58, location=loc, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    return obj


def _neutral_mat(name: str, color: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    return mat


def _apply_requests(project_root: Path) -> dict:
    data = json.loads((project_root / "backend" / "materials" / "demo_kitchen_material_test.json").read_text(encoding="utf-8-sig"))
    cache: dict[str, bpy.types.Material] = {}
    report = {"objectsRequested": len(data["objects"]), "objectsMaterialApplied": 0, "objectsMissing": [], "materialErrors": {}, "warnings": []}
    for entry in data["objects"]:
        obj = bpy.data.objects.get(entry["objectName"])
        if obj is None:
            report["objectsMissing"].append(entry["objectName"])
            continue
        req = entry["material"]
        key = json.dumps(req, sort_keys=True)
        try:
            apply_physical_box_uv(obj, grain_direction=req.get("grainDirection"))
            if key not in cache:
                cache[key] = create_material_from_payload(req, project_root=str(project_root))
            if obj.data.materials:
                obj.data.materials[0] = cache[key]
            else:
                obj.data.materials.append(cache[key])
            report["objectsMaterialApplied"] += 1
        except Exception as exc:
            report["materialErrors"][entry["objectName"]] = str(exc)
    return report


def _lights() -> None:
    for name, loc, size, energy in [
        ("WindowSoftbox", (-3.5, -2.2, 2.6), 3.0, 520),
        ("ReflectionStrip", (2.8, -2.0, 2.1), 1.4, 120),
    ]:
        data = bpy.data.lights.new(name, type="AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = loc
        direction = Vector((0, 0, 0.7)) - Vector(loc)
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.size = size
        data.energy = energy


def _camera() -> None:
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (2.8, -4.1, 2.4)
    direction = Vector((0.0, 0.0, 0.75)) - Vector(cam.location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    cam_data.lens = 32
    bpy.context.scene.camera = cam


def build_scene(project_root: Path) -> dict:
    _reset_scene()
    _set_render()
    _box("floor_panel", (0, 0, -0.035), (4.2, 2.8, 0.06))
    _box("wall_panel", (0, 0.86, 1.05), (4.2, 0.06, 2.1))
    _box("backsplash", (0.25, 0.82, 0.95), (2.8, 0.04, 0.62))
    body = _neutral_mat("cabinet_body_neutral", (0.14, 0.14, 0.13, 1))
    for name, x in [("cabinet_left", -0.72), ("cabinet_right", 0.08), ("cabinet_drawer", 0.88)]:
        obj = _box(name, (x, 0.25, 0.38), (0.72, 0.58, 0.76))
        obj.data.materials.append(body)
    _box("left_door", (-0.72, -0.055, 0.42), (0.68, 0.035, 0.72))
    _box("right_door", (0.08, -0.055, 0.42), (0.68, 0.035, 0.72))
    _box("upper_door", (-0.72, -0.055, 1.32), (0.68, 0.035, 0.56))
    _box("drawer_front", (0.88, -0.055, 0.62), (0.68, 0.035, 0.28))
    _box("worktop", (0.08, 0.25, 0.8), (2.35, 0.68, 0.08))
    _handle("handle_001", (-0.72, -0.1, 0.48))
    _handle("handle_002", (0.08, -0.1, 0.48))
    _lights()
    _camera()
    return _apply_requests(project_root)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    args = parser.parse_args(_argv())
    project_root = Path(args.project_root).resolve()
    out_blend = project_root / "blender" / "previews" / "demo_kitchen_material_scene.blend"
    out_png = project_root / "blender" / "previews" / "demo_kitchen_material_scene.png"
    report = build_scene(project_root)
    (project_root / "reports").mkdir(parents=True, exist_ok=True)
    (project_root / "reports" / "demo_kitchen_material_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    bpy.context.scene.render.filepath = str(out_png)
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    return 0 if not report["materialErrors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
