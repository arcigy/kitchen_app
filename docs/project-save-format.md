# Project Save Format

Project lifecycle data is tenant-scoped. Production and normal development store projects in the online tenant database. The server derives `clientId` from the validated session and must not trust a client-supplied tenant id.

File-backed project paths are legacy/test/migration fixtures only:

```txt
storage/clients/{clientId}/projects/{projectId}/
  project.meta.json
  phases/{phaseId}/
    saves/save.json
    backups/
    exports/
    renders/
    uploads/
```

Do not add new normal-runtime project, client, catalog, module, pricing, or preset flows that bypass the tenant DB. Local files may be used only for explicit import/export artifacts, tests, or controlled migration tooling.

`project.meta.json` contains project identity, required project fields, active phase and ownership metadata. New projects create `phase_1` as `Faza 1`.

## Save Snapshot

`save.json` is a `ProjectSaveFile` with:

- `format: "kitchen-app-project"`
- `saveFormatVersion`
- `clientId`, `projectId`, `activePhaseId`
- project metadata
- phase saves
- layout snapshot
- kitchen context/groups
- module instances and all module params
- scene/editor/camera/selections
- pricing/quote settings when available
- catalog snapshot, including used IDs and full client catalog snapshot
- asset manifest
- integrity timestamps

The save assembler only accepts serializable data. Functions, DOM elements and circular references fail validation.

## FurnQuote Project File

Downloaded project files use `.fqp`, short for FurnQuote Project. The runtime filename pattern is `{safeProjectName}.fqp`; unsafe filename characters, path separators and traversal segments are removed.

The raw file contains only an encrypted envelope:

```ts
{
  magic: "FURNQUOTE_ENCRYPTED_PROJECT",
  envelopeVersion: 1,
  algorithm: "AES-256-GCM",
  keyId: "v1",
  createdAt: "...",
  payloadEncoding: "base64",
  iv: "...",
  authTag: "...",
  ciphertext: "..."
}
```

The encrypted payload is canonical JSON, gzip-compressed and encrypted server-side with `PROJECT_FILE_SECRET`. The frontend never imports project crypto and never receives the secret.

The decrypted payload is:

```ts
type ProjectExportPayload = {
  payloadType: "furnquote-project-export";
  payloadVersion: 1;
  exportedAt: string;
  save: ProjectSaveFile;
  bundledAssets: ProjectBundledAssetPayload[];
};
```

The plain envelope must not contain project names, contacts, prices, dimensions, material names, module params, asset filenames or readable asset bytes.

Production requires `PROJECT_FILE_SECRET`. Development can use a dev fallback, but production must not.

## Asset Manifest And Bundling

`ProjectSaveFile.assets` describes project assets as:

- `bundled`: project-specific upload assets copied into the encrypted `.fqp`, each with `phaseId`
- `external`: system/public/external references that are not copied
- `missing`: expected assets that were not found
- `generated`: renders/exports/debug artifacts that are regeneratable or not required for restore

The export bundles project-specific uploads from every phase listed in `ProjectSaveFile.phases`, not only `activePhaseId`:

```txt
storage/clients/{clientId}/projects/{projectId}/phases/{eachPhaseId}/uploads/
```

Bundled assets are stored inside the encrypted payload with `assetId`, `phaseId`, safe `fileName`, `mimeType`, `sha256`, `sizeBytes` and base64 data. File names and bytes are never present in the plain envelope.

Default bundled asset limits:

- max single asset: 25 MB
- max total bundled assets: 150 MB
- max asset count: 200

Allowed MIME types:

- `image/png`
- `image/jpeg`
- `image/webp`
- `application/pdf`

Renders, exports, debug files, system/public assets and source assets are not bundled by default. They are treated as generated or external because they are either regeneratable or owned by the system, not the project.

## Import

Import sends the encrypted envelope to the backend. The backend decrypts, validates the envelope, validates `ProjectExportPayload`, validates `ProjectSaveFile`, verifies every bundled asset SHA-256 and rejects any payload whose `clientId` differs from the current session client.

If the `projectId` already exists for the current client, import fails with conflict and writes nothing. If there is no conflict, import restores bundled uploads into tenant storage under their own `phaseId`, writes `project.meta.json`, writes `save.json`, and returns the imported save. Cross-client project transfer is intentionally not supported.

Missing critical upload assets in any saved phase fail export/import. Generated renders/exports are non-critical and are not bundled.

## Serializer Coverage

Current critical serializers are covered:

- project metadata
- phases
- layout
- walls
- floors
- columns
- sections
- windows
- doors
- worktops
- kitchen context
- module instances
- module params
- module positions
- module dimensions
- material selections
- component selections
- pricing settings
- quote settings
- catalog snapshot
- asset manifest

Non-critical but serialized/restored best-effort:

- scene state
- editor state
- camera state
- selections

Windows and doors are no longer only raw layout data. They are saved with IDs and full params and restored into the layout scene before the project is considered loaded.
