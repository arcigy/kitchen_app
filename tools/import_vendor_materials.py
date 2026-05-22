from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except Exception:
    Image = None  # type: ignore


MATERIAL_TYPES = {"wood", "stone", "concrete", "solid", "metal", "generic"}
SURFACE_HINTS = {"raw", "matte", "supermat", "satin", "gloss", "unknown"}
COLOR_SOURCES = {"texture", "tint_placeholder", "manual"}
GRAIN_DIRECTIONS = {"vertical", "horizontal", "lengthwise", "none"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def rel(root: Path, path: Path | None) -> str | None:
    if path is None:
        return None
    return path.resolve().relative_to(root.resolve()).as_posix()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def resolve_path(project_root: Path, value: str | None) -> Path | None:
    if not value:
        return None
    p = Path(value)
    return p if p.is_absolute() else project_root / p


def infer_surface_profile(material_type: str, surface_hint: str) -> str:
    if material_type == "wood":
        return {
            "raw": "wood_raw_matte",
            "matte": "wood_standard_matte",
            "supermat": "wood_soft_touch_supermat",
            "satin": "wood_satin_lacquer",
            "gloss": "wood_gloss_laminate",
            "unknown": "wood_standard_matte",
        }.get(surface_hint, "wood_standard_matte")
    return "generic_matte"


def load_import_records(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as fh:
            return [dict(row) for row in csv.DictReader(fh)]
    data = load_json(path)
    records = data.get("records", []) if isinstance(data, dict) else []
    if not isinstance(records, list):
        raise ValueError("Import JSON must contain records[]")
    return [r for r in records if isinstance(r, dict)]


def ensure_vendor_id(vendor: str, record: dict[str, Any], existing_ids: set[str]) -> str:
    value = record.get("vendorDecorId")
    if isinstance(value, str) and value.strip():
        return value.strip()
    base = f"{vendor}_{slugify(str(record.get('displayName', 'decor'))).replace('-', '_')}"
    candidate = base
    i = 2
    while candidate in existing_ids:
        candidate = f"{base}_{i:03d}"
        i += 1
    return candidate


def normalize_image(src: Path, dest: Path, warnings: list[str]) -> dict[str, Any]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    meta: dict[str, Any] = {"sourcePath": str(src)}
    if Image is None:
        shutil.copy2(src, dest)
        warnings.append("Pillow is not available; copied image without resize/metadata inspection")
        return meta
    try:
        with Image.open(src) as img:
            meta.update({"width": img.width, "height": img.height, "mode": img.mode, "format": img.format})
            out = img.convert("RGB") if img.mode not in {"RGB", "L"} else img.copy()
            max_side = max(out.size)
            if max_side > 4096:
                scale = 4096 / max_side
                out = out.resize((int(out.width * scale), int(out.height * scale)))
            save_format = "JPEG" if dest.suffix.lower() in {".jpg", ".jpeg"} else "PNG"
            out.save(dest, format=save_format, quality=92)
            meta.update({"normalizedWidth": out.width, "normalizedHeight": out.height})
    except Exception as exc:
        shutil.copy2(src, dest)
        warnings.append(f"Image normalization failed for {src}: {exc}; copied original")
    return meta


def create_thumbnail(src: Path, dest: Path, warnings: list[str]) -> bool:
    if Image is None:
        warnings.append("Pillow is not available; thumbnail was not generated")
        return False
    try:
        with Image.open(src) as img:
            thumb = img.convert("RGB")
            thumb.thumbnail((512, 512))
            dest.parent.mkdir(parents=True, exist_ok=True)
            thumb.save(dest, format="JPEG", quality=88)
        return True
    except Exception as exc:
        warnings.append(f"Thumbnail generation failed for {src}: {exc}")
        return False


def copy_asset(
    project_root: Path,
    src_value: str | None,
    canonical_dir: Path,
    canonical_name: str,
    overwrite: bool,
    dry_run: bool,
    warnings: list[str],
) -> tuple[str | None, dict[str, Any]]:
    src = resolve_path(project_root, src_value)
    if src is None or not src.exists() or not src.is_file():
        return None, {}
    ext = src.suffix.lower() if src.suffix.lower() in IMAGE_EXTS else ".jpg"
    dest = canonical_dir / f"{canonical_name}{ext}"
    if dry_run:
        return rel(project_root, dest), {"sourcePath": str(src), "dryRun": True}
    if dest.exists() and not overwrite:
        warnings.append(f"Asset exists and was reused: {rel(project_root, dest)}")
        return rel(project_root, dest), {"sourcePath": str(src), "reusedExisting": True}
    meta = normalize_image(src, dest, warnings)
    return rel(project_root, dest), meta


def build_asset_report(records: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any]:
    ready = [r for r in records if r.get("assetStatus") == "ready"]
    missing = [r for r in records if r.get("assetStatus") == "missing_asset"]
    fallback = [r for r in records if r.get("assetStatus") == "fallback_asset"]
    return {
        "summary": {"total": len(records), "ready": len(ready), "fallback_asset": len(fallback), "missing_asset": len(missing)},
        "readyAssets": [
            {"vendor": r.get("vendor"), "vendorDecorId": r.get("vendorDecorId"), "displayName": r.get("displayName"), "asset": r.get("baseColorAsset")}
            for r in ready
        ],
        "fallbackAssets": [
            {
                "vendor": r.get("vendor"),
                "vendorDecorId": r.get("vendorDecorId"),
                "displayName": r.get("displayName"),
                "requestedAsset": r.get("requestedAsset") or r.get("baseColorSource"),
                "fallbackAsset": r.get("fallbackAsset"),
                "reason": "requested asset missing, explicit fallback configured",
            }
            for r in fallback
        ],
        "missingAssets": [
            {
                "vendor": r.get("vendor"),
                "vendorDecorId": r.get("vendorDecorId"),
                "displayName": r.get("displayName"),
                "requestedAsset": r.get("requestedAsset") or r.get("baseColorSource"),
                "reason": "baseColorSource missing or file not found",
            }
            for r in missing
        ],
        "warnings": warnings,
    }


def build_frontend_catalog(manifest_items: list[dict[str, Any]], vendor_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_material = {r.get("materialId"): r for r in vendor_records if r.get("materialId")}
    catalog: list[dict[str, Any]] = []
    for item in manifest_items:
        vendor = by_material.get(item["id"], {})
        catalog.append({
            "id": item["id"],
            "label": item["name"],
            "category": item["category"],
            "defaultSurfaceProfile": item.get("surfaceProfileDefault", item.get("defaultSurfaceProfile")),
            "surfaceProfileDefault": item.get("surfaceProfileDefault", item.get("defaultSurfaceProfile")),
            "allowedSurfaceProfiles": item.get("allowedSurfaceProfiles", []),
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
            "controls": {"baseColor": item["category"] != "overlays", "surfaceProfile": True, "uvScale": True, "rotation": True, "textureStrength": True, "reflectivity": item["category"] != "overlays"},
        })
    for record in vendor_records:
        if record.get("materialId"):
            continue
        catalog.append({
            "catalogType": "vendorDecor",
            "vendor": record.get("vendor"),
            "vendorDecorId": record.get("vendorDecorId"),
            "displayName": record.get("displayName"),
            "materialType": record.get("materialType"),
            "decorFamily": record.get("decorFamily"),
            "colorFamily": record.get("colorFamily"),
            "surfaceProfile": record.get("surfaceProfile"),
            "surfaceHint": record.get("surfaceHint"),
            "tileSizeMeters": record.get("tileSizeMeters"),
            "grainDirectionDefault": record.get("grainDirectionDefault"),
            "assetStatus": record.get("assetStatus"),
        })
    return catalog


def normalize_existing_record(record: dict[str, Any]) -> dict[str, Any]:
    out = dict(record)
    out.setdefault("normalAsset", None)
    out.setdefault("roughnessAsset", None)
    out.setdefault("thumbnailAsset", None)
    out.setdefault("importMeta", {
        "importedFrom": out.get("source", "existing_catalog"),
        "hasBaseColor": out.get("baseColorAsset") is not None,
        "hasNormal": out.get("normalAsset") is not None,
        "hasRoughness": out.get("roughnessAsset") is not None,
    })
    return out


def normalize_import_record(
    project_root: Path,
    vendor: str,
    input_path: Path,
    record: dict[str, Any],
    existing_ids: set[str],
    profiles: dict[str, Any],
    overwrite_assets: bool,
    generate_thumbnails: bool,
    dry_run: bool,
    warnings: list[str],
) -> tuple[dict[str, Any], bool]:
    vendor_id = ensure_vendor_id(vendor, record, existing_ids)
    existing_ids.add(vendor_id)
    display_name = str(record.get("displayName") or vendor_id)
    slug = str(record.get("slug") or slugify(display_name))
    material_type = str(record.get("materialType") or "generic")
    surface_hint = str(record.get("surfaceHint") or "unknown")
    color_source = str(record.get("colorSource") or "texture")
    if material_type not in MATERIAL_TYPES:
        raise ValueError(f"{vendor_id}: invalid materialType {material_type!r}")
    if surface_hint not in SURFACE_HINTS:
        raise ValueError(f"{vendor_id}: invalid surfaceHint {surface_hint!r}")
    if color_source not in COLOR_SOURCES:
        raise ValueError(f"{vendor_id}: invalid colorSource {color_source!r}")
    surface_profile = str(record.get("surfaceProfile") or infer_surface_profile(material_type, surface_hint))
    if surface_profile not in profiles:
        raise ValueError(f"{vendor_id}: unknown surfaceProfile {surface_profile!r}")
    tile_size = float(record.get("tileSizeMeters") or 0.4)
    uv_scale = 1.0 / tile_size
    grain = str(record.get("grainDirectionDefault") or ("vertical" if material_type == "wood" else "none"))
    if grain not in GRAIN_DIRECTIONS:
        raise ValueError(f"{vendor_id}: invalid grainDirectionDefault {grain!r}")

    canonical_dir = project_root / "backend" / "materials" / "assets" / "vendors" / vendor / vendor_id
    base_asset, base_meta = copy_asset(project_root, record.get("baseColorSource"), canonical_dir, "basecolor", overwrite_assets, dry_run, warnings)
    normal_asset, normal_meta = copy_asset(project_root, record.get("normalSource"), canonical_dir, "normal", overwrite_assets, dry_run, warnings)
    rough_asset, rough_meta = copy_asset(project_root, record.get("roughnessSource"), canonical_dir, "roughness", overwrite_assets, dry_run, warnings)

    fallback_asset = record.get("fallbackAsset")
    fallback_path = None
    asset_status = "ready" if base_asset else "missing_asset"
    if not base_asset and fallback_asset:
        fallback_asset_path, _ = copy_asset(project_root, str(fallback_asset), canonical_dir, "basecolor", overwrite_assets, dry_run, warnings)
        if fallback_asset_path:
            base_asset = fallback_asset_path
            fallback_path = fallback_asset_path
            asset_status = "fallback_asset"
        else:
            warnings.append(f"{vendor_id}: fallbackAsset was configured but file was not found")

    thumbnail_asset = None
    if generate_thumbnails and base_asset and not dry_run:
        thumb_path = canonical_dir / "thumbnail.jpg"
        if create_thumbnail(project_root / base_asset, thumb_path, warnings):
            thumbnail_asset = rel(project_root, thumb_path)

    meta = {
        "width": base_meta.get("normalizedWidth", base_meta.get("width")),
        "height": base_meta.get("normalizedHeight", base_meta.get("height")),
        "mode": base_meta.get("mode"),
        "format": base_meta.get("format"),
        "sourcePath": str(record.get("baseColorSource")) if record.get("baseColorSource") else None,
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "hasNormal": normal_asset is not None,
        "hasRoughness": rough_asset is not None,
    }
    if base_asset and not dry_run:
        write_json(canonical_dir / "metadata.json", {**meta, "normalMeta": normal_meta, "roughnessMeta": rough_meta})

    return {
        "vendor": vendor,
        "vendorDecorId": vendor_id,
        "vendorSku": record.get("vendorSku"),
        "displayName": display_name,
        "slug": slug,
        "materialType": material_type,
        "decorFamily": record.get("decorFamily") or material_type,
        "colorFamily": record.get("colorFamily") or "unknown",
        "surfaceHint": surface_hint,
        "baseColorAsset": base_asset,
        "normalAsset": normal_asset,
        "roughnessAsset": rough_asset,
        "thumbnailAsset": thumbnail_asset,
        "fallbackAsset": fallback_asset,
        "fallbackAssetPath": fallback_path,
        "requestedAsset": record.get("baseColorSource"),
        "assetStatus": asset_status,
        "surfaceProfile": surface_profile,
        "tileSizeMeters": tile_size,
        "uvScale": uv_scale,
        "grainDirectionDefault": grain,
        "colorSource": color_source,
        "baseColorTint": record.get("baseColorTint"),
        "tintStrength": float(record.get("tintStrength") or 0.0),
        "source": record.get("source") or "manual_import",
        "notes": record.get("notes") or "",
        "importMeta": {
            "importedFrom": rel(project_root, input_path) or str(input_path),
            "hasBaseColor": base_asset is not None,
            "hasNormal": normal_asset is not None,
            "hasRoughness": rough_asset is not None,
        },
    }, base_asset is not None


def main() -> int:
    parser = argparse.ArgumentParser(description="Legacy internal asset import. Do not use for Demos decor mapping records.")
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--vendor", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--overwrite-assets", action="store_true")
    parser.add_argument("--fail-on-missing-assets", action="store_true")
    parser.add_argument("--generate-thumbnails", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    project_root = Path(args.project_root).resolve()
    input_path = resolve_path(project_root, args.input)
    if input_path is None or not input_path.exists():
        raise SystemExit(f"Import file not found: {args.input}")

    materials_dir = project_root / "backend" / "materials"
    vendor_path = materials_dir / "vendor_catalogs" / f"{args.vendor}_materials.json"
    if args.vendor == "demos":
        vendor_path = materials_dir / "vendor_catalogs" / "demos_materials.json"
    manifest_path = materials_dir / "material_manifest.json"
    profiles_path = materials_dir / "surface_profiles.json"
    existing = load_json(vendor_path) if vendor_path.exists() else []
    manifest_items = load_json(manifest_path) if manifest_path.exists() else []
    profiles = load_json(profiles_path)
    if not isinstance(existing, list):
        raise SystemExit("Vendor catalog must be a list")

    existing_records = [normalize_existing_record(r) for r in existing if isinstance(r, dict)]
    by_id = {r["vendorDecorId"]: r for r in existing_records if isinstance(r.get("vendorDecorId"), str)}
    existing_ids = set(by_id)
    raw_records = load_import_records(input_path)
    if args.limit is not None:
        raw_records = raw_records[: max(0, args.limit)]

    warnings: list[str] = []
    inserted = 0
    updated = 0
    skipped = 0
    normalized: list[dict[str, Any]] = []
    for raw in raw_records:
        try:
            record, has_base = normalize_import_record(
                project_root,
                args.vendor,
                input_path,
                raw,
                existing_ids,
                profiles,
                args.overwrite_assets,
                args.generate_thumbnails,
                args.dry_run,
                warnings,
            )
            if args.fail_on_missing_assets and not has_base:
                raise ValueError(f"{record['vendorDecorId']}: baseColorSource missing")
            if record["vendorDecorId"] in by_id:
                updated += 1
            else:
                inserted += 1
            by_id[record["vendorDecorId"]] = record
            normalized.append(record)
        except Exception as exc:
            skipped += 1
            warnings.append(str(exc))

    all_records = list(by_id.values())
    asset_report = build_asset_report(all_records, warnings)
    frontend_catalog = build_frontend_catalog(manifest_items, all_records)
    summary = {
        "dryRun": args.dry_run,
        "input": rel(project_root, input_path) or str(input_path),
        "recordsInInput": len(raw_records),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "ready": asset_report["summary"]["ready"],
        "missing_asset": asset_report["summary"]["missing_asset"],
        "fallback_asset": asset_report["summary"]["fallback_asset"],
        "warnings": warnings,
        "importedVendorDecorIds": [r["vendorDecorId"] for r in normalized],
    }

    if not args.dry_run:
        write_json(vendor_path, all_records)
        write_json(materials_dir / "material_asset_report.json", asset_report)
        write_json(materials_dir / "material_frontend_catalog.json", frontend_catalog)
        write_json(project_root / "reports" / "vendor_material_import_report.json", summary)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0 if skipped == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
