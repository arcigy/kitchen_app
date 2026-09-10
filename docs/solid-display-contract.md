# Surface display contract

The founder explicitly requested removal of the global Wireframe display mode on 2026-09-09. The application offers only Solid and Realistic. Both draw furniture surfaces; the display controller never creates global edge overlays or hides surfaces to show a wire skeleton.

## Ownership and preservation

`src/app/viewDisplayController.ts` owns display modes, material presentation and normalization of old display values. `src/app/bootstrap.ts` uses its shared mode type for the viewer menu. `src/app.ts` passes saved display values through the resolver at the existing restore boundary.

The reported intermittent appearance also came from `restoreKitchenPlanOutline` restoring a floorplan snapshot after navigation had switched to 3D: it re-enabled the module outline with depth testing disabled, drawing interior cabinet edges through solid faces. Restoration now receives the current view mode and keeps those plan outlines hidden and depth-tested in 3D. The 2D outline/fill behavior and selection feedback remain intact.

- Removal of Wireframe: approval-required behavior change, explicitly authorized by the user. Removed opacity-zero rendering, generated edge geometry/materials, theme registration and menu entry.
- Old projects, FQP imports and recovery snapshots: preserved, except the intentionally retired `scene.displayMode = "wireframe"` becomes `solid` on restore and subsequent save. Missing/unknown values also default to Solid. No live migration or source-file rewrite is needed.
- Geometry, parameters, placement, material identity/textures, lighting, HDRI, pricing, BOM, selection, dimensions and exports: preserved. Solid retains its existing opaque preview policy. Realistic restores authored PBR/transparency settings. Glass, invisible pick surfaces and selection helpers retain their existing presentation exceptions.
- Mesh material `wireframe` flags are cleared during display synchronization and are never cached/restored as an active display option.

## Verification and rollback

Before the fix, focused regressions reproduced acceptance of a retired mode, restoration of a mesh wireframe flag in Solid, and the floorplan outline overwriting 3D navigation. Coverage now checks both supported modes, late-added meshes, material arrays, exact scene/PBR restoration and opening helpers. The viewer-menu test requires exactly two surface modes. The appearance suite exercises both modes in light and dark and requires visible module surfaces with plan outlines hidden after 2D/3D transitions. The full FQP roundtrip saves a synthetic legacy mode, downloads/imports it, checks Solid on load, edits and re-saves Solid while preserving entity equality.

Run typecheck, full unit tests, build, full UI regression and browser console inspection. Manually reopen the reported project, switch 2D/3D and both themes, edit/place modules, save and reopen. Furniture must retain its surfaces throughout. A protected revert of the scoped PR is the rollback; tenant data and schema are unchanged.
