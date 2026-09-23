/**
 * zudojs-cli — `compose.yaml` for `zudojs add docker`.
 *
 * One service per backend app plus one per enabled integration that needs
 * a server: `postgres` (database), `redis` and `mailpit` (email, SMTP on
 * 1025, web UI on 8025). Backing services publish on 127.0.0.1 only, and
 * the Postgres password is read from `.env` (POSTGRES_PASSWORD): compose
 * refuses to start without it, so no credential is written into the file.
 */

import type { ProjectRecipeContext } from "../recipe.type.js";

/**
 * Whether compose runs a `postgres` service. The `database` capability is
 * recorded for MySQL and SQLite projects too, which used to get a Postgres
 * container and a DATABASE_URL overriding their own.
 */
export function usesPostgres(context: ProjectRecipeContext): boolean {
  return context.features.has("database") && context.database === "postgresql";
}

const POSTGRES_URL = (db: string): string =>
  `postgresql://postgres:\${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}@postgres:5432/${db}`;

function appService(
  context: ProjectRecipeContext,
  app: ProjectRecipeContext["apps"][number],
): string {
  const env = [
    `      NODE_ENV: production`,
    `      HOST: 0.0.0.0`,
    `      PORT: "${app.port}"`,
    ...(usesPostgres(context) ? [`      DATABASE_URL: ${POSTGRES_URL(context.projectSlug)}`] : []),
    ...(context.features.has("redis") ? [`      REDIS_URL: redis://redis:6379`] : []),
    ...(context.features.has("email") ? [`      SMTP_HOST: mailpit`, `      SMTP_PORT: "1025"`] : []),
  ];
  const dependsOn = [
    ...(usesPostgres(context) ? ["postgres"] : []),
    ...(context.features.has("redis") ? ["redis"] : []),
  ];
  const dockerfile = app.dir === "" ? "Dockerfile" : `${app.dir}/Dockerfile`;
  return `  ${app.name}:
    build:
      context: .
      dockerfile: ${dockerfile}
    ports:
      - "${app.port}:${app.port}"
    env_file:
      - path: ${app.dir === "" ? "" : `${app.dir}/`}.env
        required: false
    environment:
${env.join("\n")}
${dependsOn.length === 0 ? "" : `    depends_on:\n${dependsOn.map((name) => `      ${name}:\n        condition: service_healthy`).join("\n")}\n`}`;
}

const BACKING_SERVICES: Readonly<Record<string, (db: string) => string>> = {
  database: (db) => `  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${db}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d ${db}"]
      interval: 5s
      timeout: 3s
      retries: 20
`,
  redis: () => `  redis:
    image: redis:8-alpine
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20
`,
  email: () => `  mailpit:
    image: axllent/mailpit:v1.27
    ports:
      - "127.0.0.1:1025:1025"
      - "127.0.0.1:8025:8025"
`,
};

/** Renders `compose.yaml`. */
export function renderComposeFile(context: ProjectRecipeContext): string {
  const backing = Object.entries(BACKING_SERVICES)
    .filter(([feature]) => (feature === "database" ? usesPostgres(context) : context.features.has(feature)))
    .map(([, render]) => render(context.projectSlug));
  const volumes = usesPostgres(context) ? "\nvolumes:\n  postgres-data:\n" : "";
  return `# docker compose up --build
services:
${[...context.apps.map((app) => appService(context, app)), ...backing].join("\n")}${volumes}`;
}
