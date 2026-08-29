from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from demos_mapping_safety import is_production_safe_demos_mapping


HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
GRAIN_DIRECTIONS = {"horizontal", "vertical", "lengthwise", "none"}
LEGACY_GRAIN_DIRECTIONS = {None, "auto"}
COLOR_MODES = {"none", "tint_multiply", "tint_mix", "solid_color", "hsv_adjust"}


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def _manifest_by_id(project_root: Path) -> dict[str, dict[str, Any]]:
    items = load_json(project_root / "backend" / "materials" / "material_manifest.json")
    return {item["id"]: item for item in items}


def _profiles(project_root: Path) -> dict[str, dict[str, Any]]:
    return load_json(project_root / "backend" / "materials" / "surface_profiles.json")


def _demos_mappings(project_root: Path, catalog_mode: str = "production") -> list[dict[str, Any]]:
    suffix = "_staging" if catalog_mode == "staging" else ""
    path = project_root / "backend" / "materials" / "vendor_catalogs" / f"demos_decor_mappings{suffix}.json"
    if not path.exists():
        return []
    records = load_json(path)
    return records if isinstance(records, list) else []


def _demos_mapping_by_id(project_root: Path, catalog_mode: str = "production") -> dict[str, dict[str, Any]]:
    return {str(item.get("vendorDecorId")): item for item in _demos_mappings(project_root, catalog_mode) if isinstance(item, dict)}


def _number_or_default(request: dict[str, Any], key: str, default: float) -> float:
    value = request.get(key)
    if value is None:
        return float(default)
    return float(value)


def _tile_and_uv_with_warnings(request: dict[str, Any], defaults: dict[str, Any]) -> tuple[float, float, list[str]]:
    warnings: list[str] = []
    tile_value = request.get("tileSizeMeters")
    uv_value = request.get("uvScale")
    if tile_value is not None:
        tile = float(tile_value)
        uv = 1.0 / tile
        if uv_value is not None and abs(float(uv_value) - uv) >= 0.001:
            warnings.append("tileSizeMeters and uvScale are inconsistent; tileSizeMeters was used")
        return tile, uv, warnings
    if uv_value is not None:
        uv = float(uv_value)
        return 1.0 / uv, uv, warnings
    tile = float(defaults.get("tileSizeMeters", 0.4))
    return tile, float(defaults.get("uvScale", defaults.get("uvScaleDefault", 1.0 / tile))), warnings


def _grain_direction(request: dict[str, Any], material: dict[str, Any]) -> str:
    grain = request.get("grainDirection")
    if grain in LEGACY_GRAIN_DIRECTIONS:
        return str(material.get("grainDirectionDefault", "none"))
    return str(grain)


def _manifest_maps(material: dict[str, Any]) -> tuple[str | None, str | None, str | None, str | None, str | None]:
    maps = material.get("maps", {}) if isinstance(material.get("maps"), dict) else {}
    return maps.get("basecolor"), maps.get("normal"), maps.get("roughness"), maps.get("ao"), maps.get("displacement")


def _color_transform(value: Any | None) -> dict[str, Any]:
    data = value if isinstance(value, dict) else {}
    mode = data.get("mode", "none")
    if mode not in COLOR_MODES:
        mode = "none"
    base_color = data.get("baseColorHex")
    if base_color is not None and (not isinstance(base_color, str) or not HEX_RE.match(base_color)):
        base_color = None
    return {
        "mode": mode,
        "baseColorHex": base_color,
        "grainColorHex": data.get("grainColorHex") if isinstance(data.get("grainColorHex"), str) and HEX_RE.match(data["grainColorHex"]) else None,
        "secondaryColorHex": data.get("secondaryColorHex") if isinstance(data.get("secondaryColorHex"), str) and HEX_RE.match(data["secondaryColorHex"]) else None,
        "tintStrength": max(0.0, min(1.0, float(data.get("tintStrength", 0.0) or 0.0))),
        "grainContrast": max(0.0, min(1.0, float(data.get("grainContrast", 0.0) or 0.0))),
        "hueShiftDegrees": float(data.get("hueShiftDegrees", 0.0) or 0.0),
        "saturationScale": float(data.get("saturationScale", 1.0) or 1.0),
        "valueScale": float(data.get("valueScale", 1.0) or 1.0),
        "contrastScale": float(data.get("contrastScale", 1.0) or 1.0),
    }


