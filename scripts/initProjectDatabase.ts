import { closePostgresProjectPools, createPostgresProjectRepository } from "../src/core/project/project-postgres-repository";

const connectionString =
  process.env.KITCHEN_PROJECT_DATABASE_URL ||
  process.env.PROJECT_DATABASE_URL ||
  "postgres://kitchen_app:kitchen_app@127.0.0.1:5432/kitchen_app";

try {
  await createPostgresProjectRepository({
    connectionString,
    projectRoot: process.cwd()
  }).listProjects({
    clientId: "db_init",
    userId: "db_init",
    roles: ["owner"],
    isSystemAdmin: true
  });

  console.log("[project-db] schema is ready");
} finally {
  await closePostgresProjectPools();
}
