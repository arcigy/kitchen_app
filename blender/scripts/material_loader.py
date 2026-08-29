from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

try:
    import bpy
except ImportError:  # Allows syntax/import checks outside Blender.
    bpy = None  # type: ignore


MAP_ROLES = ["basecolor", "roughness", "normal", "ao", "displacement", "metallic", "opacity"]
PHYSICAL_UV_LAYER = "physical_meters"
FALLBACK_COLORS = {
    "wood": (0.58, 0.38, 0.22, 1.0),
    "lacquer": (0.9, 0.9, 0.86, 1.0),
    "stone": (0.55, 0.55, 0.53, 1.0),
    "metal": (0.45, 0.45, 0.43, 1.0),
    "wall": (0.82, 0.80, 0.75, 1.0),
    "tile": (0.86, 0.86, 0.84, 1.0),
    "overlays": (0.5, 0.5, 0.5, 1.0),
}


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def resolve_project_path(project_root: str | Path | None = None) -> Path:
    if project_root:
        return Path(project_root).resolve()
    return Path(__file__).resolve().parents[2]


def hex_to_rgba(value: str | None, alpha: float = 1.0) -> tuple[float, float, float, float] | None:
    if not value:
        return None
    v = value.strip()
    if not (len(v) == 7 and v.startswith("#")):
        raise ValueError(f"Invalid hex color: {value}")
    return (int(v[1:3], 16) / 255.0, int(v[3:5], 16) / 255.0, int(v[5:7], 16) / 255.0, alpha)


def get_principled_input_safe(bsdf: Any, names: list[str]) -> Any | None:
    for name in names:
        if name in bsdf.inputs:
            return bsdf.inputs[name]
    return None


def set_principled_input_safe(bsdf: Any, names: list[str], value: Any) -> bool:
    socket = get_principled_input_safe(bsdf, names)
    if socket is None:
        return False
    try:
        socket.default_value = value
        return True
    except Exception:
        return False


def load_image_safe(path: str | Path | None) -> Any | None:
    if bpy is None or not path:
        return None
    p = Path(path)
    if not p.exists():
        return None
    try:
        return bpy.data.images.load(str(p), check_existing=True)
    except Exception:
        return None


def set_image_colorspace_safe(image: Any, colorspace: str) -> None:
    if image is None:
        return
    try:
        image.colorspace_settings.name = colorspace
    except Exception:
        pass


def _project_file(project_root: Path, rel_path: str | None) -> Path | None:
    if not rel_path:
        return None
    p = Path(rel_path)
    return p if p.is_absolute() else project_root / p


