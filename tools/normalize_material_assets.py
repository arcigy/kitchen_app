from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MAP_ROLES = ["basecolor", "roughness", "normal", "ao", "displacement", "metallic", "opacity"]
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".exr", ".hdr"}
PBR_EXT_PREFERENCE = {".jpg": 5, ".jpeg": 5, ".png": 4, ".tif": 3, ".tiff": 3, ".exr": 2, ".hdr": 1}
IGNORE_TOKENS = ["preview", "sphere", "thumb", "thumbnail", "render", "sample"]


@dataclass(frozen=True)
class AssetSpec:
    asset_id: str
    backend_id: str
    category: str
    template: str
    label: str
    default_profile: str
    allowed_profiles: list[str]
    aliases: list[str]


WOOD_PROFILES = [
    "wood_raw_matte",
    "wood_standard_matte",
    "wood_soft_touch_supermat",
    "wood_satin_lacquer",
    "wood_gloss_laminate",
]
LACQUER_PROFILES = ["lacquer_supermat", "lacquer_matte", "lacquer_satin", "lacquer_gloss"]
STONE_PROFILES = ["stone_matte", "stone_satin", "stone_polished", "stone_textured"]
METAL_PROFILES = ["metal_matte", "metal_satin", "metal_brushed", "metal_polished", "metal_matte_black"]
WALL_PROFILES = ["wall_matte"]
TILE_PROFILES = ["tile_satin"]
OVERLAY_PROFILES = ["overlay_map"]
GENERIC_PROFILE = "generic_matte"


EXPECTED_ASSETS: list[AssetSpec] = [
    AssetSpec("Wood049", "wood_oak_natural", "wood", "WOOD_MASTER", "Natural Oak", "wood_standard_matte", WOOD_PROFILES, []),
    AssetSpec("Wood051", "wood_dark_espresso", "wood", "WOOD_MASTER", "Dark Espresso Wood", "wood_satin_lacquer", WOOD_PROFILES, []),
    AssetSpec("Wood092", "wood_warm_clean", "wood", "WOOD_MASTER", "Warm Clean Wood", "wood_standard_matte", WOOD_PROFILES, []),
    AssetSpec("Wood048", "wood_light_plain", "wood", "WOOD_MASTER", "Light Plain Wood", "wood_soft_touch_supermat", WOOD_PROFILES, []),
    AssetSpec("Wood067", "wood_dark_smooth", "wood", "WOOD_MASTER", "Dark Smooth Wood", "wood_standard_matte", WOOD_PROFILES, []),
    AssetSpec("Wood076", "wood_dark_rough", "wood", "WOOD_MASTER", "Dark Rough Wood", "wood_raw_matte", WOOD_PROFILES, []),
    AssetSpec("wood_table_001", "wood_varnished_satin", "wood", "WOOD_MASTER", "Varnished Satin Wood", "wood_satin_lacquer", WOOD_PROFILES, ["Wood050", "Wood058", "Wood001", "Wood095"]),
    AssetSpec("Plastic013A", "lacquer_base_white", "lacquer", "LACQUER_MASTER", "Base White Lacquer", "lacquer_satin", LACQUER_PROFILES, []),
    AssetSpec("Marble012", "stone_marble_white_grey", "stone", "STONE_MASTER", "White Grey Marble", "stone_polished", STONE_PROFILES, []),
    AssetSpec("Marble021", "stone_marble_bright_white", "stone", "STONE_MASTER", "Bright White Marble", "stone_polished", STONE_PROFILES, []),
    AssetSpec("Marble016", "stone_marble_black", "stone", "STONE_MASTER", "Black Marble", "stone_polished", STONE_PROFILES, []),
    AssetSpec("Concrete034", "stone_concrete_smooth", "stone", "STONE_MASTER", "Smooth Concrete", "stone_matte", STONE_PROFILES, []),
    AssetSpec("Concrete046", "stone_concrete_plain_wall", "stone", "STONE_MASTER", "Plain Concrete Wall", "stone_matte", STONE_PROFILES, []),
    AssetSpec("Concrete047A", "stone_concrete_rough", "stone", "STONE_MASTER", "Rough Concrete", "stone_textured", STONE_PROFILES, []),
    AssetSpec("Metal032", "metal_smooth_grey", "metal", "METAL_MASTER", "Smooth Grey Metal", "metal_satin", METAL_PROFILES, []),
    AssetSpec("Metal009", "metal_brushed_steel", "metal", "METAL_MASTER", "Brushed Steel", "metal_brushed", METAL_PROFILES, []),
    AssetSpec("Metal046B", "metal_black_dark", "metal", "METAL_MASTER", "Dark Black Metal", "metal_matte_black", METAL_PROFILES, []),
    AssetSpec("Metal035", "metal_copper_brass", "metal", "METAL_MASTER", "Copper Brass Metal", "metal_satin", METAL_PROFILES, []),
    AssetSpec("PaintedPlaster017", "wall_painted_white", "wall", "WALL_MASTER", "Painted White Wall", "wall_matte", WALL_PROFILES, []),
    AssetSpec("beige_wall_001", "wall_beige_matte", "wall", "WALL_MASTER", "Beige Matte Wall", "wall_matte", WALL_PROFILES, []),
    AssetSpec("Tiles107", "tile_white_simple", "tile", "TILE_MASTER", "Simple White Tile", "tile_satin", TILE_PROFILES, []),
    AssetSpec("Tiles138", "tile_black_stone_square", "tile", "TILE_MASTER", "Black Stone Square Tile", "tile_satin", TILE_PROFILES, []),
    AssetSpec("Fingerprints001", "overlay_fingerprints", "overlays", "OVERLAY_MAP", "Fingerprints Overlay", "overlay_map", OVERLAY_PROFILES, []),
    AssetSpec("Scratches005", "overlay_scratches", "overlays", "OVERLAY_MAP", "Scratches Overlay", "overlay_map", OVERLAY_PROFILES, []),
    AssetSpec("SurfaceImperfections007", "overlay_mug_stains", "overlays", "OVERLAY_MAP", "Mug Stains Overlay", "overlay_map", OVERLAY_PROFILES, []),
]

