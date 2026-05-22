from __future__ import annotations

import re
from typing import Any


FORBIDDEN_DEMOS_ASSET_FIELDS = {
    "baseColorSource",
    "baseColorAsset",
    "normalSource",
    "normalAsset",
    "roughnessSource",
    "roughnessAsset",
    "thumbnailAsset",
    "externalTexture",
    "vendorTexture",
    "demosTexture",
}
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _ids(values: Any) -> set[str]:
    if isinstance(values, dict):
        return {str(key) for key in values}
    if isinstance(values, list):
        return {str(item.get("id")) for item in values if isinstance(item, dict) and item.get("id")}
    if isinstance(values, set):
        return {str(value) for value in values}
    return set()


def is_production_safe_demos_mapping(
    record: dict[str, Any],
    manifest: Any | None = None,
    profiles: Any | None = None,
) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    forbidden = sorted(FORBIDDEN_DEMOS_ASSET_FIELDS.intersection(record))
    if forbidden:
        reasons.append(f"forbidden asset fields: {', '.join(forbidden)}")
    if record.get("mappingStatus") != "mapped":
        reasons.append("mappingStatus is not mapped")
    if record.get("mappingLocked") is not True:
        reasons.append("mappingLocked is not true")
    try:
        confidence = float(record.get("confidence", 0.0) or 0.0)
    except Exception:
        confidence = 0.0
    if confidence < 0.7:
        reasons.append("confidence is below 0.7")
    if record.get("colorSourceMethod") == "rule_inferred":
        reasons.append("colorSourceMethod is rule_inferred")
    if record.get("usesExternalVendorTexture") is not False:
        reasons.append("usesExternalVendorTexture is not false")
    target_id = record.get("targetInternalMaterialId")
    if not target_id:
        reasons.append("targetInternalMaterialId is missing")
    elif manifest is not None and str(target_id) not in _ids(manifest):
        reasons.append("targetInternalMaterialId does not exist")
    surface_profile = record.get("surfaceProfile")
    if not surface_profile:
        reasons.append("surfaceProfile is missing")
    elif profiles is not None and str(surface_profile) not in _ids(profiles):
        reasons.append("surfaceProfile does not exist")
    transform = record.get("colorTransform") if isinstance(record.get("colorTransform"), dict) else {}
    if not transform.get("baseColorHex") or not HEX_RE.match(str(transform.get("baseColorHex"))):
        reasons.append("baseColorHex is missing or invalid")
    if not record.get("grainPatternId"):
        reasons.append("grainPatternId is missing")
    return not reasons, reasons
