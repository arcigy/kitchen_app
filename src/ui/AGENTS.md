# UI Rules

Scope: `src/ui/`.

- This folder owns reusable DOM panels, inputs, adapters, and shell UI helpers.
- Keep UI helpers reusable and free of layout business rules.
- Do not mutate layout state directly from reusable UI code; expose callbacks.
- Keep labels and control behavior stable unless the task explicitly changes UX.
- Prefer small, typed adapter APIs over passing raw container elements through unrelated code.
