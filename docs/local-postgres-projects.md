# Shared Postgres App Storage

Projects, clients, module packages, module visibility, catalogs, materials, components, pricing, presets, and assignments are expected to use the shared CapRover PostgreSQL app `kitchenapp-db`.
The app must not silently create or use a local `127.0.0.1` database for normal runtime data.

## CapRover DB

```text
app: kitchenapp-db
host: srv-captain--kitchenapp-db
port: 5432
database: kitchenapp
user: kitchenapp
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
DATABASE_URL=postgresql://kitchenapp:<POSTGRES_PASSWORD>@srv-captain--kitchenapp-db:5432/kitchenapp
```

or component env vars:

```text
POSTGRES_HOST=srv-captain--kitchenapp-db
POSTGRES_PORT=5432
POSTGRES_DB=kitchenapp
POSTGRES_USER=kitchenapp
POSTGRES_PASSWORD=<CapRover secret>
```

`kitchenapp` should use `APP_ENV=prod` and `DATABASE_SCHEMA=prod`.
`arcigy-kitchen-develop` should use `APP_ENV=dev` and `DATABASE_SCHEMA=dev`.

## Local Development

The internal host `srv-captain--kitchenapp-db` is reachable from CapRover apps, not directly from Windows.
For local development against the same DB, provide a reachable tunnel URL in `DATABASE_URL` or run the app inside the CapRover/network context.

```bash
KITCHEN_PROJECT_STORAGE=postgres
DATABASE_URL=postgresql://kitchenapp:<POSTGRES_PASSWORD>@<reachable-host>:5432/kitchenapp
npm run dev:local:postgres
```

`npm run dev:local:postgres` and `npm run db:init` now fail when no explicit DB config is present.

The Docker Compose Postgres service and file-backed repositories are only for isolated tests, migrations, or fixtures. They should not be used as the normal shared app database/runtime source of truth.