def validate_material_request(request: dict[str, Any], manifest: dict[str, dict[str, Any]]) -> list[str]:
    messages: list[str] = []
    if isinstance(request.get("vendor"), str) and isinstance(request.get("vendorDecorId"), str):
        return messages
    material_id = request.get("materialId")
    if not isinstance(material_id, str) or material_id not in manifest:
        return [f"Unknown materialId: {material_id!r}"]

    material = manifest[material_id]
    surface_profile = request.get("surfaceProfile") or material.get("surfaceProfileDefault") or material.get("defaultSurfaceProfile")
    if surface_profile not in material.get("allowedSurfaceProfiles", []):
        messages.append(f"surfaceProfile {surface_profile!r} is not allowed for {material_id}")

    base_color = request.get("baseColor")
    if base_color is not None and (not isinstance(base_color, str) or not HEX_RE.match(base_color)):
        messages.append("baseColor must be #RRGGBB or null")

    ranges = {
        "uvScale": (0.1, 10.0),
        "tileSizeMeters": (0.01, 10.0),
        "rotation": (0.0, 360.0),
        "textureStrength": (0.0, 1.0),
        "reflectivity": (0.0, 1.0),
    }
    for key, (lo, hi) in ranges.items():
        if key in request and request[key] is not None:
            value = request[key]
            if not isinstance(value, (int, float)) or not lo <= float(value) <= hi:
                messages.append(f"{key} must be a number from {lo} to {hi}")

    grain = request.get("grainDirection")
    if grain not in GRAIN_DIRECTIONS and grain not in LEGACY_GRAIN_DIRECTIONS:
        messages.append("grainDirection must be vertical, horizontal, lengthwise, none, auto, or null")
    return messages


