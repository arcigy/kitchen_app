# Arcigy appearance contract

The approved direction is a restrained premium blue interface, with light and dark themes. Keep the existing information architecture and compact editor layout.

## Owners and preservation

- `src/styles/designTokens.css` owns semantic UI colors, radii, spacing and motion. Dedicated screen styles retain ownership of layout. Remove replaced duplicate definitions in the legacy stylesheet when safe; do not add blanket `!important` overrides.
- Shared DOM helpers own presentation variants. They expose callbacks and do not mutate projects or editor state.
- The theme controller owns only the browser appearance preference. Theme changes must not reload, reset focus, change selection, create history entries or alter project data.
- Scene presentation owns viewport backgrounds and technical overlay colors. Material colors, texture data, lighting, exposure and HDRI remain project-owned. Output capture must be independent of the editor theme and restore presentation after failures.
- Existing SVG action icons, accessible labels, tooltips, shortcuts and role-based availability remain in force.

Classification: existing editor, project, pricing, BOM, render/export and tenant workflows are `preserved`; theme selection and visual presentation are `intentionally extended`. No feature removal or data migration is part of this change.

## Visual defaults

Blue is the action accent. Status colors retain their meaning. Primary actions use the blue gradient; data surfaces remain quiet. Controls use 8/10 px radii, panels 14 px and dialogs 18 px. Text uses existing system fonts, 12 px for compact editor controls and 13–14 px for regular forms. Avoid moving button hit areas or magnetic cursor behavior.

Theme choices are system (default), light and dark, remembered only in the browser. Dark includes the editing viewport. Diagnostic screenshots capture what the user sees; customer outputs and saved previews preserve the output presentation.

## Implementation

- A synchronous `public/theme-init.js` script resolves the initial theme before body paint. `src/ui/theme/themeController.ts` subsequently owns the preference, system and storage listeners; the connected theme picker removes its subscription when its screen is removed.
- Only `arcigy.ui.theme` is persisted. A blocked browser store still permits switching for the current session. The existing application's broader storage requirements are unchanged.
- `src/app/viewportAppearance.ts` applies a temporary editing background during one synchronous frame, restoring exact values in `finally`. No theme field enters project serialization. Photo/SSGI and explicit HDRI use project presentation.
- PNG export draws a neutral frame for capture and restores the current editor frame. Saved previews, Blender exports and material rendering read the unchanged scene. Print CSS restores the complete light palette.
- Native radio controls expose System, Light and Dark in login and the account panel. Existing business buttons, keyboard commands and navigation retain their handlers.
- Existing screen styles use the shared tokens; `appearance.css` owns shared control feedback, focus, theme-picker layout and reduced motion. The pricing summary has compact spacing so its actions fit inside the existing footer.

## Visual regression coverage

`npm run test:ui-appearance` is part of the full UI regression command. It covers 18 login/project/2D-editor/3D-editor/material/sheet/schedule/settings views, dark and light themes, a mobile login and compact editor, persistence after reload, OS preference changes, cross-tab synchronization, native arrow-key selection, project/selection preservation, control contrast, footer clipping, reduced motion and print colors. It writes local screenshots and a JSON report under `outputs/ui-appearance/`; these are not release artifacts.

Existing Settings and Documents placeholders retain their current product behavior. This appearance work does not implement missing business workflows.

## Verification and delivery

Characterize login, project manager, editor tools/properties, catalogs, materials, BOM/margins, settings, assistant, menus, dialogs, loading/errors and recovery in both themes. Cover keyboard focus, reduced motion, browser zoom, existing responsive layouts and scene/output isolation. Run typecheck, full tests, build and the complete UI regression chain before delivery.

Use isolated scoped branches from current origin/develop and the protected PR workflow. Preserve unrelated dirty worktrees. No production release or customer-data change is included.

## Initial evidence (2026-09-08)

Baseline: origin/develop `0b5df460`; isolated local runtime on ports 5388/5399 with synthetic file storage. Login and the empty architecture editor render successfully. Root colors are duplicated in base.css and style.css; Theme is a placeholder in the existing account menu. auth.css ends with an invalid dangling selector, which is ignored by browsers and will be removed when migrating that file.
