# Shared Postgres App Storage

Projects, clients, module packages, module visibility, catalogs, materials, components, pricing, presets, and assignments are expected to use the shared CapRover PostgreSQL app `kitchenapp-db`.
The app must not silently create or use a local `127.0.0.1` database for normal runtime data.

## CapRover DB

```text
app: kitchenapp-db
host: srv-captain--kitchenapp-db
port: 5432
database: kitchenapp
user: rotating application role from the selected Kitchen app's `DATABASE_URL`
```

Kitchen apps that use this DB:

```text
kitchenapp
arcigy-kitchen-develop
```

Each Kitchen app must run with:

```text
KITCHEN_PROJECT_STORAGE=postgres
APP_ENV=prod|dev
DATABASE_SCHEMA=prod|dev
```

Use one of these DB configuration styles:

```text
DATABASE_URL=postgresql://<application-role>:<application-password>@srv-captain--kitchenapp-db:5432/kitchenapp
```

or component env vars:

```text
POSTGRES_HOST=srv-captain--kitchenapp-db
POSTGRES_PORT=5432
POSTGRES_DB=kitchenapp
POSTGRES_USER=<application-role>
POSTGRES_PASSWORD=<application-password>
```

`kitchenapp` should use `APP_ENV=prod` and `DATABASE_SCHEMA=prod`.
`arcigy-kitchen-develop` should use `APP_ENV=dev` and `DATABASE_SCHEMA=dev`.

## Local Development

The internal host `srv-captain--kitchenapp-db` is reachable from CapRover apps, not directly from Windows.
For local development against the same DB, provide a reachable tunnel URL in `DATABASE_URL` or run the app inside the CapRover/network context.

```bash
KITCHEN_PROJECT_STORAGE=postgres
DATABASE_URL=postgresql://<application-role>:<application-password>@<reachable-host>:5432/kitchenapp
npm run dev:local:postgres
```

The PostgreSQL container's `POSTGRES_USER` and `POSTGRES_PASSWORD` are bootstrap
settings, not current application credentials. After the 2026-09 credential
rotation the original bootstrap role cannot log in. For the managed SSH tunnel,
`npm run dev:online:postgres` reads the current `DATABASE_URL` from the selected
CapRover Kitchen app (production by default). Set
`CAPROVER_RUNTIME_APP=arcigy-kitchen-develop`, `APP_ENV=dev` and
`DATABASE_SCHEMA=dev` to work with the development namespace. Never copy a
production credential into a development `.env` file or commit it.

`npm run dev:local:postgres` and `npm run db:init` now fail when no explicit DB config is present.

The Docker Compose Postgres service and file-backed repositories are only for isolated tests, migrations, or fixtures. They should not be used as the normal shared app database/runtime source of truth.
