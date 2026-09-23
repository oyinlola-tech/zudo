/**
 * zudojs-cli — `zudojs add docker`: a multi-stage, non-root Node 24
 * Dockerfile per backend app, `.dockerignore`, and `compose.yaml` with a
 * service per app and per enabled integration (postgres, redis, mailpit).
 * Existing files are kept: a project that already has a compose file
 * (microservice projects are created with docker-compose.yml) keeps it.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { renderAppPackageDockerfile } from "../../templates/shared/dockerfile.template.js";
import type { ProjectRecipe } from "../recipe.type.js";
import { renderComposeFile, usesPostgres } from "./docker.compose.js";

const DOCKERIGNORE = `node_modules
**/node_modules
dist
**/dist
.git
.env
**/.env
*.log
.data
**/src/generated
`;

export const dockerRecipe: ProjectRecipe = {
  scope: "project",
  feature: "docker",
  summary: "Dockerfile (multi-stage, non-root, Node 24), .dockerignore and compose.yaml",
  files: (context) => {
    const files: Record<string, string> = { ".dockerignore": DOCKERIGNORE };
    for (const app of context.apps) {
      files[app.dir === "" ? "Dockerfile" : `${app.dir}/Dockerfile`] = renderAppPackageDockerfile({
        appPath: app.dir === "" ? "." : app.dir,
        port: app.port,
        packageManager: context.packageManager,
        prisma: app.prisma,
      });
    }
    const hasCompose = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"]
      .some((name) => existsSync(join(context.root, name)));
    if (!hasCompose) files["compose.yaml"] = renderComposeFile(context);
    return files;
  },
  // Empty, never a placeholder: compose refuses to start until it is set,
  // so a copied .env.example cannot ship a guessable password. Hex keeps it
  // valid inside DATABASE_URL.
  env: (context) =>
    usesPostgres(context)
      ? [{ name: "POSTGRES_PASSWORD", value: "", comment: "Password for the compose.yaml postgres service; generate with: openssl rand -hex 32" }]
      : [],
  nextSteps: () => ["cp .env.example .env, then: docker compose up --build"],
};
