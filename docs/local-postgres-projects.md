# Local Postgres Project Storage

Project storage can run against a local Postgres database. Metadata is stored in `arcigy_projects`; the complete `ProjectSaveFile` payload is stored as JSONB in `arcigy_project_saves`.

## Start

```bash
npm run db:up
npm run db:init
npm run dev:local:postgres
```

The default local database URL is:

```text
postgres://kitchen_app:kitchen_app@127.0.0.1:5432/kitchen_app
```

Override it with:

```bash
KITCHEN_PROJECT_DATABASE_URL=postgres://user:pass@host:5432/db
KITCHEN_PROJECT_STORAGE=postgres
```

Without `KITCHEN_PROJECT_STORAGE=postgres` or `KITCHEN_PROJECT_DATABASE_URL` / `PROJECT_DATABASE_URL`, the server keeps using the existing file repository fallback.
