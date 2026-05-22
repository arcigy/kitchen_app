# Demos Pilot Review Instructions

Review each row in the generated batch CSV before it can become production-safe.

Check or edit:

- `targetInternalMaterialId`
- `proceduralTemplate`
- `grainPatternId`
- `surfaceProfile`
- `baseColorHex`
- `grainColorHex`
- `tintStrength`
- `grainContrast`
- `roughnessMultiplier`
- `bumpMultiplier`
- `grainDepth`
- `tileSizeMeters`
- `grainDirectionDefault`
- `mappingStatus`
- `mappingLocked`
- `confidence`
- `colorSourceMethod`
- `reviewAction`

Approved row:

```text
reviewAction = approve
mappingStatus = mapped
mappingLocked = true
confidence >= 0.7
colorSourceMethod != rule_inferred
notes contains "No Demos texture used."
```

Uncertain row:

```text
reviewAction = keep_needs_review
mappingStatus = needs_review
mappingLocked = false
```

Rejected row:

```text
reviewAction = reject
mappingStatus = unmapped
mappingLocked = false
```

Demos photos or texture paths are not allowed in any row.
