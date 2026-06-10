# Local Postgres Project Storage

Project storage can run against a local Postgres database. Metadata is stored in `arcigy_projects`; the complete `ProjectSaveFile` payload is stored as JSONB in `arcigy_project_saves`.

## Start

```bash
npm run db:up
npm run db:migrate -- --schema public --app-env local
npm run db:seed -- --schema public --app-env local
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
APP_ENV=local
DATABASE_SCHEMA=public
```

CapRover production and develop should use the same Postgres server with separate schemas:

```text
APP_ENV=prod
DATABASE_SCHEMA=prod
ARCIGY_OBJECT_STORAGE_PREFIX=prod
```

```text
APP_ENV=dev
DATABASE_SCHEMA=dev
ARCIGY_OBJECT_STORAGE_PREFIX=dev
```

Run migrations manually before deploy:

```bash
npm run db:migrate -- --schema prod --app-env prod
npm run db:seed -- --schema prod --app-env prod
npm run db:migrate -- --schema dev --app-env dev
npm run db:seed -- --schema dev --app-env dev
```

Without `KITCHEN_PROJECT_STORAGE=postgres` or `KITCHEN_PROJECT_DATABASE_URL` / `PROJECT_DATABASE_URL` / `DATABASE_URL`, the server keeps using the existing file repository fallback.