HDRI_SPEC = {"assetId": "kiara_interior", "id": "hdri_kiara_interior"}

SURFACE_PROFILES: dict[str, dict[str, float | str]] = {
    "wood_raw_matte": {"roughnessBase": 0.75, "roughnessVariation": 0.10, "normalStrength": 0.25, "metallic": 0.0, "specularLevel": 0.25, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "wood_standard_matte": {"roughnessBase": 0.55, "roughnessVariation": 0.08, "normalStrength": 0.18, "metallic": 0.0, "specularLevel": 0.35, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "wood_soft_touch_supermat": {"roughnessBase": 0.88, "roughnessVariation": 0.04, "normalStrength": 0.08, "metallic": 0.0, "specularLevel": 0.20, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "wood_satin_lacquer": {"roughnessBase": 0.34, "roughnessVariation": 0.05, "normalStrength": 0.10, "metallic": 0.0, "specularLevel": 0.45, "clearcoatWeight": 0.20, "clearcoatRoughness": 0.35},
    "wood_gloss_laminate": {"roughnessBase": 0.14, "roughnessVariation": 0.02, "normalStrength": 0.02, "metallic": 0.0, "specularLevel": 0.55, "clearcoatWeight": 0.45, "clearcoatRoughness": 0.10},
    "lacquer_supermat": {"roughnessBase": 0.86, "roughnessVariation": 0.025, "normalStrength": 0.01, "metallic": 0.0, "specularLevel": 0.22, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "lacquer_matte": {"roughnessBase": 0.62, "roughnessVariation": 0.03, "normalStrength": 0.01, "metallic": 0.0, "specularLevel": 0.30, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "lacquer_satin": {"roughnessBase": 0.38, "roughnessVariation": 0.025, "normalStrength": 0.005, "metallic": 0.0, "specularLevel": 0.45, "clearcoatWeight": 0.15, "clearcoatRoughness": 0.30},
    "lacquer_gloss": {"roughnessBase": 0.10, "roughnessVariation": 0.01, "normalStrength": 0.0, "metallic": 0.0, "specularLevel": 0.60, "clearcoatWeight": 0.60, "clearcoatRoughness": 0.08},
    "stone_matte": {"roughnessBase": 0.65, "roughnessVariation": 0.08, "normalStrength": 0.20, "metallic": 0.0, "specularLevel": 0.35, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "stone_satin": {"roughnessBase": 0.42, "roughnessVariation": 0.06, "normalStrength": 0.16, "metallic": 0.0, "specularLevel": 0.45, "clearcoatWeight": 0.10, "clearcoatRoughness": 0.28},
    "stone_polished": {"roughnessBase": 0.18, "roughnessVariation": 0.03, "normalStrength": 0.07, "metallic": 0.0, "specularLevel": 0.55, "clearcoatWeight": 0.35, "clearcoatRoughness": 0.12},
    "stone_textured": {"roughnessBase": 0.70, "roughnessVariation": 0.12, "normalStrength": 0.35, "metallic": 0.0, "specularLevel": 0.32, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "metal_matte": {"roughnessBase": 0.55, "roughnessVariation": 0.04, "normalStrength": 0.04, "metallic": 1.0, "specularLevel": 0.50, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "metal_satin": {"roughnessBase": 0.32, "roughnessVariation": 0.035, "normalStrength": 0.04, "metallic": 1.0, "specularLevel": 0.60, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "metal_brushed": {"roughnessBase": 0.28, "roughnessVariation": 0.05, "normalStrength": 0.12, "metallic": 1.0, "specularLevel": 0.65, "anisotropy": 0.60, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "metal_polished": {"roughnessBase": 0.12, "roughnessVariation": 0.02, "normalStrength": 0.01, "metallic": 1.0, "specularLevel": 0.70, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "metal_matte_black": {"roughnessBase": 0.60, "roughnessVariation": 0.035, "normalStrength": 0.03, "metallic": 1.0, "specularLevel": 0.45, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "wall_matte": {"roughnessBase": 0.78, "roughnessVariation": 0.06, "normalStrength": 0.08, "metallic": 0.0, "specularLevel": 0.20, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
    "tile_satin": {"roughnessBase": 0.32, "roughnessVariation": 0.03, "normalStrength": 0.10, "metallic": 0.0, "specularLevel": 0.45, "clearcoatWeight": 0.10, "clearcoatRoughness": 0.22},
    "glass_clear": {"roughnessBase": 0.02, "normalStrength": 0.0, "metallic": 0.0, "alpha": 0.35, "ior": 1.45, "transmission": 0.65},
    "glass_frosted": {"roughnessBase": 0.55, "normalStrength": 0.02, "metallic": 0.0, "alpha": 0.45, "ior": 1.45, "transmission": 0.35},
    "glass_dark_smoked": {"roughnessBase": 0.08, "normalStrength": 0.0, "metallic": 0.0, "alpha": 0.45, "ior": 1.45, "transmission": 0.40, "baseColor": "#111111"},
    "overlay_map": {"roughnessBase": 0.5, "roughnessVariation": 0.0, "normalStrength": 0.0, "metallic": 0.0, "specularLevel": 0.0, "clearcoatWeight": 0.0, "clearcoatRoughness": 0.5},
}

SURFACE_PROFILE_OVERRIDES: dict[str, dict[str, float | str]] = {
    "wood_raw_matte": {
        "category": "wood",
        "roughnessBase": 0.75,
        "roughnessVariation": 0.10,
        "bumpStrength": 0.25,
        "specularLevel": 0.20,
        "coatWeight": 0.0,
        "coatRoughness": 0.6,
        "description": "Natural matte wood with minimal reflections.",
    },
    "wood_standard_matte": {
        "category": "wood",
        "roughnessBase": 0.55,
        "roughnessVariation": 0.08,
        "bumpStrength": 0.18,
        "specularLevel": 0.35,
        "coatWeight": 0.0,
        "coatRoughness": 0.5,
        "description": "Standard kitchen board matte laminate, main default.",
    },
    "wood_soft_touch_supermat": {
        "category": "wood",
        "roughnessBase": 0.88,
        "roughnessVariation": 0.04,
        "bumpStrength": 0.08,
        "specularLevel": 0.15,
        "coatWeight": 0.0,
        "coatRoughness": 0.7,
        "description": "Modern soft-touch supermat surface with almost no reflections.",
    },
    "wood_satin_lacquer": {
        "category": "wood",
        "roughnessBase": 0.34,
        "roughnessVariation": 0.05,
        "bumpStrength": 0.10,
        "specularLevel": 0.45,
        "coatWeight": 0.20,
        "coatRoughness": 0.35,
        "description": "Subtle satin lacquered wood.",
    },
    "wood_gloss_laminate": {
        "category": "wood",
        "roughnessBase": 0.14,
        "roughnessVariation": 0.02,
        "bumpStrength": 0.02,
        "specularLevel": 0.65,
        "coatWeight": 0.45,
        "coatRoughness": 0.10,
        "description": "High-gloss laminate surface with very weak bump.",
    },
    "generic_matte": {
        "category": "generic",
        "roughnessBase": 0.55,
        "roughnessVariation": 0.03,
        "bumpStrength": 0.0,
        "specularLevel": 0.30,
        "coatWeight": 0.0,
        "coatRoughness": 0.5,
        "description": "Safe generic matte fallback.",
    },
}


def _profile_category(profile_id: str) -> str:
    return profile_id.split("_", 1)[0] if "_" in profile_id else "generic"


def _enrich_surface_profiles() -> None:
    SURFACE_PROFILES.update(SURFACE_PROFILE_OVERRIDES)
    for profile_id, profile in SURFACE_PROFILES.items():
        profile.setdefault("category", _profile_category(profile_id))
        bump = float(profile.get("bumpStrength", profile.get("normalStrength", 0.0)))
        coat = float(profile.get("coatWeight", profile.get("clearcoatWeight", 0.0)))
        coat_rough = float(profile.get("coatRoughness", profile.get("clearcoatRoughness", 0.5)))
        profile["bumpStrength"] = bump
        profile["normalStrength"] = bump
        profile["coatWeight"] = coat
        profile["clearcoatWeight"] = coat
        profile["coatRoughness"] = coat_rough
        profile["clearcoatRoughness"] = coat_rough
        profile.setdefault("roughnessVariation", 0.0)
        profile.setdefault("specularLevel", 0.30)
        profile.setdefault("description", f"{profile_id} surface profile.")


_enrich_surface_profiles()


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def rel(project_root: Path, path: Path | None) -> str | None:
    if path is None:
        return None
    return path.resolve().relative_to(project_root.resolve()).as_posix()


def source_from_path(path: Path) -> str:
    p = str(path).lower()
    if re.search(r"(wood|concrete|marble|metal|plastic|tiles|paintedplaster|fingerprints|scratches|surfaceimperfections)\d", p):
        return "ambientCG"
    if "polyhaven" in p or "poly_haven" in p or "kiara_interior" in p or "beige_wall" in p:
        return "Poly Haven"
    return "unknown"


def infer_quality(path: Path) -> str:
    m = re.search(r"([1248])k", path.name.lower())
    return f"{m.group(1).upper()}K" if m else "unknown"


def clean_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def role_score(path: Path, role: str) -> int:
    stem = clean_key(path.stem)
    if any(token in stem for token in IGNORE_TOKENS):
        return -1000
    tokens = {
        "basecolor": ["basecolor", "basecolour", "base", "albedo", "diffuse", "colour", "color", "col"],
        "roughness": ["roughness", "rough"],
        "normal": ["normalgl", "normaldx", "normal", "nrm", "nor"],
        "ao": ["ambientocclusion", "ambient", "occlusion", "ao"],
        "displacement": ["displacement", "heightmap", "height", "disp"],
        "metallic": ["metallic", "metalness", "metal"],
        "opacity": ["opacity", "alpha", "transparent", "transparency"],
    }[role]
    score = max((50 + len(t) if t in stem else -1 for t in tokens), default=-1)
    if score < 0:
        return -1000
    if role == "basecolor" and any(t in stem for t in ["rough", "normal", "nrm", "ao", "height", "metal", "opacity"]):
        return -1000
    if role == "normal":
        if "normalgl" in stem or "normal_gl" in stem:
            score += 20
        if "normaldx" in stem or "normal_dx" in stem:
            score += 5
    if "2k" in stem:
        score += 10
    elif "1k" in stem:
        score += 2
    score += PBR_EXT_PREFERENCE.get(path.suffix.lower(), 0)
    return score


def collect_asset_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    return [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTS]


def choose_maps(root: Path) -> tuple[dict[str, Path | None], str | None, list[str]]:
    files = collect_asset_files(root)
    chosen: dict[str, Path | None] = {role: None for role in MAP_ROLES}
    warnings: list[str] = []
    normal_convention = None
    for role in MAP_ROLES:
        ranked = sorted(((role_score(p, role), p) for p in files), key=lambda item: (item[0], str(item[1])), reverse=True)
        best = ranked[0] if ranked else (-1000, None)
        if best[0] > 0 and best[1] is not None:
            chosen[role] = best[1]
            if role == "normal":
                stem = clean_key(best[1].stem)
                normal_convention = "DX" if "normaldx" in stem else "GL"
                if normal_convention == "DX":
                    warnings.append(f"{best[1]} uses NormalDX; green channel may need inversion.")
    return chosen, normal_convention, warnings


def candidate_score(path: Path, spec: AssetSpec, alias: str) -> int:
    name = clean_key(path.name)
    exact = clean_key(spec.asset_id)
    alias_key = clean_key(alias)
    score = 0
    if exact in name:
        score += 100
    if alias_key in name:
        score += 80
    if "2k" in name:
        score += 20
    if "1k" in name:
        score += 5
    if path.suffix.lower() == ".zip":
        score += 2
    return score


def make_candidates(raw_paths: list[Path], temp_dir: Path, warnings: list[str]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    all_aliases = [(spec, spec.asset_id) for spec in EXPECTED_ASSETS] + [(spec, alias) for spec in EXPECTED_ASSETS for alias in spec.aliases]
    for raw in raw_paths:
        if not raw.exists():
            warnings.append(f"Raw path does not exist: {raw}")
            continue
        lower = raw.name.lower()
        if raw.is_file() and raw.suffix.lower() == ".zip":
            dest = temp_dir / raw.stem
            dest.mkdir(parents=True, exist_ok=True)
            try:
                with zipfile.ZipFile(raw, "r") as zf:
                    zf.extractall(dest)
            except zipfile.BadZipFile:
                warnings.append(f"Bad ZIP skipped: {raw}")
                continue
            for spec, alias in all_aliases:
                if clean_key(alias) in clean_key(raw.name):
                    candidates.append({"spec": spec, "alias": alias, "root": dest, "original": raw, "score": candidate_score(raw, spec, alias)})
        elif raw.is_dir():
            search_roots = [raw] + [p for p in raw.rglob("*") if p.is_dir()]
            for root in search_roots:
                for spec, alias in all_aliases:
                    if clean_key(alias) in clean_key(root.name):
                        candidates.append({"spec": spec, "alias": alias, "root": root, "original": root, "score": candidate_score(root, spec, alias)})
        elif raw.is_file() and ("kiara_interior" in lower and raw.suffix.lower() in {".exr", ".hdr"}):
            candidates.append({"hdri": True, "root": raw, "original": raw, "score": 100})
        else:
            warnings.append(f"Raw path ignored because it does not match expected assets: {raw}")
    return candidates


def manifest_defaults(spec: AssetSpec) -> dict[str, float | bool | str]:
    tile_size = 0.4
    defaults = {
        "tileSizeMeters": tile_size,
        "uvScaleDefault": 1.0 / tile_size,
        "grainDirectionDefault": "vertical" if spec.category == "wood" else "none",
        "rotationDefault": 0.0,
        "textureStrengthDefault": 0.5,
        "reflectivityDefault": 0.35,
        "baseColorOverrideAllowed": True,
    }
    if spec.category == "wall":
        defaults.update({"textureStrengthDefault": 0.35, "reflectivityDefault": 0.12})
    if spec.category == "metal":
        defaults.update({"textureStrengthDefault": 0.65, "reflectivityDefault": 0.55})
    if spec.category == "overlays":
        defaults.update({"baseColorOverrideAllowed": False, "textureStrengthDefault": 1.0, "reflectivityDefault": 0.0})
    fallback = {
        "metal_smooth_grey": "#8A8A8A",
        "metal_brushed_steel": "#B8B8B8",
        "metal_black_dark": "#050505",
        "metal_copper_brass": "#B87333",
        "wall_beige_matte": "#D8C7AA",
    }.get(spec.backend_id)
    if fallback:
        defaults["fallbackBaseColor"] = fallback
    return defaults


def surface_profile_default(spec: AssetSpec) -> str:
    if spec.category != "wood":
        return GENERIC_PROFILE
    key = f"{spec.backend_id} {spec.label}".lower()
    if "gloss" in key or "high_gloss" in key:
        return "wood_gloss_laminate"
    if "supermat" in key or "soft_touch" in key or "soft touch" in key:
        return "wood_soft_touch_supermat"
    if "lacquer" in key or "satin" in key or "varnished" in key:
        return "wood_satin_lacquer"
    return "wood_standard_matte"


def allowed_surface_profiles(spec: AssetSpec) -> list[str]:
    return list(dict.fromkeys([*spec.allowed_profiles, GENERIC_PROFILE]))


def build_material_manifest(project_root: Path) -> list[dict[str, Any]]:
    manifest = []
    for spec in EXPECTED_ASSETS:
        maps: dict[str, str | None] = {}
        maps_dir = project_root / "assets" / "materials" / spec.category / spec.backend_id / "maps"
        for role in MAP_ROLES:
            found = sorted(maps_dir.glob(f"{role}.*"))
            maps[role] = rel(project_root, found[0]) if found else None
        item = {
            "id": spec.backend_id,
            "name": spec.label,
            "category": spec.category,
            "template": spec.template,
            "source": "unknown",
            "assetId": spec.asset_id,
            "maps": maps,
            "defaultSurfaceProfile": spec.default_profile,
            "surfaceProfileDefault": surface_profile_default(spec),
            "allowedSurfaceProfiles": allowed_surface_profiles(spec),
            **manifest_defaults(spec),
        }
        source_file = project_root / "assets" / "materials" / spec.category / spec.backend_id / "source.json"
        if source_file.exists():
            try:
                source = json.loads(source_file.read_text(encoding="utf-8"))
                item["source"] = source.get("source", "unknown")
                item["assetId"] = source.get("assetId", source.get("matchedAssetId", spec.asset_id))
            except json.JSONDecodeError:
                pass
        manifest.append(item)
    return manifest


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _material_type(item: dict[str, Any]) -> str:
    category = item.get("category")
    material_id = str(item.get("id", ""))
    if category == "stone" and "concrete" in material_id:
        return "concrete"
    if category == "lacquer":
        return "solid"
    if category in {"wood", "metal"}:
        return str(category)
    if category in {"stone", "tile"}:
        return "stone"
    return "generic"


def _decor_family(item: dict[str, Any]) -> str:
    material_id = str(item.get("id", "")).lower()
    name = str(item.get("name", "")).lower()
    for token in ["oak", "marble", "concrete", "metal", "tile", "wall", "lacquer"]:
        if token in material_id or token in name:
            return token
    if item.get("category") == "wood":
        return "wood"
    return str(item.get("category", "generic"))


def _color_family(item: dict[str, Any]) -> str:
    key = f"{item.get('id', '')} {item.get('name', '')}".lower()
    for token in ["white", "black", "dark", "light", "grey", "gray", "beige", "copper", "natural", "warm"]:
        if token in key:
            return "gray" if token == "grey" else token
    return "natural" if item.get("category") == "wood" else "neutral"


def _surface_hint(profile_id: str | None) -> str:
    key = str(profile_id or "").lower()
    if "raw" in key:
        return "raw"
    if "supermat" in key:
        return "supermat"
    if "satin" in key or "lacquer" in key:
        return "satin"
    if "gloss" in key:
        return "gloss"
    if "matte" in key or "mat" in key:
        return "matte"
    return "unknown"


def _vendor_display_name(item: dict[str, Any]) -> str:
    name = str(item.get("name", item.get("id", "")))
    return name.replace("Wood", "").strip() or name


def build_vendor_catalog(project_root: Path, manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for index, item in enumerate(manifest, start=1):
        material_id = item["id"]
        maps = item.get("maps", {})
        source_path = project_root / "assets" / "materials" / item["category"] / material_id / "source.json"
        source: dict[str, Any] = {}
        if source_path.exists():
            try:
                source = json.loads(source_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                source = {}
        requested = source.get("requestedAssetId", item.get("assetId"))
        matched = source.get("matchedAssetId", item.get("assetId"))
        base_asset = maps.get("basecolor")
        normal_asset = maps.get("normal")
        roughness_asset = maps.get("roughness")
        fallback_asset_id = matched if requested and matched and requested != matched else None
        if fallback_asset_id:
            asset_status = "fallback_asset"
        elif base_asset and (project_root / base_asset).exists():
            asset_status = "ready"
        else:
            asset_status = "missing_asset"
        surface_profile = item.get("surfaceProfileDefault") or item.get("defaultSurfaceProfile") or ("wood_standard_matte" if item.get("category") == "wood" else GENERIC_PROFILE)
        vendor_id = f"demos_{_slug(material_id).replace('-', '_')}_{index:03d}"
        catalog.append({
            "vendor": "demos",
            "vendorDecorId": vendor_id,
            "materialId": material_id,
            "vendorSku": None,
            "displayName": _vendor_display_name(item),
            "slug": _slug(_vendor_display_name(item)),
            "materialType": _material_type(item),
            "decorFamily": _decor_family(item),
            "colorFamily": _color_family(item),
            "surfaceHint": _surface_hint(surface_profile),
            "baseColorAsset": base_asset,
            "normalAsset": normal_asset,
            "roughnessAsset": roughness_asset,
            "thumbnailAsset": None,
            "fallbackAsset": fallback_asset_id,
            "fallbackAssetPath": base_asset if fallback_asset_id else None,
            "requestedAsset": requested,
            "assetStatus": asset_status,
            "surfaceProfile": surface_profile,
            "tileSizeMeters": item.get("tileSizeMeters", 0.4),
            "uvScale": item.get("uvScaleDefault", 2.5),
            "grainDirectionDefault": item.get("grainDirectionDefault", "vertical" if item.get("category") == "wood" else "none"),
            "colorSource": "texture" if base_asset else "manual",
            "baseColorTint": None,
            "tintStrength": 0.0,
            "source": "manual_seed",
            "notes": f"Uses substitute asset {matched} instead of requested {requested}." if fallback_asset_id else "",
            "importMeta": {
                "importedFrom": "tools/normalize_material_assets.py",
                "hasBaseColor": base_asset is not None,
                "hasNormal": normal_asset is not None,
                "hasRoughness": roughness_asset is not None,
            },
        })
    return catalog


def build_material_asset_report(vendor_catalog: list[dict[str, Any]]) -> dict[str, Any]:
    ready = [v for v in vendor_catalog if v.get("assetStatus") == "ready"]
    missing = [v for v in vendor_catalog if v.get("assetStatus") == "missing_asset"]
    fallback = [v for v in vendor_catalog if v.get("assetStatus") == "fallback_asset"]
    return {
        "summary": {
            "total": len(vendor_catalog),
            "ready": len(ready),
            "missing_asset": len(missing),
            "fallback_asset": len(fallback),
        },
        "readyAssets": [
            {"vendor": v.get("vendor"), "materialId": v.get("materialId"), "vendorDecorId": v.get("vendorDecorId"), "displayName": v.get("displayName"), "asset": v.get("baseColorAsset")}
            for v in ready
        ],
        "missingAssets": [
            {
                "vendor": v.get("vendor"),
                "materialId": v.get("materialId"),
                "vendorDecorId": v.get("vendorDecorId"),
                "displayName": v.get("displayName"),
                "requestedAsset": v.get("requestedAsset"),
                "reason": "baseColorSource missing or file not found",
            }
            for v in missing
        ],
        "fallbackAssets": [
            {
                "vendor": v.get("vendor"),
                "materialId": v.get("materialId"),
                "vendorDecorId": v.get("vendorDecorId"),
                "displayName": v.get("displayName"),
                "requestedAsset": v.get("requestedAsset"),
                "fallbackAsset": v.get("fallbackAsset"),
                "fallbackAssetPath": v.get("fallbackAssetPath"),
                "reason": "requested asset missing, explicit fallback configured",
            }
            for v in fallback
        ],
        "warnings": [],
    }


def build_frontend_catalog(manifest: list[dict[str, Any]], vendor_catalog: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    vendor_by_material = {v.get("materialId"): v for v in (vendor_catalog or [])}
    catalog = []
    for item in manifest:
        vendor = vendor_by_material.get(item["id"], {})
        controls = {
            "baseColor": item["category"] != "overlays",
            "surfaceProfile": True,
            "uvScale": True,
            "rotation": True,
            "textureStrength": True,
            "reflectivity": item["category"] != "overlays",
        }
        catalog.append({
            "id": item["id"],
            "label": item["name"],
            "category": item["category"],
            "defaultSurfaceProfile": item.get("surfaceProfileDefault", item["defaultSurfaceProfile"]),
            "surfaceProfileDefault": item.get("surfaceProfileDefault", item["defaultSurfaceProfile"]),
            "allowedSurfaceProfiles": item["allowedSurfaceProfiles"],
            "vendor": vendor.get("vendor"),
            "vendorDecorId": vendor.get("vendorDecorId"),
            "displayName": vendor.get("displayName"),
            "materialType": vendor.get("materialType"),
            "decorFamily": vendor.get("decorFamily"),
            "colorFamily": vendor.get("colorFamily"),
            "surfaceProfile": vendor.get("surfaceProfile"),
            "surfaceHint": vendor.get("surfaceHint"),
            "tileSizeMeters": item.get("tileSizeMeters"),
            "grainDirectionDefault": item.get("grainDirectionDefault"),
            "assetStatus": vendor.get("assetStatus"),
            "controls": controls,
        })
    return catalog


def build_schema(material_ids: list[str], profile_ids: list[str]) -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Kitchen material request",
        "type": "object",
        "additionalProperties": False,
        "required": ["materialId"],
        "properties": {
            "materialId": {"type": "string", "enum": material_ids},
            "baseColor": {"anyOf": [{"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"}, {"type": "null"}]},
            "surfaceProfile": {"anyOf": [{"type": "string", "enum": profile_ids}, {"type": "null"}]},
            "uvScale": {"type": "number", "minimum": 0.1, "maximum": 10.0},
            "tileSizeMeters": {"type": "number", "exclusiveMinimum": 0.0, "maximum": 10.0},
            "rotation": {"type": "number", "minimum": 0.0, "maximum": 360.0},
            "textureStrength": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "reflectivity": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "grainDirection": {"type": "string", "enum": ["vertical", "horizontal", "lengthwise", "none"]},
        },
    }


def build_map_status(manifest: list[dict[str, Any]]) -> tuple[dict[str, dict[str, dict[str, Any]]], dict[str, list[str]]]:
    status_by_asset: dict[str, dict[str, dict[str, Any]]] = {}
    problematic: dict[str, list[str]] = {}
    ok_missing = {"ao", "displacement", "opacity"}
    for item in manifest:
        material_id = item["id"]
        category = item.get("category")
        fallback = item.get("fallbackBaseColor")
        maps = item.get("maps", {})
        role_status: dict[str, dict[str, Any]] = {}
        for role in MAP_ROLES:
            found = maps.get(role) is not None
            if found:
                status = "found"
                severity = "ok"
            elif category == "overlays":
                status = "missing_ok"
                severity = "ok"
            elif role == "basecolor" and fallback:
                status = "missing_with_explicit_fallback"
                severity = "ok"
            elif role in ok_missing or (role == "metallic" and category != "metal"):
                status = "missing_ok"
                severity = "ok"
            elif role in {"roughness", "normal"}:
                status = "missing_warning"
                severity = "warning"
            else:
                status = "problematic_missing"
                severity = "error"
                problematic.setdefault(material_id, []).append(role)
            role_status[role] = {"found": found, "status": status, "severity": severity}
        status_by_asset[material_id] = role_status
    return status_by_asset, problematic


def normalize(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    raw_paths = [Path(p).resolve() for p in args.raw_path]
    warnings: list[str] = []
    created_files: list[str] = []
    assets_normalized: list[str] = []
    assets_missing: list[str] = []
    maps_missing: dict[str, list[str]] = {}
    normal_conventions: dict[str, str] = {}
    missing_maps_report: dict[str, dict[str, bool]] = {}

    for rel_dir in [
        "assets/materials/wood", "assets/materials/lacquer", "assets/materials/stone", "assets/materials/metal",
        "assets/materials/wall", "assets/materials/tile", "assets/materials/overlays", "assets/hdri",
        "backend/materials", "blender/previews", "reports",
    ]:
        (project_root / rel_dir).mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="material_assets_") as tmp:
        candidates = make_candidates(raw_paths, Path(tmp), warnings)
        hdri_found = False
        for c in candidates:
            if c.get("hdri"):
                src = c["root"]
                dest = project_root / "assets" / "hdri" / "hdri_kiara_interior.exr"
                if dest.exists() and not args.overwrite:
                    warnings.append(f"Conflict skipped without --overwrite: {dest}")
                else:
                    shutil.copy2(src, dest)
                    created_files.append(rel(project_root, dest) or str(dest))
                    hdri_found = True

        for spec in EXPECTED_ASSETS:
            spec_candidates = [c for c in candidates if c.get("spec") == spec]
            spec_candidates.sort(key=lambda c: c.get("score", 0), reverse=True)
            if not spec_candidates:
                assets_missing.append(spec.backend_id)
                maps_missing[spec.backend_id] = MAP_ROLES.copy()
                missing_maps_report[spec.backend_id] = {role: False for role in MAP_ROLES}
                continue

            best = spec_candidates[0]
            if best["alias"] != spec.asset_id:
                warnings.append(f"{spec.asset_id} not found exactly; using approximate match {best['alias']} for {spec.backend_id}.")
            out_root = project_root / "assets" / "materials" / spec.category / spec.backend_id
            maps_out = out_root / "maps"
            maps_out.mkdir(parents=True, exist_ok=True)
            chosen, normal_convention, map_warnings = choose_maps(best["root"])
            warnings.extend(map_warnings)
            found_roles: dict[str, bool] = {}
            missing_roles: list[str] = []
            for role, src in chosen.items():
                found_roles[role] = src is not None
                if src is None:
                    missing_roles.append(role)
                    continue
                dest = maps_out / f"{role}{src.suffix.lower()}"
                if dest.exists() and not args.overwrite:
                    warnings.append(f"Conflict skipped without --overwrite: {dest}")
                    continue
                shutil.copy2(src, dest)
                created_files.append(rel(project_root, dest) or str(dest))

            source = {
                "id": spec.backend_id,
                "source": source_from_path(best["original"]),
                "assetId": best["alias"],
                "requestedAssetId": spec.asset_id,
                "matchedAssetId": best["alias"],
                "downloadProfile": infer_quality(best["original"]),
                "license": "CC0",
                "originalMatchedPath": str(best["original"]),
                "normalConvention": normal_convention,
                "mapsFound": found_roles,
                "notes": [],
            }
            if best["alias"] != spec.asset_id:
                source["notes"].append(f"Substitute asset: requested {spec.asset_id}, used {best['alias']}.")
            source_path = out_root / "source.json"
            write_json(source_path, source)
            created_files.append(rel(project_root, source_path) or str(source_path))
            assets_normalized.append(spec.backend_id)
            maps_missing[spec.backend_id] = missing_roles
            missing_maps_report[spec.backend_id] = found_roles
            if normal_convention:
                normal_conventions[spec.backend_id] = normal_convention

        if not hdri_found:
            assets_missing.append(HDRI_SPEC["id"])
            warnings.append("HDRI kiara_interior was not found.")
        else:
            assets_normalized.append(HDRI_SPEC["id"])

    manifest = build_material_manifest(project_root)
    vendor_catalog = build_vendor_catalog(project_root, manifest)
    asset_report = build_material_asset_report(vendor_catalog)
    write_json(project_root / "backend" / "materials" / "surface_profiles.json", SURFACE_PROFILES)
    write_json(project_root / "backend" / "materials" / "material_manifest.json", manifest)
    write_json(project_root / "backend" / "materials" / "material_frontend_catalog.json", build_frontend_catalog(manifest, vendor_catalog))
    write_json(project_root / "backend" / "materials" / "vendor_catalogs" / "demos_materials.json", vendor_catalog)
    write_json(project_root / "backend" / "materials" / "material_asset_report.json", asset_report)
    schema = build_schema([m["id"] for m in manifest], sorted(SURFACE_PROFILES.keys()))
    write_json(project_root / "backend" / "materials" / "material_schema.json", schema)
    write_json(project_root / "backend" / "materials" / "material_request_schema.json", schema)
    map_status, problematic_missing = build_map_status(manifest)

    report = {
        "assetsExpected": len(EXPECTED_ASSETS) + 1,
        "assetsFound": len(assets_normalized),
        "assetsMissing": assets_missing,
        "assetsNormalized": assets_normalized,
        "mapsMissingByAsset": maps_missing,
        "mapStatusByAsset": map_status,
        "problematicMissingMaps": problematic_missing,
        "normalMapConvention": normal_conventions,
        "warnings": warnings,
        "createdFiles": created_files + [
            "backend/materials/surface_profiles.json",
            "backend/materials/material_manifest.json",
            "backend/materials/material_frontend_catalog.json",
            "backend/materials/vendor_catalogs/demos_materials.json",
            "backend/materials/material_asset_report.json",
            "backend/materials/material_schema.json",
            "backend/materials/material_request_schema.json",
        ],
        "previewBlendFiles": [],
        "previewRenderFiles": [],
    }
    write_json(project_root / "reports" / "material_pipeline_report.json", report)
    write_json(project_root / "reports" / "missing_maps_report.json", map_status)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize local PBR assets into the kitchen material pipeline.")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--raw-path", action="append", default=[], required=True)
    parser.add_argument("--overwrite", action="store_true")
    return normalize(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
