/**
 * zudojs-cli — `zudojs add database` (alias `postgres`): PostgreSQL through
 * Prisma 7 and @zudojs/database. Writes the schema, `prisma.config.ts`,
 * the client integration and the `db:*` scripts; `generate resource` then
 * writes Prisma-backed repositories and models.
 */

import { CLIValidationError } from "../../../errors/index.js";
import { zudojsDependencies } from "../../../constants/index.js";
import { DEPENDENCY_VERSION_RANGES } from "../../../resolvers/dependency/dependencyVersions.constant.js";
import { DATABASE_CONFIG_SECTION } from "../../../templates/backendApp/index.js";
import type { AppRecipe } from "../../recipe.type.js";
import {
  renderDatabaseIntegration,
  renderPrismaConfig,
  renderPrismaSchema,
} from "./database.files.js";

export const databaseRecipe: AppRecipe = {
  scope: "app",
  feature: "database",
  summary: "PostgreSQL via Prisma 7 (prisma/schema.prisma, src/integrations/database.ts, db:* scripts)",
  validate: (context) => {
    if (context.database !== "postgresql") {
      throw new CLIValidationError(
        `The database recipe supports PostgreSQL only (@zudojs/database is a PostgreSQL layer); this project records "${context.database}". Change "database.provider" in .zudojs/manifest.json to "postgresql" to use it.`,
      );
    }
  },
  dependencies: {
    ...zudojsDependencies(["@zudojs/database"]),
    "@prisma/client": DEPENDENCY_VERSION_RANGES["@prisma/client"],
    "@prisma/adapter-pg": DEPENDENCY_VERSION_RANGES["@prisma/adapter-pg"],
    // A runtime dependency, not a dev one: the production image prunes dev
    // dependencies, and without the CLI it could not run `prisma migrate
    // deploy` — the image could serve but never migrate.
    prisma: DEPENDENCY_VERSION_RANGES.prisma,
  },
  scripts: {
    postinstall: "prisma generate",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
  },
  replaceScripts: { build: { from: "tsc", to: "prisma generate && tsc" } },
  env: (context) => [
    { name: "DATABASE_URL", value: `postgresql://postgres:change-me@localhost:5432/${context.projectSlug}` },
  ],
  configSection: DATABASE_CONFIG_SECTION,
  integration: { file: "database.ts", exportName: "databaseIntegration", source: renderDatabaseIntegration },
  files: () => ({
    "prisma/schema.prisma": renderPrismaSchema(),
    "prisma.config.ts": renderPrismaConfig(),
  }),
  gitignore: (context) => [`${context.appRoot === "" ? "" : `${context.appRoot}/`}src/generated/`],
  allowBuilds: ["prisma", "@prisma/engines", "@prisma/client"],
  // The Prisma CLI pulls in mysql2 (unused with PostgreSQL) and deepmerge-ts
  // at versions with published advisories (GHSA-3f6p-5ww8-9rcr,
  // GHSA-rgwj-5xj2-c3m3, GHSA-ggr8-5vv4-36mx), so `pnpm audit` failed in
  // every fresh project. Open-ended ranges: once Prisma catches up they
  // change nothing.
  overrides: { mysql2: ">=3.23.1", "deepmerge-ts": ">=8.0.0" },
  nextSteps: () => [
    "Set DATABASE_URL in .env, then run the db:migrate script after adding models.",
    "In production, apply migrations with the built image: docker run --rm --env-file .env <image> npx prisma migrate deploy (the db:deploy script does the same locally).",
    "Resources generated from now on use Prisma; existing ones keep their in-memory repository until you swap it in src/container.ts.",
  ],
};
