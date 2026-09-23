/**
 * zudojs-cli — Where `generate` puts a resource in each architecture.
 *
 * - monolith / modular monolith: the app is the project root (`apps/api`
 *   in a fullstack workspace); `--module <name>` places the resource in
 *   `src/modules/<name>/` and registers it in that module's routes index.
 * - microservice: the gateway app, or `apps/services/<name>` with
 *   `--service <name>`; `--module` works inside that app the same way.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { CLIValidationError } from "../../errors/index.js";
import { joinPath, type ResourceLayout } from "../../templates/resource/index.js";

/** Inputs of {@link resolveResourceLayout}. */
export interface ResourceLayoutInput {
  readonly cwd: string;
  readonly architecture: string | undefined;
  /** `""` or `"apps/api"`: where a non-microservice backend lives. */
  readonly backendRoot: string;
  readonly service?: string;
  readonly module?: string;
}

/**
 * Resolves the {@link ResourceLayout} for a generate call.
 *
 * @throws {CLIValidationError} When the selected service or module does not exist.
 */
export function resolveResourceLayout(input: ResourceLayoutInput): ResourceLayout {
  const { cwd } = input;
  let appRoot = input.backendRoot;

  if (input.architecture === "microservice") {
    appRoot =
      input.service === undefined || input.service === "gateway"
        ? "apps/gateway"
        : `apps/services/${input.service}`;
    if (!existsSync(join(cwd, appRoot, "package.json"))) {
      throw new CLIValidationError(
        `No app at ${appRoot}. Pass --service with an existing service (or omit it for the gateway).`,
      );
    }
  }

  const appSrc = joinPath(appRoot, "src");
  let base = appSrc;
  if (input.module !== undefined) {
    base = joinPath(appSrc, "modules", input.module);
    if (!existsSync(join(cwd, base))) {
      throw new CLIValidationError(
        `Module "${input.module}" does not exist at ${base}. Create it first: zudojs generate module ${input.module}`,
      );
    }
  }

  return {
    base,
    appSrc,
    appRoot,
    prisma: existsSync(join(cwd, appRoot, "prisma", "schema.prisma")),
  };
}
