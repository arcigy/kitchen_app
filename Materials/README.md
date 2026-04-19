# Materials

This folder is for **source downloads** (e.g. vendor zips).

Runtime assets used by the app live under `public/materials/<material-id>/`.

Rules for adding a new material:
- Pick a stable `material-id` (lowercase, snake_case).
- Copy only the files the app uses into `public/materials/<material-id>/` with canonical names.
- Keep everything else in `Materials/` (ignored by the app).

