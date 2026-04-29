# Module Rules

Scope: `src/modules/`.

- Each cabinet module owns its geometry, controls, and module-specific types.
- Do not add module-specific fields to global shared types unless more than one module needs them.
- Preserve BOM, pricing, material selections, and kitchen placement metadata.
- For unique module behavior, keep it inside that module folder.
- Register modules only through `src/modules/registry.ts`.
- When module geometry or controls change, run module edge-case and module properties tests.
