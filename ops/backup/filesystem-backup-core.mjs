import path from "node:path";
import { readdir } from "node:fs/promises";

const SAFE_HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?|\[[0-9A-Fa-f:]+\])$/u;
const SAFE_RESTORE_ID = /^[a-z0-9]{8,32}$/u;

function fail(message) {
  throw new Error(`Arcigy filesystem backup configuration error: ${message}`);
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function positiveInteger(value, name, minimum, maximum) {
  if (!/^[0-9]+$/u.test(value)) fail(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function absolutePath(value, name) {
  if (!path.isAbsolute(value)) fail(`${name} must be an absolute path.`);
  return path.resolve(value);
}

function sshConfig(env) {
  const host = required(env, "ARCIGY_BACKUP_SSH_HOST");
  if (!SAFE_HOST.test(host)) fail("ARCIGY_BACKUP_SSH_HOST is invalid.");
  const user = env.ARCIGY_BACKUP_SSH_USER?.trim() || "root";
  if (user !== "root") fail("ARCIGY_BACKUP_SSH_USER must be root for the fixed CapRover backup contract.");
  return {
    host,
    user,
    knownHosts: absolutePath(required(env, "ARCIGY_BACKUP_SSH_KNOWN_HOSTS"), "ARCIGY_BACKUP_SSH_KNOWN_HOSTS")
  };
}

export function validateFilesystemBackupEnvironment(env = process.env) {
  if (env.ARCIGY_BACKUP_OFFSITE_ACK !== "true") fail("ARCIGY_BACKUP_OFFSITE_ACK=true is required.");
  const encryptionPassphrase = required(env, "ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE");
  if (Buffer.byteLength(encryptionPassphrase, "utf8") < 24) {
    fail("ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE must be at least 24 bytes.");
  }
  return {
    targetRoot: absolutePath(required(env, "ARCIGY_BACKUP_TARGET_ROOT"), "ARCIGY_BACKUP_TARGET_ROOT"),
    encryptionPassphrase,
    intervalHours: positiveInteger(env.ARCIGY_BACKUP_INTERVAL_HOURS || "24", "ARCIGY_BACKUP_INTERVAL_HOURS", 1, 168),
    ssh: sshConfig(env)
  };
}

export function buildFilesystemBackupPath(root, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/gu, "-");
  const directory = path.join(
    path.resolve(root),
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0")
  );
  return path.join(directory, `${stamp}-postgres-prod.pgdump.arcigy`);
}

export function validateFilesystemRestoreEnvironment(env = process.env) {
  const config = validateFilesystemBackupEnvironment(env);
  if (env.ARCIGY_RESTORE_ISOLATED !== "true") fail("ARCIGY_RESTORE_ISOLATED=true is required.");
  const selectLatest = env.ARCIGY_RESTORE_LATEST === "true";
  const requestedArtifact = env.ARCIGY_RESTORE_FILE?.trim();
  if (selectLatest === Boolean(requestedArtifact)) {
    fail("set exactly one of ARCIGY_RESTORE_FILE or ARCIGY_RESTORE_LATEST=true.");
  }
  if (selectLatest) return { ...config, artifactPath: undefined, selectLatest: true };
  const artifactPath = absolutePath(requestedArtifact, "ARCIGY_RESTORE_FILE");
  const relative = path.relative(config.targetRoot, artifactPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !artifactPath.endsWith(".pgdump.arcigy")) {
    fail("ARCIGY_RESTORE_FILE must be one encrypted database artifact inside ARCIGY_BACKUP_TARGET_ROOT.");
  }
  return { ...config, artifactPath, selectLatest: false };
}

export async function selectLatestFilesystemBackup(root) {
  const absoluteRoot = path.resolve(root);
  const artifacts = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("backup target contains a symbolic link.");
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".pgdump.arcigy")) artifacts.push(entryPath);
    }
  }
  await visit(absoluteRoot);
  artifacts.sort((left, right) => left.localeCompare(right, "en"));
  const selected = artifacts.at(-1);
  if (!selected) fail("backup target contains no encrypted database artifact.");
  return selected;
}

export function buildProductionDumpScript() {
  return `set -eu
ids=$(docker ps --filter label=com.docker.swarm.service.name=srv-captain--kitchenapp-db --format '{{.ID}}')
set -- $ids
if [ "$#" -ne 1 ]; then
  echo 'expected exactly one running Arcigy production database container' >&2
  exit 41
fi
exec flock --nonblock /tmp/arcigy-production-backup.lock docker exec "$1" sh -ceu 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --schema=prod --format=custom --no-owner --no-privileges'
`;
}

export function buildIsolatedDatabaseRestoreScript(restoreId) {
  if (!SAFE_RESTORE_ID.test(restoreId)) fail("restore drill ID is invalid.");
  const container = `arcigy_restore_drill_${restoreId}`;
  return `set -eu
container='${container}'
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
if docker ps -a --format '{{.Names}}' | grep -Fx "$container" >/dev/null; then
  echo 'restore drill container already exists' >&2
  exit 51
fi
image=$(docker service inspect srv-captain--kitchenapp-db --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}')
case "$image" in
  postgres:16-alpine|postgres:16-alpine@sha256:*) ;;
  *) echo 'production PostgreSQL image is outside the approved version' >&2; exit 52 ;;
esac
docker run --detach --pull=never --network none --name "$container" --label com.arcigy.restore-drill=true --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=arcigy_restore_drill "$image" >/dev/null
ready=false
for attempt in $(seq 1 60); do
  if docker exec "$container" pg_isready --username postgres --dbname arcigy_restore_drill >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'isolated PostgreSQL did not become ready' >&2; exit 53; fi
docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-privileges --username postgres --dbname arcigy_restore_drill
tables=$(docker exec "$container" psql --username postgres --dbname arcigy_restore_drill --tuples-only --no-align --command "SELECT count(*) FROM information_schema.tables WHERE table_schema='prod' AND table_type='BASE TABLE'")
migrations=$(docker exec "$container" psql --username postgres --dbname arcigy_restore_drill --tuples-only --no-align --command "SELECT count(*) FROM prod.schema_migrations")
constraints=$(docker exec "$container" psql --username postgres --dbname arcigy_restore_drill --tuples-only --no-align --command "SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='prod'")
indexes=$(docker exec "$container" psql --username postgres --dbname arcigy_restore_drill --tuples-only --no-align --command "SELECT count(*) FROM pg_indexes WHERE schemaname='prod'")
row_counts=$(docker exec "$container" sh -ceu '
tables=$(psql --username postgres --dbname arcigy_restore_drill --tuples-only --no-align --command "SELECT tablename FROM pg_tables WHERE schemaname='"'"'prod'"'"' ORDER BY tablename")
for table in $tables; do
  case "$table" in *[!a-z0-9_]*) exit 61 ;; esac
  rows=$(psql --username postgres --dbname arcigy_restore_drill --tuples-only --no-align --command "SELECT count(*) FROM prod.\\"$table\\"")
  printf "%s=%s\\n" "$table" "$rows"
done
')
row_count_sha256=$(printf '%s\n' "$row_counts" | sha256sum | cut -d ' ' -f 1)
total_rows=$(printf '%s\n' "$row_counts" | awk -F= '{ total += $2 } END { print total + 0 }')
printf '{"restored":true,"target":"isolated_ephemeral_container","tables":%s,"migrations":%s,"constraints":%s,"indexes":%s,"totalRows":%s,"rowCountSha256":"%s"}\n' "$tables" "$migrations" "$constraints" "$indexes" "$total_rows" "$row_count_sha256"
`;
}