def resolve_material_request(
    request: dict[str, Any],
    project_root: str,
    catalogMode: str = "production",
    allowUnreviewed: bool = False,
) -> dict[str, Any]:
    root = Path(project_root).resolve()
    manifest = _manifest_by_id(root)
    profiles = _profiles(root)

    explicit_material_id = request.get("targetInternalMaterialId") or request.get("materialId")
    if (
        isinstance(request.get("vendor"), str)
        and isinstance(request.get("vendorDecorId"), str)
        and isinstance(explicit_material_id, str)
        and explicit_material_id in manifest
    ):
        material = manifest[explicit_material_id]
        surface_profile = request.get("surfaceProfile") or material.get("surfaceProfileDefault") or material["defaultSurfaceProfile"]
        if surface_profile not in profiles:
            raise ValueError(f"Unknown surfaceProfile: {surface_profile!r}")
        tile_size, uv_scale, warnings = _tile_and_uv_with_warnings(request, {
            "tileSizeMeters": material.get("tileSizeMeters", 0.4),
            "uvScale": material.get("uvScaleDefault", 2.5),
        })
        base_map, normal_map, roughness_map, ao_map, displacement_map = _manifest_maps(material)
        grain = _grain_direction(request, material)
        return {
            "materialId": material["id"],
            "vendor": request.get("vendor"),
            "vendorDecorId": request.get("vendorDecorId"),
            "displayName": request.get("displayName"),
            "category": material.get("category", "generic"),
            "template": material.get("template"),
            "baseColorTexture": base_map,
            "normalTexture": normal_map,
            "roughnessTexture": roughness_map,
            "aoTexture": ao_map,
            "displacementTexture": displacement_map,
            "targetInternalMaterialId": material["id"],
            "proceduralTemplate": request.get("proceduralTemplate") or material.get("proceduralTemplate"),
            "grainPatternId": request.get("grainPatternId"),
            "surfaceProfile": surface_profile,
            "baseColor": request.get("baseColor"),
            "tileSizeMeters": tile_size,
            "uvScale": uv_scale,
            "rotation": _number_or_default(request, "rotation", material.get("rotationDefault", 0.0)),
            "textureStrength": _number_or_default(request, "textureStrength", material.get("textureStrengthDefault", 0.5)),
            "reflectivity": _number_or_default(request, "reflectivity", material.get("reflectivityDefault", 0.35)),
            "grainDirection": grain,
            "colorTransform": _color_transform(request.get("colorTransform")),
            "roughnessMultiplier": float(request.get("roughnessMultiplier", 1.0) or 1.0),
            "roughnessOverride": request.get("roughnessOverride"),
            "bumpMultiplier": float(request.get("bumpMultiplier", 1.0) or 1.0),
            "grainDepth": float(request.get("grainDepth", 0.0) or 0.0),
            "coatMultiplier": float(request.get("coatMultiplier", 1.0) or 1.0),
            "mappingStatus": request.get("mappingStatus", ""),
            "mappingLocked": bool(request.get("mappingLocked", False)),
            "confidence": request.get("confidence"),
            "catalogMode": request.get("catalogMode", "app_review"),
            "productionSafe": bool(request.get("productionSafe", False)),
            "maps": material.get("maps", {}),
            "profileValues": profiles[surface_profile],
            "fallbackBaseColor": material.get("fallbackBaseColor"),
            "usesExternalVendorTexture": False,
            "warnings": warnings,
        }

    if isinstance(request.get("vendor"), str) and isinstance(request.get("vendorDecorId"), str):
        vendor = str(request["vendor"])
        vendor_decor_id = str(request["vendorDecorId"])
        if vendor != "demos":
            raise ValueError(f"Unsupported vendor: {vendor}")
        mode = str(request.get("catalogMode") or catalogMode or "production")
        if mode not in {"production", "staging"}:
            mode = "production"
        allow_unreviewed = bool(request.get("allowUnreviewed", allowUnreviewed))
        mapping = _demos_mapping_by_id(root, mode).get(vendor_decor_id)
        if mapping is None:
            raise ValueError(f"Unknown vendor decor: {vendor}/{vendor_decor_id}")
        production_safe, safety_reasons = is_production_safe_demos_mapping(mapping, manifest, profiles)
        if not production_safe and not allow_unreviewed:
            raise ValueError(f"Demos mapping {vendor_decor_id!r} is not production-safe: {'; '.join(safety_reasons)}")

        warnings: list[str] = []
        target_material_id = str(request.get("targetInternalMaterialId") or mapping.get("targetInternalMaterialId") or "")
        material = manifest.get(target_material_id)
        if material is None:
            raise ValueError(f"Demos mapping {vendor_decor_id!r} references unknown targetInternalMaterialId {target_material_id!r}")

        material_type = str(mapping.get("materialType", material.get("category", "generic")))
        default_profile = "wood_standard_matte" if material_type == "wood" else "generic_matte"
        surface_profile = request.get("surfaceProfile") or mapping.get("surfaceProfile") or material.get("surfaceProfileDefault") or default_profile
        if surface_profile not in profiles:
            raise ValueError(f"Unknown surfaceProfile: {surface_profile!r}")

        tile_size, uv_scale, tile_warnings = _tile_and_uv_with_warnings(request, {
            "tileSizeMeters": mapping.get("tileSizeMeters", material.get("tileSizeMeters", 0.4)),
            "uvScale": mapping.get("uvScale", material.get("uvScaleDefault", 2.5)),
        })
        warnings.extend(tile_warnings)

        grain = request.get("grainDirection")
        if grain in LEGACY_GRAIN_DIRECTIONS:
            grain = mapping.get("grainDirectionDefault") or material.get("grainDirectionDefault") or ("vertical" if material_type == "wood" else "none")
        if grain not in GRAIN_DIRECTIONS:
            raise ValueError("grainDirection must be vertical, horizontal, lengthwise, none, auto, or null")

        transform = _color_transform(request.get("colorTransform") or mapping.get("colorTransform"))
        if transform["mode"] in {"tint_multiply", "tint_mix", "solid_color"} and not transform.get("baseColorHex"):
            warnings.append("colorTransform uses color mode but baseColorHex is missing")

        base_map, normal_map, roughness_map, ao_map, displacement_map = _manifest_maps(material)
        return {
            "materialId": material["id"],
            "vendor": vendor,
            "vendorDecorId": vendor_decor_id,
            "displayName": mapping.get("displayName"),
            "category": material.get("category", material_type),
            "template": material.get("template"),
            "baseColorTexture": base_map,
            "normalTexture": normal_map,
            "roughnessTexture": roughness_map,
            "aoTexture": ao_map,
            "displacementTexture": displacement_map,
            "proceduralTemplate": mapping.get("proceduralTemplate") or material.get("proceduralTemplate"),
            "grainPatternId": mapping.get("grainPatternId"),
            "surfaceProfile": surface_profile,
            "baseColor": request.get("baseColor"),
            "tileSizeMeters": tile_size,
            "uvScale": uv_scale,
            "rotation": _number_or_default(request, "rotation", 0.0),
            "textureStrength": _number_or_default(request, "textureStrength", material.get("textureStrengthDefault", 0.5)),
            "reflectivity": _number_or_default(request, "reflectivity", material.get("reflectivityDefault", 0.35)),
            "grainDirection": grain,
            "colorTransform": transform,
            "roughnessMultiplier": float(request.get("roughnessMultiplier", mapping.get("roughnessMultiplier", 1.0)) or 1.0),
            "roughnessOverride": request.get("roughnessOverride", mapping.get("roughnessOverride")),
            "bumpMultiplier": float(request.get("bumpMultiplier", mapping.get("bumpMultiplier", 1.0)) or 1.0),
            "grainDepth": float(request.get("grainDepth", mapping.get("grainDepth", 0.0)) or 0.0),
            "coatMultiplier": float(request.get("coatMultiplier", mapping.get("coatMultiplier", 1.0)) or 1.0),
            "patternRotationDegrees": float(request.get("patternRotationDegrees", mapping.get("patternRotationDegrees", 0.0)) or 0.0),
            "edgeStrategy": mapping.get("edgeStrategy"),
            "edgeColorHex": mapping.get("edgeColorHex"),
            "mappingStatus": mapping.get("mappingStatus", "mapped"),
            "mappingLocked": bool(mapping.get("mappingLocked", False)),
            "confidence": mapping.get("confidence"),
            "colorSourceMethod": mapping.get("colorSourceMethod"),
            "reviewedBy": mapping.get("reviewedBy"),
            "reviewedAt": mapping.get("reviewedAt"),
            "targetInternalMaterialId": material["id"],
            "catalogMode": mode,
            "productionSafe": production_safe,
            "usesExternalVendorTexture": False,
            "maps": material.get("maps", {}),
            "profileValues": profiles[surface_profile],
            "fallbackBaseColor": material.get("fallbackBaseColor"),
            "warnings": warnings,
        }

    errors = validate_material_request(request, manifest)
    if errors:
        raise ValueError("; ".join(errors))

    material = manifest[request["materialId"]]
    surface_profile = request.get("surfaceProfile") or material.get("surfaceProfileDefault") or material["defaultSurfaceProfile"]
    profile_values = profiles[surface_profile]
    base_map, normal_map, roughness_map, ao_map, displacement_map = _manifest_maps(material)

    tile_size, uv_scale, warnings = _tile_and_uv_with_warnings(request, {
        "tileSizeMeters": material.get("tileSizeMeters", 0.4),
        "uvScale": material.get("uvScaleDefault", 2.5),
    })
    rotation = _number_or_default(request, "rotation", material.get("rotationDefault", 0.0))
    grain = _grain_direction(request, material)
    if material.get("category") == "wood":
        if grain == "vertical":
            rotation = 0.0
        elif grain == "horizontal":
            rotation = 90.0
        elif grain == "lengthwise":
            rotation = 0.0

    return {
        "materialId": material["id"],
        "category": material["category"],
        "template": material["template"],
        "baseColorTexture": base_map,
        "normalTexture": normal_map,
        "roughnessTexture": roughness_map,
        "aoTexture": ao_map,
        "displacementTexture": displacement_map,
        "targetInternalMaterialId": material["id"],
        "proceduralTemplate": request.get("proceduralTemplate") or material.get("proceduralTemplate"),
        "grainPatternId": request.get("grainPatternId"),
        "surfaceProfile": surface_profile,
        "baseColor": request.get("baseColor"),
        "tileSizeMeters": tile_size,
        "uvScale": uv_scale,
        "rotation": rotation,
        "textureStrength": _number_or_default(request, "textureStrength", material.get("textureStrengthDefault", 0.5)),
        "reflectivity": _number_or_default(request, "reflectivity", material.get("reflectivityDefault", 0.35)),
        "grainDirection": grain,
        "colorTransform": _color_transform(request.get("colorTransform")),
        "roughnessMultiplier": float(request.get("roughnessMultiplier", 1.0) or 1.0),
        "roughnessOverride": request.get("roughnessOverride"),
        "bumpMultiplier": float(request.get("bumpMultiplier", 1.0) or 1.0),
        "grainDepth": float(request.get("grainDepth", 0.0) or 0.0),
        "coatMultiplier": float(request.get("coatMultiplier", 1.0) or 1.0),
        "mappingStatus": request.get("mappingStatus", ""),
        "mappingLocked": bool(request.get("mappingLocked", False)),
        "confidence": request.get("confidence"),
        "catalogMode": request.get("catalogMode", "internal"),
        "productionSafe": bool(request.get("productionSafe", True)),
        "maps": material.get("maps", {}),
        "profileValues": profile_values,
        "fallbackBaseColor": material.get("fallbackBaseColor"),
        "usesExternalVendorTexture": False,
        "warnings": warnings,
    }
