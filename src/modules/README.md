# Modules

Application modules are installed under `src/modules/<moduleFolder>`.

Each imported module owns its own geometry, controls, types, calculation placeholder, and `module.import.json`.
The app discovers modules through `src/modules/registry.ts`; do not wire module lists directly in UI or layout code.

Developer import command:

```bash
npm run import:modpkg -- "C:\path\to\module.modpkg.zip"
```
