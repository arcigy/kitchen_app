# Edge banding and pricing repair — 2026-09-23

Owners: shared edge entities and group assignment rules live in `src/core/edge-banding`; physical module edges in `src/modules/fwmFurniture`; custom panel adapters in `src/layout`; editing and preview in focused `src/app` controllers. Project material assignments own reusable group material snapshots. Module parameters and custom boards own stable edge-to-group bindings. No feature behavior belongs in app.ts.

Implementation path: establish shared edge entity contract and stable topology identity; retain current default manufacturing rules; add explicit assignments/removal without storing lengths; expose the same entities to the interactive preview and BOM; implement transactional advanced editing and group material controls; validate save/load and unknown references; repair supplier price normalization, board plinth units, and worktop purchase increments. Existing unrelated wall changes remain untouched.

Acceptance: independently calculated perimeter and mixed-group costs, modules and custom boards, resizing and topology changes, repeated quantities, modal undo/redo/cancel, saved project roundtrip, no silent fallback for missing group materials, current browser errors zero. Required repository typecheck, tests, build and UI regression must pass before reporting completion. Customer fixtures remain outside the repository.
