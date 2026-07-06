# Client Module Assignment Script

Use this when a client should see only a selected set of module packages in Arcigy.

The script updates tenant `ClientCatalog.modules` and can seed selected system `.fqm` packages into the tenant package store. Runtime visibility still comes from `catalog.modules.enabled`.

Production and normal development assignments must target the online tenant DB. Do not implement client-specific module availability as a hardcoded UI/runtime whitelist. If a client should see different modules, update that client's DB-backed `ClientCatalog.modules`.

## Script

```bash
npm run db:assign-client-modules -- --clientId <client_id> --modules <module_ids>
```

Default behavior is dry-run. Nothing is persisted unless `--write` is present.

## Common Flow For AI Agents

1. List available system packages:

```bash
npm run db:assign-client-modules -- --list-system
```

2. Run a dry-run for the target client:

```bash
npm run db:assign-client-modules -- --clientId client_delfi --modules base_corner,base_doors --mode merge
```

3. Check JSON output:

- `dryRun` must be `true`
- `changes` should show only intended modules
- `mode` must match the requested operation

4. Persist only after the dry-run is correct:

```bash
npm run db:assign-client-modules -- --clientId client_delfi --modules base_corner,base_doors --mode merge --write
```

## Modes

`merge` enables selected modules and keeps other modules as they are. This is the safest default.

```bash
npm run db:assign-client-modules -- --clientId client_delfi --modules base_corner --mode merge --write
```

`replace` enables selected modules and disables every unlisted module already in the catalog.

```bash
npm run db:assign-client-modules -- --clientId client_delfi --modules base_corner,base_doors --mode replace --write
```

`disable` disables selected modules.

```bash
npm run db:assign-client-modules -- --clientId client_delfi --modules fridge_tall --mode disable --write
```

## Module Identifiers

`--modules` accepts comma-separated values. Each value can be:

- `modulePackageId`, for example `base_corner`
- `moduleType`, for example `base_corner`
- `all`, meaning all known system packages

Prefer `modulePackageId` for production work because it is exact and stable.

## Cloud Postgres

For CapRover cloud DB, run with explicit Postgres config loaded in the environment:

```bash
APP_ENV=prod DATABASE_SCHEMA=prod DATABASE_URL=postgresql://... npm run db:assign-client-modules -- --clientId client_delfi --modules base_corner --write
```

Never paste DB passwords into docs, commits, or chat logs. Use local env variables, CapRover env lookup, or a temporary shell-only variable.

## File Storage / Local Fixtures

File storage is only for explicit local fixtures, migration rehearsal, or isolated tests. Do not use it as the normal source of truth for client module availability.

To test against local tenant files instead of Postgres:

```bash
npm run db:assign-client-modules -- --storage file --projectRoot C:\Users\laube\Documents\GitHub\kitchen_app --clientId client_delfi --modules base_corner --mode merge --write
```

## Expected Output

The script prints JSON:

```json
{
  "ok": true,
  "dryRun": true,
  "storage": "postgres",
  "schema": "prod",
  "clientId": "client_delfi",
  "summary": {
    "mode": "merge",
    "selectedCount": 2,
    "enabledCount": 1
  },
  "changes": [
    {
      "modulePackageId": "base_corner",
      "moduleType": "base_corner",
      "action": "enabled"
    }
  ]
}
```

Actions:

- `added`: module was added to catalog and enabled
- `enabled`: existing disabled module was enabled
- `updated`: existing enabled module metadata was refreshed from package
- `disabled`: module was disabled
- `unchanged`: selected operation did not need a change

## Safety Rules

- Always run dry-run first.
- Use `--write` only after checking the JSON changes.
- Use `--mode merge` unless the user explicitly wants to remove access to unlisted modules.
- Do not run against `prod` unless the target client and module list are explicit.
- This script does not deploy the app. The live app must be running a version that reads Postgres/file tenant catalogs and module packages.