def _load_material_data(project_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_items = load_json(project_root / "backend" / "materials" / "material_manifest.json")
    profiles = load_json(project_root / "backend" / "materials" / "surface_profiles.json")
    return {item["id"]: item for item in manifest_items}, profiles


def validate_material_request(
    material_id: str,
    surface_profile: str | None = None,
    base_color: str | None = None,
    tile_size_meters: float | None = None,
    uv_scale: float | None = None,
    rotation_degrees: float = 0.0,
    grain_direction: str | None = None,
    texture_strength: float | None = None,
    reflectivity: float | None = None,
    project_root: str | Path | None = None,
) -> dict[str, Any]:
    root = resolve_project_path(project_root)
    manifest, profiles = _load_material_data(root)
    if material_id not in manifest:
        raise ValueError(f"Unknown materialId: {material_id}")
    material = manifest[material_id]
    profile_id = surface_profile or material.get("surfaceProfileDefault") or material["defaultSurfaceProfile"]
    if profile_id not in profiles:
        print(f"[warn] Unknown surface profile {profile_id!r}; using generic_matte")
        profile_id = "generic_matte"
    allowed_profiles = material.get("allowedSurfaceProfiles", [])
    if profile_id not in allowed_profiles and profile_id != material.get("surfaceProfileDefault"):
        raise ValueError(f"Surface profile {profile_id} is not allowed for {material_id}")
    if base_color is not None:
        hex_to_rgba(base_color)
    if tile_size_meters is not None:
        tile_size = float(tile_size_meters)
        if tile_size <= 0:
            raise ValueError("tileSizeMeters must be greater than 0")
        uv = 1.0 / tile_size
    else:
        tile_size = float(material.get("tileSizeMeters", 0.4))
        uv = float(uv_scale if uv_scale is not None else material.get("uvScaleDefault", 1.0 / tile_size))
    if uv_scale is not None and tile_size_meters is not None and abs(float(uv_scale) - uv) >= 0.001:
        raise ValueError("tileSizeMeters and uvScale are inconsistent")
    rot = float(rotation_degrees)
    tex = float(texture_strength if texture_strength is not None else material.get("textureStrengthDefault", 0.5))
    refl = float(reflectivity if reflectivity is not None else material.get("reflectivityDefault", 0.35))
    grain = grain_direction
    if grain in (None, "auto"):
        grain = material.get("grainDirectionDefault", "none")
    if grain not in ("horizontal", "vertical", "lengthwise", "none"):
        raise ValueError("grainDirection must be vertical, horizontal, lengthwise, none, auto, or null")
    if material.get("category") == "wood":
        if grain == "vertical":
            rot = 0.0
        elif grain == "horizontal":
            rot = 90.0
        elif grain == "lengthwise":
            rot = 0.0
    if not 0.1 <= uv <= 10.0:
        raise ValueError("uvScale must be between 0.1 and 10.0")
    if not 0.0 <= rot <= 360.0:
        raise ValueError("rotation_degrees must be between 0 and 360")
    if not 0.0 <= tex <= 1.0:
        raise ValueError("textureStrength must be between 0 and 1")
    if not 0.0 <= refl <= 1.0:
        raise ValueError("reflectivity must be between 0 and 1")
    return {
        "project_root": root,
        "material": material,
        "profile": profiles[profile_id],
        "profile_id": profile_id,
        "tile_size_meters": tile_size,
        "uv_scale": uv,
        "rotation_degrees": rot,
        "texture_strength": tex,
        "reflectivity": refl,
        "base_color_rgba": hex_to_rgba(base_color) if base_color else None,
        "grain_direction": grain,
    }


def _new_node(nodes: Any, node_type: str, name: str) -> Any:
    node = nodes.new(type=node_type)
    node.name = name
    node.label = name
    return node


def _link(links: Any, src: Any, dst: Any) -> None:
    try:
        links.new(src, dst)
    except Exception:
        pass


def _image_node(nodes: Any, image: Any, name: str, colorspace: str) -> Any | None:
    if image is None:
        return None
    node = _new_node(nodes, "ShaderNodeTexImage", name)
    node.image = image
    set_image_colorspace_safe(image, colorspace)
    return node


def _set_mapping(mapping: Any, uv_scale: float, rotation_degrees: float) -> None:
    try:
        mapping.inputs["Scale"].default_value[0] = uv_scale
        mapping.inputs["Scale"].default_value[1] = uv_scale
    except Exception:
        pass
    try:
        mapping.inputs["Rotation"].default_value[2] = math.radians(rotation_degrees)
    except Exception:
        pass


def _connect_vector(mapping: Any, image_nodes: list[Any | None]) -> None:
    for node in image_nodes:
        if node is None:
            continue
        try:
            mapping.id_data.links.new(mapping.outputs["Vector"], node.inputs["Vector"])
        except Exception:
            pass


def _color_transform_data(value: Any | None) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    mode = data.get("mode", "none")
    if mode not in {"none", "tint_multiply", "tint_mix", "solid_color", "hsv_adjust"}:
        mode = "none"
    return {
        "mode": mode,
        "baseColorHex": data.get("baseColorHex"),
        "grainColorHex": data.get("grainColorHex"),
        "secondaryColorHex": data.get("secondaryColorHex"),
        "tintStrength": max(0.0, min(1.0, float(data.get("tintStrength", 0.0) or 0.0))),
        "grainContrast": max(0.0, min(1.0, float(data.get("grainContrast", 0.0) or 0.0))),
        "hueShiftDegrees": float(data.get("hueShiftDegrees", 0.0) or 0.0),
        "saturationScale": float(data.get("saturationScale", 1.0) or 1.0),
        "valueScale": float(data.get("valueScale", 1.0) or 1.0),
        "contrastScale": float(data.get("contrastScale", 1.0) or 1.0),
    }


def _apply_color_transform(nodes: Any, links: Any, bsdf: Any, source_color: Any, color_transform: dict[str, Any] | None) -> None:
    transform = _color_transform_data(color_transform)
    mode = transform["mode"]
    tint = hex_to_rgba(transform.get("baseColorHex")) if transform.get("baseColorHex") else None
    base_socket = get_principled_input_safe(bsdf, ["Base Color"])
    if base_socket is None:
        return
    if mode == "solid_color" and tint is not None:
        base_socket.default_value = tint
        return
    if mode == "none" or tint is None:
        _link(links, source_color, base_socket)
        return
    tint_node = _new_node(nodes, "ShaderNodeRGB", "COLOR_TRANSFORM_TINT")
    tint_node.outputs["Color"].default_value = tint
    if mode in {"tint_multiply", "hsv_adjust"}:
        multiply = _new_node(nodes, "ShaderNodeMixRGB", "COLOR_TRANSFORM_MULTIPLY")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs["Fac"].default_value = 1.0
        _link(links, source_color, multiply.inputs["Color1"])
        _link(links, tint_node.outputs["Color"], multiply.inputs["Color2"])
        transformed = multiply.outputs["Color"]
    else:
        transformed = tint_node.outputs["Color"]
    mix = _new_node(nodes, "ShaderNodeMixRGB", "COLOR_TRANSFORM_STRENGTH")
    mix.blend_type = "MIX"
    mix.inputs["Fac"].default_value = transform["tintStrength"]
    _link(links, source_color, mix.inputs["Color1"])
    _link(links, transformed, mix.inputs["Color2"])
    _link(links, mix.outputs["Color"], base_socket)


def _set_material_alpha(mat: Any, alpha: float) -> None:
    mat.diffuse_color = (mat.diffuse_color[0], mat.diffuse_color[1], mat.diffuse_color[2], alpha)
    try:
        mat.blend_method = "BLEND"
        mat.use_screen_refraction = True
        mat.show_transparent_back = True
    except Exception:
        pass


def create_material_from_manifest(
    material_id: str,
    surface_profile: str | None = None,
    base_color: str | None = None,
    tile_size_meters: float | None = None,
    uv_scale: float | None = None,
    rotation_degrees: float = 0.0,
    grain_direction: str | None = None,
    texture_strength: float | None = None,
    reflectivity: float | None = None,
    material_name: str | None = None,
    project_root: str | None = None,
) -> Any:
    if bpy is None:
        raise RuntimeError("material_loader.py must run inside Blender for material creation.")

    request = validate_material_request(
        material_id,
        surface_profile,
        base_color,
        tile_size_meters,
        uv_scale,
        rotation_degrees,
        grain_direction,
        texture_strength,
        reflectivity,
        project_root,
    )
    root: Path = request["project_root"]
    item = request["material"]
    profile = request["profile"]
    profile_id = request["profile_id"]
    tex_strength = request["texture_strength"]
    mat = bpy.data.materials.new(material_name or f"{material_id}__{profile_id}")
    mat.use_nodes = True

    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    uvmap = _new_node(nodes, "ShaderNodeUVMap", "UV_PHYSICAL_METERS")
    try:
        uvmap.uv_map = PHYSICAL_UV_LAYER
    except Exception:
        pass
    mapping = _new_node(nodes, "ShaderNodeMapping", "MAPPING_PHYSICAL_SCALE")
    _set_mapping(mapping, request["uv_scale"], request["rotation_degrees"])
    output = _new_node(nodes, "ShaderNodeOutputMaterial", "MATERIAL_OUTPUT")
    bsdf = _new_node(nodes, "ShaderNodeBsdfPrincipled", "PRINCIPLED_BSDF")
    _link(links, uvmap.outputs["UV"], mapping.inputs["Vector"])
    _link(links, bsdf.outputs["BSDF"], output.inputs["Surface"])

    maps = item.get("maps", {})
    images = {role: load_image_safe(_project_file(root, maps.get(role))) for role in MAP_ROLES}
    base_node = _image_node(nodes, images["basecolor"], "BASE_COLOR_TEXTURE", "sRGB")
    rough_node = _image_node(nodes, images["roughness"], "ROUGHNESS_TEXTURE", "Non-Color")
    normal_node = _image_node(nodes, images["normal"], "NORMAL_TEXTURE", "Non-Color")
    ao_node = _image_node(nodes, images["ao"], "AO_TEXTURE", "Non-Color")
    displacement_node = _image_node(nodes, images["displacement"], "DISPLACEMENT_TEXTURE", "Non-Color")
    metallic_node = _image_node(nodes, images["metallic"], "METALLIC_TEXTURE", "Non-Color")
    opacity_node = _image_node(nodes, images["opacity"], "OPACITY_TEXTURE", "Non-Color")
    _connect_vector(mapping, [base_node, rough_node, normal_node, ao_node, displacement_node, metallic_node, opacity_node])

    fallback_color = hex_to_rgba(item.get("fallbackBaseColor")) or FALLBACK_COLORS.get(item.get("category"), (0.5, 0.5, 0.5, 1.0))
    tint = request["base_color_rgba"]
    if base_node is not None:
        color_output = base_node.outputs["Color"]
        if tint is not None:
            tint_node = _new_node(nodes, "ShaderNodeRGB", "BASE_COLOR_TINT")
            tint_node.outputs["Color"].default_value = tint
            mix = _new_node(nodes, "ShaderNodeMixRGB", "BASE_COLOR_TINT_MULTIPLY")
            mix.blend_type = "MULTIPLY"
            mix.inputs["Fac"].default_value = max(0.0, min(1.0, tex_strength))
            _link(links, color_output, mix.inputs["Color1"])
            _link(links, tint_node.outputs["Color"], mix.inputs["Color2"])
            color_output = mix.outputs["Color"]
        if ao_node is not None:
            ao_mix = _new_node(nodes, "ShaderNodeMixRGB", "AO_MULTIPLY")
            ao_mix.blend_type = "MULTIPLY"
            ao_mix.inputs["Fac"].default_value = 0.35
            _link(links, color_output, ao_mix.inputs["Color1"])
            _link(links, ao_node.outputs["Color"], ao_mix.inputs["Color2"])
            color_output = ao_mix.outputs["Color"]
        _link(links, color_output, get_principled_input_safe(bsdf, ["Base Color"]))
    else:
        set_principled_input_safe(bsdf, ["Base Color"], tint or fallback_color)
        mat.diffuse_color = tint or fallback_color

    rough_base = float(profile.get("roughnessBase", 0.5))
    rough_var = float(profile.get("roughnessVariation", 0.05))
    rough_socket = get_principled_input_safe(bsdf, ["Roughness"])
    if rough_socket is not None:
        if rough_node is not None:
            _link(links, rough_node.outputs["Color"], rough_socket)
        else:
            noise = _new_node(nodes, "ShaderNodeTexNoise", "ROUGHNESS_NOISE")
            noise.inputs["Scale"].default_value = 18.0
            noise.inputs["Detail"].default_value = 6.0
            noise.inputs["Roughness"].default_value = 0.55
            ramp = _new_node(nodes, "ShaderNodeValToRGB", "ROUGHNESS_RAMP")
            lo = max(0.02, min(0.98, rough_base - rough_var * tex_strength * 0.5))
            hi = max(0.02, min(0.98, rough_base + rough_var * tex_strength * 0.5))
            ramp.color_ramp.elements[0].position = 0.18
            ramp.color_ramp.elements[0].color = (lo, lo, lo, 1.0)
            ramp.color_ramp.elements[1].position = 1.0
            ramp.color_ramp.elements[1].color = (hi, hi, hi, 1.0)
            _link(links, noise.outputs["Fac"], ramp.inputs["Fac"])
            _link(links, ramp.outputs["Color"], rough_socket)

    bump_strength = float(profile.get("bumpStrength", profile.get("normalStrength", 0.0))) * tex_strength
    normal_socket = get_principled_input_safe(bsdf, ["Normal"])
    if normal_node is not None and normal_socket is not None and bump_strength > 0:
        nmap = _new_node(nodes, "ShaderNodeNormalMap", "NORMAL_MAP_NODE")
        nmap.inputs["Strength"].default_value = bump_strength
        _link(links, normal_node.outputs["Color"], nmap.inputs["Color"])
    if normal_socket is not None and bump_strength > 0.001:
        noise = _new_node(nodes, "ShaderNodeTexNoise", "BUMP_NOISE_TEXTURE")
        noise.inputs["Scale"].default_value = 35.0
        noise.inputs["Detail"].default_value = 4.0
        bump = _new_node(nodes, "ShaderNodeBump", "BUMP_NODE")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.035
        _link(links, noise.outputs["Fac"], bump.inputs["Height"])
        if normal_node is not None and "Normal" in bump.inputs:
            _link(links, nmap.outputs["Normal"], bump.inputs["Normal"])
        _link(links, bump.outputs["Normal"], normal_socket)

    metallic_value = 1.0 if item.get("template") == "METAL_MASTER" else float(profile.get("metallic", 0.0))
    if metallic_node is not None:
        _link(links, metallic_node.outputs["Color"], get_principled_input_safe(bsdf, ["Metallic"]))
    else:
        set_principled_input_safe(bsdf, ["Metallic"], metallic_value)

    refl = request["reflectivity"]
    set_principled_input_safe(bsdf, ["Specular IOR Level", "Specular"], float(profile.get("specularLevel", refl)))
    set_principled_input_safe(bsdf, ["Coat Weight", "Clearcoat"], float(profile.get("coatWeight", profile.get("clearcoatWeight", 0.0))) * refl)
    set_principled_input_safe(bsdf, ["Coat Roughness", "Clearcoat Roughness"], float(profile.get("coatRoughness", profile.get("clearcoatRoughness", 0.5))))
    set_principled_input_safe(bsdf, ["Alpha"], float(profile.get("alpha", 1.0)))
    set_principled_input_safe(bsdf, ["IOR"], float(profile.get("ior", 1.45)))
    set_principled_input_safe(bsdf, ["Transmission Weight", "Transmission"], float(profile.get("transmission", 0.0)))
    if "anisotropy" in profile:
        set_principled_input_safe(bsdf, ["Anisotropic IOR Level", "Anisotropic"], float(profile["anisotropy"]))

    if opacity_node is not None:
        _link(links, opacity_node.outputs["Color"], get_principled_input_safe(bsdf, ["Alpha"]))
        _set_material_alpha(mat, 0.8)
    elif item.get("template") == "GLASS_MASTER" or "alpha" in profile:
        _set_material_alpha(mat, float(profile.get("alpha", 0.45)))

    if displacement_node is not None:
        displacement = _new_node(nodes, "ShaderNodeDisplacement", "DISPLACEMENT_NODE")
        try:
            displacement.inputs["Scale"].default_value = 0.018
            displacement.inputs["Midlevel"].default_value = 0.5
        except Exception:
            pass
        _link(links, displacement_node.outputs["Color"], displacement.inputs["Height"])
        _link(links, displacement.outputs["Displacement"], output.inputs["Displacement"])

    mat["material_id"] = material_id
    mat["surface_profile"] = profile_id
    mat["surfaceProfile"] = profile_id
    mat["template"] = item.get("template")
    mat["tile_size_meters"] = request["tile_size_meters"]
    mat["tileSizeMeters"] = request["tile_size_meters"]
    mat["uv_scale"] = request["uv_scale"]
    mat["uvScale"] = request["uv_scale"]
    mat["uv_layer"] = PHYSICAL_UV_LAYER
    mat["usesPhysicalUV"] = True
    return mat


def create_or_update_material_from_assignment(
    material_name: str,
    base_color_texture_path: str | None,
    surface_profile: str,
    uv_scale: float,
    tile_size_meters: float | None = None,
    grain_direction: str = "vertical",
    normal_texture_path: str | None = None,
    roughness_texture_path: str | None = None,
    ao_texture_path: str | None = None,
    displacement_texture_path: str | None = None,
    color_transform: dict[str, Any] | None = None,
    roughness_multiplier: float = 1.0,
    roughness_override: float | None = None,
    bump_multiplier: float = 1.0,
    grain_depth: float = 0.0,
    coat_multiplier: float = 1.0,
    procedural_template: str | None = None,
    grain_pattern_id: str | None = None,
    mapping_status: str | None = None,
    mapping_locked: bool = False,
    confidence: float | None = None,
    project_root: str | None = None,
) -> Any:
    if bpy is None:
        raise RuntimeError("material_loader.py must run inside Blender for material creation.")

    root = resolve_project_path(project_root)
    try:
        profiles = load_json(root / "backend" / "materials" / "surface_profiles.json")
    except Exception:
        profiles = {}
    profile_id = surface_profile if surface_profile in profiles else "generic_matte"
    if profile_id not in profiles:
        profiles[profile_id] = {
            "roughnessBase": 0.55,
            "roughnessVariation": 0.03,
            "bumpStrength": 0.0,
            "specularLevel": 0.30,
            "coatWeight": 0.0,
            "coatRoughness": 0.5,
            "category": "generic",
        }
    if profile_id != surface_profile:
        print(f"[warn] Unknown surface profile {surface_profile!r}; using generic_matte")
    profile = profiles[profile_id]
    tile = float(tile_size_meters) if tile_size_meters else (1.0 / float(uv_scale))

    mat = bpy.data.materials.get(material_name) or bpy.data.materials.new(material_name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    uvmap = _new_node(nodes, "ShaderNodeUVMap", "UV_PHYSICAL_METERS")
    uvmap.uv_map = PHYSICAL_UV_LAYER
    mapping = _new_node(nodes, "ShaderNodeMapping", "MAPPING_PHYSICAL_SCALE")
    _set_mapping(mapping, float(uv_scale), 90.0 if grain_direction == "horizontal" else 0.0)
    output = _new_node(nodes, "ShaderNodeOutputMaterial", "MATERIAL_OUTPUT")
    bsdf = _new_node(nodes, "ShaderNodeBsdfPrincipled", "PRINCIPLED_BSDF")
    _link(links, uvmap.outputs["UV"], mapping.inputs["Vector"])
    _link(links, bsdf.outputs["BSDF"], output.inputs["Surface"])

    image = load_image_safe(base_color_texture_path)
    roughness_image = load_image_safe(roughness_texture_path)
    normal_image = load_image_safe(normal_texture_path)
    ao_image = load_image_safe(ao_texture_path)
    displacement_image = load_image_safe(displacement_texture_path)
    base_node = _image_node(nodes, image, "BASE_COLOR_TEXTURE", "sRGB")
    roughness_node = _image_node(nodes, roughness_image, "ROUGHNESS_TEXTURE", "Non-Color")
    normal_node = _image_node(nodes, normal_image, "NORMAL_TEXTURE", "Non-Color")
    ao_node = _image_node(nodes, ao_image, "AO_TEXTURE", "Non-Color")
    displacement_node = _image_node(nodes, displacement_image, "DISPLACEMENT_TEXTURE", "Non-Color")
    effective_color_transform = dict(color_transform or {})
    if base_node is not None and _color_transform_data(effective_color_transform)["mode"] == "tint_mix":
        effective_color_transform["mode"] = "tint_multiply"
    transform = _color_transform_data(effective_color_transform)
    if base_node is not None:
        _connect_vector(mapping, [base_node, roughness_node, normal_node, ao_node, displacement_node])
        color_output = base_node.outputs["Color"]
        if ao_node is not None:
            ao_mix = _new_node(nodes, "ShaderNodeMixRGB", "AO_MULTIPLY")
            ao_mix.blend_type = "MULTIPLY"
            ao_mix.inputs["Fac"].default_value = 0.35
            _link(links, color_output, ao_mix.inputs["Color1"])
            _link(links, ao_node.outputs["Color"], ao_mix.inputs["Color2"])
            color_output = ao_mix.outputs["Color"]
        _apply_color_transform(nodes, links, bsdf, color_output, effective_color_transform)
    else:
        noise_color = _new_node(nodes, "ShaderNodeTexNoise", "BASE_COLOR_PROCEDURAL_WOOD")
        pattern = grain_pattern_id or procedural_template or ""
        scale = 9.0
        detail = 10.0
        if "fine" in pattern:
            scale = 18.0
            detail = 12.0
        elif "deep" in pattern or "rustic" in pattern:
            scale = 6.0
            detail = 14.0
        elif "subtle" in pattern:
            scale = 13.0
            detail = 6.0
        noise_color.inputs["Scale"].default_value = scale
        noise_color.inputs["Detail"].default_value = detail
        ramp_color = _new_node(nodes, "ShaderNodeValToRGB", "BASE_COLOR_PROCEDURAL_RAMP")
        base_rgba = hex_to_rgba(transform.get("baseColorHex")) or (0.82, 0.58, 0.32, 1.0)
        grain_rgba = hex_to_rgba(transform.get("grainColorHex")) or (0.48, 0.30, 0.16, 1.0)
        contrast = transform.get("grainContrast", 0.3)
        ramp_color.color_ramp.elements[0].position = max(0.05, min(0.45, 0.5 - contrast * 0.45))
        ramp_color.color_ramp.elements[0].color = grain_rgba
        ramp_color.color_ramp.elements[1].position = min(0.98, max(0.55, 0.5 + contrast * 0.45))
        ramp_color.color_ramp.elements[1].color = base_rgba
        _link(links, mapping.outputs["Vector"], noise_color.inputs["Vector"])
        _link(links, noise_color.outputs["Fac"], ramp_color.inputs["Fac"])
        _apply_color_transform(nodes, links, bsdf, ramp_color.outputs["Color"], effective_color_transform)

    rough_base = float(roughness_override) if roughness_override is not None else max(0.02, min(0.98, float(profile.get("roughnessBase", 0.55)) * float(roughness_multiplier)))
    rough_var = float(profile.get("roughnessVariation", 0.03))
    rough_socket = get_principled_input_safe(bsdf, ["Roughness"])
    if rough_socket is not None:
        if roughness_node is not None and roughness_override is None:
            roughness_mix = _new_node(nodes, "ShaderNodeMix", "ROUGHNESS_TEXTURE_PROFILE_MIX")
            try:
                roughness_mix.data_type = "FLOAT"
                roughness_mix.factor_mode = "UNIFORM"
                roughness_mix.inputs["Factor"].default_value = 0.35
                roughness_mix.inputs[6].default_value = rough_base
                _link(links, roughness_node.outputs["Color"], roughness_mix.inputs[7])
                _link(links, roughness_mix.outputs[0], rough_socket)
            except Exception:
                _link(links, roughness_node.outputs["Color"], rough_socket)
            rough_socket = None
        if rough_socket is not None:
            rough_noise = _new_node(nodes, "ShaderNodeTexNoise", "ROUGHNESS_NOISE")
            rough_noise.inputs["Scale"].default_value = 18.0
            rough_noise.inputs["Detail"].default_value = 6.0
            rough_ramp = _new_node(nodes, "ShaderNodeValToRGB", "ROUGHNESS_RAMP")
            lo = max(0.02, min(0.98, rough_base - rough_var * 0.5))
            hi = max(0.02, min(0.98, rough_base + rough_var * 0.5))
            rough_ramp.color_ramp.elements[0].color = (lo, lo, lo, 1.0)
            rough_ramp.color_ramp.elements[1].color = (hi, hi, hi, 1.0)
            _link(links, rough_noise.outputs["Fac"], rough_ramp.inputs["Fac"])
            _link(links, rough_ramp.outputs["Color"], rough_socket)

    bump_strength = (float(profile.get("bumpStrength", profile.get("normalStrength", 0.0))) + float(grain_depth) * 0.08) * float(bump_multiplier)
    normal_socket = get_principled_input_safe(bsdf, ["Normal"])
    if normal_socket is not None and bump_strength > 0.001:
        bump_noise = _new_node(nodes, "ShaderNodeTexNoise", "BUMP_NOISE_TEXTURE")
        bump_noise.inputs["Scale"].default_value = 35.0
        bump_noise.inputs["Detail"].default_value = 4.0
        bump = _new_node(nodes, "ShaderNodeBump", "BUMP_NODE")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.035
        _link(links, bump_noise.outputs["Fac"], bump.inputs["Height"])
        if normal_node is not None:
            normal_map = _new_node(nodes, "ShaderNodeNormalMap", "NORMAL_MAP_NODE")
            normal_map.inputs["Strength"].default_value = min(1.0, bump_strength)
            _link(links, normal_node.outputs["Color"], normal_map.inputs["Color"])
            _link(links, normal_map.outputs["Normal"], bump.inputs["Normal"])
        _link(links, bump.outputs["Normal"], normal_socket)

    set_principled_input_safe(bsdf, ["Metallic"], float(profile.get("metallic", 0.0)))
    set_principled_input_safe(bsdf, ["Specular IOR Level", "Specular"], float(profile.get("specularLevel", 0.30)))
    set_principled_input_safe(bsdf, ["Coat Weight", "Clearcoat"], float(profile.get("coatWeight", profile.get("clearcoatWeight", 0.0))) * float(coat_multiplier))
    set_principled_input_safe(bsdf, ["Coat Roughness", "Clearcoat Roughness"], float(profile.get("coatRoughness", profile.get("clearcoatRoughness", 0.5))))

    if displacement_node is not None:
        displacement = _new_node(nodes, "ShaderNodeDisplacement", "DISPLACEMENT_NODE")
        try:
            displacement.inputs["Scale"].default_value = 0.018
            displacement.inputs["Midlevel"].default_value = 0.5
        except Exception:
            pass
        _link(links, displacement_node.outputs["Color"], displacement.inputs["Height"])
        _link(links, displacement.outputs["Displacement"], output.inputs["Displacement"])

    mat["surfaceProfile"] = profile_id
    mat["tileSizeMeters"] = tile
    mat["uvScale"] = float(uv_scale)
    mat["usesPhysicalUV"] = True
    mat["normalTexture"] = normal_texture_path or ""
    mat["roughnessTexture"] = roughness_texture_path or ""
    mat["aoTexture"] = ao_texture_path or ""
    mat["displacementTexture"] = displacement_texture_path or ""
    mat["colorTransformMode"] = transform["mode"]
    mat["baseColorHex"] = transform.get("baseColorHex") or ""
    mat["grainColorHex"] = transform.get("grainColorHex") or ""
    mat["tintStrength"] = transform["tintStrength"]
    mat["grainContrast"] = transform["grainContrast"]
    mat["roughnessMultiplier"] = float(roughness_multiplier)
    mat["roughnessOverride"] = roughness_override if roughness_override is not None else ""
    mat["bumpMultiplier"] = float(bump_multiplier)
    mat["grainDepth"] = float(grain_depth)
    mat["proceduralTemplate"] = procedural_template or ""
    mat["grainPatternId"] = grain_pattern_id or ""
    mat["mappingStatus"] = mapping_status or ""
    mat["mappingLocked"] = bool(mapping_locked)
    mat["confidence"] = confidence if confidence is not None else ""
    mat["usesExternalVendorTexture"] = False
    return mat


def _resolve_payload(payload: dict[str, Any], project_root: Path) -> dict[str, Any]:
    backend_dir = project_root / "backend" / "materials"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    from material_resolver import resolve_material_request

    return resolve_material_request(payload, str(project_root))


def create_material_from_payload(
    payload: dict[str, Any],
    material_name: str | None = None,
    project_root: str | None = None,
) -> Any:
    if bpy is None:
        raise RuntimeError("material_loader.py must run inside Blender for material creation.")
    root = resolve_project_path(project_root)
    resolved = _resolve_payload(payload, root)
    if resolved.get("baseColorTexture") or resolved.get("vendorDecorId"):
        texture_path = _project_file(root, resolved.get("baseColorTexture"))
        normal_path = _project_file(root, resolved.get("normalTexture"))
        roughness_path = _project_file(root, resolved.get("roughnessTexture"))
        ao_path = _project_file(root, resolved.get("aoTexture"))
        displacement_path = _project_file(root, resolved.get("displacementTexture"))
        mat = create_or_update_material_from_assignment(
            material_name=material_name or f"{resolved.get('vendorDecorId') or resolved.get('materialId')}__{resolved.get('surfaceProfile')}",
            base_color_texture_path=str(texture_path) if texture_path and texture_path.exists() else None,
            surface_profile=str(resolved["surfaceProfile"]),
            uv_scale=float(resolved["uvScale"]),
            tile_size_meters=float(resolved["tileSizeMeters"]),
            grain_direction=str(resolved.get("grainDirection", "none")),
            normal_texture_path=str(normal_path) if normal_path and normal_path.exists() else None,
            roughness_texture_path=str(roughness_path) if roughness_path and roughness_path.exists() else None,
            ao_texture_path=str(ao_path) if ao_path and ao_path.exists() else None,
            displacement_texture_path=str(displacement_path) if displacement_path and displacement_path.exists() else None,
            color_transform=resolved.get("colorTransform"),
            roughness_multiplier=float(resolved.get("roughnessMultiplier", 1.0) or 1.0),
            roughness_override=resolved.get("roughnessOverride"),
            bump_multiplier=float(resolved.get("bumpMultiplier", 1.0) or 1.0),
            grain_depth=float(resolved.get("grainDepth", 0.0) or 0.0),
            coat_multiplier=float(resolved.get("coatMultiplier", 1.0) or 1.0),
            procedural_template=resolved.get("proceduralTemplate"),
            grain_pattern_id=resolved.get("grainPatternId"),
            mapping_status=resolved.get("mappingStatus"),
            mapping_locked=bool(resolved.get("mappingLocked", False)),
            confidence=resolved.get("confidence"),
            project_root=str(root),
        )
        mat["vendor"] = resolved.get("vendor", "")
        mat["vendorDecorId"] = resolved.get("vendorDecorId", "")
        mat["targetInternalMaterialId"] = resolved.get("targetInternalMaterialId", resolved.get("materialId", ""))
        mat["material_id"] = resolved.get("materialId", "")
        mat["grainDirection"] = resolved.get("grainDirection", "none")
        mat["mappingStatus"] = resolved.get("mappingStatus", "")
        mat["catalogMode"] = resolved.get("catalogMode", "production")
        mat["productionSafe"] = bool(resolved.get("productionSafe", False))
        mat["assetStatus"] = resolved.get("assetStatus", "")
        mat["usesFallbackAsset"] = bool(resolved.get("usesFallbackAsset", False))
        mat["usesExternalVendorTexture"] = bool(resolved.get("usesExternalVendorTexture", False))
        mat["warnings"] = "; ".join(resolved.get("warnings", []))
        if resolved.get("assetStatus") == "missing_asset":
            print(f"[warn] {resolved.get('vendorDecorId') or resolved.get('materialId')} has missing asset; procedural fallback was used")
        if resolved.get("assetStatus") == "fallback_asset":
            print(f"[warn] {resolved.get('vendorDecorId')} uses fallback asset {resolved.get('fallbackAsset')}")
        return mat
    return create_material_from_manifest(
        material_id=str(resolved["materialId"]),
        surface_profile=resolved.get("surfaceProfile"),
        base_color=resolved.get("baseColor"),
        tile_size_meters=resolved.get("tileSizeMeters"),
        uv_scale=resolved.get("uvScale"),
        rotation_degrees=float(resolved.get("rotation", 0.0)),
        grain_direction=resolved.get("grainDirection"),
        texture_strength=resolved.get("textureStrength"),
        reflectivity=resolved.get("reflectivity"),
        material_name=material_name,
        project_root=str(root),
    )
