# Catalog Module Catalog Plan

Source PDF: `C:\Users\laube\Downloads\Katalog_prvků_catalog_2023.pdf`

The PDF has 44 pages. Its embedded text layer is not usable, so the first pass was done from rendered page images under `tmp/pdfs/delfi_catalog_pages_160/`.

## Rule

Do not create one Arcigy module per Catalog catalog code. Catalog repeats the same geometry with different width, height, side, door count, drawer stack, appliance opening, material, or front type. Those must become parameters of a smaller set of robust module families.

Module identities must stay generic. Do not put the client, catalog source, `fwm`, `delfi`, `family`, or version suffixes into `modulePackageId` or `moduleType`. Use client assignment and vendor mapping metadata to connect these generic modules to a client catalog.

## Page Coverage

- Pages 1-6: lower/base cabinets, corners, doors, drawers, sinks, cooking/appliance units, open/end units.
- Pages 7-13: same lower/base families in raised height `768`, plus fillers and base trims.
- Pages 14-22: tall cabinets in heights 1480, 2080, 2230, 2380, 2530, 2680 with fridge/oven/microwave/storage variants.
- Pages 22-27: upper/wall cabinets in heights 300, 450, 600, 750, 900 with hinged, glass/AL, lift-up, corner, open niche and end variants.
- Pages 27-29: suspended units, worktops, add-on tables and worktop shapes.
- Pages 30-33: worktop accessories, cladding panels, free shelves, sokles.
- Pages 34-35: lighting and miscellaneous accessories.
- Pages 36-40: front/component library for lower, upper and corner modules.
- Pages 41-44: shelves, light/front accessories, wire baskets, trim panels and supplier info.

## Parametric Families To Build

1. `base_corner`
   Covers `Spodni rohove`, including 1D, 1D 1P, 90, 90 1P, skoseny and raised variants.

2. `base_doors`
   Covers lower door cabinets: 1D, 2D, left/right ending, standard and raised height.

3. `base_drawers`
   Covers drawer stacks: 1K, 2K, 3K, 5Z, 1K1Z, 2K1Z, 1K3Z, 1K2Z, left/right ending.

4. `base_sink`
   Covers sink base modules with door/drawer variants and worktop cutout/service logic.

5. `base_appliance`
   Covers base cooking and built-in appliance modules with drawer/door combinations.

6. `base_open_end`
   Covers open niches, curved ends and chamfered end cabinets.

7. `tall_cabinet`
   Covers tall storage, fridge, oven, microwave, broom/BD and combined appliance tower layouts.

8. `wall_cabinet`
   Covers upper cabinets across 300/450/600/750/900 heights, including glass/AL, lift-up, corners and open niches.

9. `suspended_unit`
   Covers podvesne zasuvky and shallow suspended drawer/shelf blocks.

10. `worktop_surface`
   Covers worktop boards, corner boards, add-on tables, shaped/chamfered/radius tops and cutouts.

11. `worktop_accessory`
   Covers edge strips, corner connectors and worktop-specific accessories.

12. `cladding_panel`
   Covers decorative wall/panel boards.

13. `free_shelf`
   Covers laminate/glass free shelves and shaped shelf variants.

14. `trim_component`
   Covers sokles, filler strips, cover sides, left/right filler panels and trim generated inside modules.

15. `lighting_accessory`
   Covers SADA lighting sets, point light and Lumina strips.

16. `front_component`
   Covers reusable lower/upper/tall/corner fronts, glass fronts, AL frames and lift fronts.

17. `hardware_accessory`
   Covers legs, baskets, ventilation grilles, hood motifs, rustic posts and other loose hardware/accessory geometry.

The machine-readable version of this mapping is in `src/system/catalog-templates/delfiModuleCoverage.ts`.

## Next Implementation Order

1. Build/extend parametric base families first: corner, door, drawer, sink, appliance, open/end.
2. Generate first RFA batch for these base families and review each in Revit.
3. Move to tall cabinets, then wall cabinets.
4. Add surfaces and accessories after the cabinet carcass/front system is stable.
5. Only after visual/Revit approval, assign the approved packages to `client_delfi`.

## Important Modeling Requirements

- Width, height, depth, row height, side L/P, ending side, door count, drawer stack, shelf count and front type are parameters.
- Catalog codes are variants/presets, not separate geometry builders.
- Material groups must stay explicit: carcass, front, shelf, back, plinth, worktop, hardware/accessory.
- Front components must be reusable by base, wall and tall modules.
- Filler/trim parts must exist both as standalone accessory items and as generated parts inside cabinet modules when applicable.
