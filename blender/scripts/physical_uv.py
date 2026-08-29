from __future__ import annotations

from typing import Any

try:
    import bpy
except ImportError:
    bpy = None  # type: ignore


PHYSICAL_UV_LAYER = "physical_meters"
GRAIN_DIRECTIONS = {"vertical", "horizontal", "lengthwise", "none", "auto", None}


def _scaled_local_coord(obj: Any, vertex: Any) -> tuple[float, float, float]:
    scale = getattr(obj, "scale", None)
    sx = abs(float(scale.x)) if scale is not None else 1.0
    sy = abs(float(scale.y)) if scale is not None else 1.0
    sz = abs(float(scale.z)) if scale is not None else 1.0
    co = vertex.co
    return float(co.x) * sx, float(co.y) * sy, float(co.z) * sz


def _face_uv(normal: Any, coord: tuple[float, float, float], grain_direction: str | None, dims: tuple[float, float, float]) -> tuple[float, float]:
    x, y, z = coord
    ax, ay, az = abs(float(normal.x)), abs(float(normal.y)), abs(float(normal.z))
    grain = grain_direction if grain_direction in GRAIN_DIRECTIONS else "none"
    if grain == "auto":
        grain = "none"

    if az >= ax and az >= ay:
        u, v = x, y
        if grain == "lengthwise":
            dx, dy, _ = dims
            u, v = (y, x) if dx >= dy else (x, y)
    elif ax >= ay:
        u, v = y, z
        if grain == "horizontal":
            u, v = z, y
    else:
        u, v = x, z
        if grain == "horizontal":
            u, v = z, x
    return u, v


def apply_physical_box_uv(obj: Any, uv_layer_name: str = PHYSICAL_UV_LAYER, grain_direction: str | None = "none") -> bool:
    if bpy is None or obj is None or getattr(obj, "type", None) != "MESH" or getattr(obj, "data", None) is None:
        return False
    mesh = obj.data
    if not hasattr(mesh, "uv_layers"):
        return False
    uv_layer = mesh.uv_layers.get(uv_layer_name) or mesh.uv_layers.new(name=uv_layer_name)
    dims = getattr(obj, "dimensions", None)
    dim_tuple = (
        abs(float(dims.x)) if dims is not None else 0.0,
        abs(float(dims.y)) if dims is not None else 0.0,
        abs(float(dims.z)) if dims is not None else 0.0,
    )
    try:
        mesh.update(calc_edges=True)
    except Exception:
        pass
    for poly in mesh.polygons:
        normal = poly.normal
        for loop_index in poly.loop_indices:
            vi = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = _face_uv(normal, _scaled_local_coord(obj, mesh.vertices[vi]), grain_direction, dim_tuple)
    try:
        mesh.uv_layers.active = uv_layer
        mesh.uv_layers.active_render = uv_layer
    except Exception:
        pass
    return True
