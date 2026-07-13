# Website Showcase Export

The temporary website showcase export is a geometry-only handoff for a Three.js marketing animation. It does not change project save/load, pricing, BOM, tenant data, or module behavior.

## Capture workflow

Keep the same placed module instances between both captures so their stable IDs remain matchable.

1. Model the first kitchen with intentionally wrong dimensions or composition.
2. Open `File -> Website animation export -> Export initial / wrong parameters...`.
3. Edit the existing modules in place. Do not delete and reinsert a module when it should animate from the first state.
4. Open `File -> Website animation export -> Export final / corrected parameters...`.

The two JSON files are self-contained snapshots. Pair objects by their exported stable IDs.

## Included data

- native Three.js coordinates: meters, Y-up, right-handed;
- worktop paths, parameters, material metadata, geometry, transforms, and bounds;
- module instance IDs, type, parameters, kitchen group, worktop placement binding, and world transform;
- a coarse oriented box for every module;
- semantic part identity from `primitiveId`, `boardName`, `partName`, or mesh name;
- mesh positions, indices, normals, UVs, material values, and sanitized runtime metadata;
- closed and directly rebuilt opened geometry/transforms where the module supports opening;
- drawer/submodule motion metadata, including fixed corpus runners versus moving parts when present;
- deterministic exploded-view offsets and assembly order;
- workflow hints for worktop, coarse blocks, detailed modules, parameter transition, opened view, materials, and the later external AI-render image.

The exporter never traverses the complete app scene. It exports only real module geometry and worktop meshes, excluding picks, outlines, debug helpers, hidden products, lights, cameras, walls, and editor overlays.

## Website playback rules

- Use `worktops[*]` for the first drawn-worktop phase.
- Use `modules[*].coarseBox` for the rough-block phase.
- Use each part's closed state for assembled detailed modules.
- Add the exported exploded offset to the closed transform, then animate it back to zero for assembly.
- Use the opened state when present; otherwise keep the closed state for fixed parts.
- Match the initial and final exports by module ID and part stable ID.
- Interpolate matching transforms and compatible vertex arrays. Crossfade parts whose topology differs or which exist in only one snapshot, such as newly added drawers.
- Render neutral materials first, then apply the exported material records for the material phase.
- The final AI-generated photoreal image is an external website phase and is intentionally not produced by this exporter.

## Format boundary

The format identifier and version are part of the public handoff contract. Additive fields are allowed. Breaking changes require a new version and a loader update on the website.
