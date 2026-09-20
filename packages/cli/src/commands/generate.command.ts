/**
 * zudojs-cli — Generate Command
 *
 * The `zudojs generate` (alias: `g`) command.
 * Reads the project manifest to determine the architecture and where the
 * backend lives, then places the schematic accordingly.
 */

import { join } from "node:path";

import type { CLIContext } from "../cliType/cliType.type.js";
import { generateService } from "../generators/service/service.generator.js";
import { generateModule } from "../generators/module/module.generator.js";
import type { ModuleRegistration } from "../generators/module/module.registration.js";
import { generateCommand } from "../generators/command/command.generator.js";
import { generateQuery } from "../generators/query/query.generator.js";
import { generateController } from "../generators/controller/controller.generator.js";
import { generateRepository } from "../generators/repository/repository.generator.js";
import { generateMiddleware } from "../generators/middleware/middleware.generator.js";
import { generateEvent } from "../generators/event/event.generator.js";
import { generateJob } from "../generators/job/job.generator.js";
import { generateRoute } from "../generators/route/route.generator.js";
import { generateModel } from "../generators/model/model.generator.js";
import { generateDto } from "../generators/dto/dto.generator.js";
import { generateValidator } from "../generators/validator/validator.generator.js";
import { CLIGenerationError, CLIValidationError } from "../errors/index.js";
import {
  assertGeneratableName,
  assertSafePathSegment,
} from "../utils/utils.name.js";
import { resolveProjectLayout } from "../resolvers/layout/projectLayout.core.js";
import { captureWrites, findWriteConflicts } from "../utils/utils.writeGuard.js";

const VALID_SCHEMATICS = [
  "service",
  "module",
  "command",
  "query",
  "controller",
  "repository",
  "middleware",
  "event",
  "job",
  "route",
  "model",
  "dto",
  "validator",
] as const;

interface GenerateOptions {
  readonly service?: string;
  readonly module?: string;
  readonly dryRun: boolean;
  readonly onModuleRegistered?: (registration: ModuleRegistration) => void;
  readonly architecture?: string;
}

/**
 * Resolves the directory a schematic is generated into.
 *
 * `moduleName` comes from `--module`, which was previously accepted,
 * documented and then never read by any schematic. It is validated as a
 * single safe path segment by the caller before it reaches here.
 */
function getBasePath(
  architecture: string | undefined,
  schematic: string,
  moduleName?: string,
  serviceName?: string,
): string {
  const root = getArchitectureRoot(architecture, schematic, serviceName);

  if (moduleName !== undefined && schematic !== "module") {
    return `${root}/modules/${moduleName}`;
  }

  return root;
}

/**
 * Resolves the directory a schematic is generated into for an architecture.
 *
 * The microservice layout produced by `zudojs create` is
 * `apps/gateway/src` plus `apps/services/<name>/src`; the previous
 * `apps/default` root matched no directory the scaffolder ever writes.
 */
function getArchitectureRoot(
  architecture: string | undefined,
  schematic: string,
  serviceName?: string,
): string {
  switch (architecture) {
    case "modular-monolith":
      if (schematic === "module") {
        return "src/modules";
      }
      return "src";

    case "microservice":
      if (schematic === "service") {
        // A new service is a new app in the workspace.
        return "apps/services";
      }
      // `--service <name>` selects which app the schematic belongs to.
      // Without it the gateway app — the one app always generated — is used.
      // Modules go to that app's src/modules, next to the scaffolded ones,
      // so they can be registered in its app.ts.
      {
        const appRoot =
          serviceName !== undefined
            ? `apps/services/${serviceName}/src`
            : "apps/gateway/src";
        return schematic === "module" ? `${appRoot}/modules` : appRoot;
      }

    case "monolith":
    default:
      if (schematic === "module") {
        return "src/modules";
      }
      if (schematic === "service") {
        // The monolith template scaffolds `src/services/app.service.ts` and a
        // `src/services/index.ts` barrel. Generating into `src/<name>/`
        // instead left two conventions in one project, and the generated
        // service was never exported from the barrel the template owns.
        return "src/services";
      }
      return "src";
  }
}

/**
 * Prefix under which backend schematics are generated.
 *
 * A fullstack project keeps its backend in `apps/api`; generating into the
 * workspace root's `src/` produced files no app compiled. Microservice apps
 * are addressed inside getArchitectureRoot, relative to that prefix.
 */
function backendPrefix(cwd: string): string {
  const layout = resolveProjectLayout(cwd);
  const [first] = layout?.backendDirs ?? [];

  // Only a monolith fullstack backend lives in apps/api; a microservice
  // fullstack project keeps apps/gateway and apps/services at the root.
  if (
    layout?.projectType === "fullstack" &&
    first !== undefined &&
    first === join(cwd, "apps", "api")
  ) {
    return "apps/api/";
  }

  return "";
}

export async function runGenerateCommand(context: CLIContext): Promise<void> {
  const schematic = context.values.schematic as string | undefined;
  const name = context.values.name as string | undefined;
  const service = context.values.service as string | undefined;
  const moduleName = context.values.module as string | undefined;
  const dryRun = context.values["dry-run"] === true;
  const force = context.values.force === true;

  if (
    !schematic ||
    !VALID_SCHEMATICS.includes(schematic as (typeof VALID_SCHEMATICS)[number])
  ) {
    throw new CLIValidationError(
      `Schematic name is required. Available: ${VALID_SCHEMATICS.join(", ")}`,
    );
  }

  if (!name) {
    throw new CLIValidationError("Resource name is required.");
  }

  // Reject names that normalize to nothing (`zudojs generate event "..."`
  // wrote src/events/.event.ts with an anonymous export), and reject option
  // values that are interpolated verbatim into a generated path. `--service ..`
  // used to place files outside the schematic's base directory.
  assertGeneratableName(name, "resource name");

  if (service !== undefined) {
    assertSafePathSegment(service, "--service");
  }

  if (moduleName !== undefined) {
    assertSafePathSegment(moduleName, "--module");
  }

  const cwd = context.cwd;
  const layout = resolveProjectLayout(cwd);
  const architecture = layout?.architecture ?? null;

  if (layout) {
    context.logger.info(`Detected architecture: ${layout.architecture}`);
  } else {
    context.logger.warn(
      "No Zudojs project detected (no .zudojs/manifest.json, zudojs.config.ts " +
        "or `zudojs` field in package.json). Run `zudojs create` first.",
    );
  }

  /**
   * A microservice's service is a whole workspace app — `package.json`,
   * `tsconfig.json`, `Dockerfile`, `src/app.ts`, `src/server.ts` and a port —
   * which this schematic does not produce.
   *
   * It used to warn and continue, writing a bare service class into
   * `apps/services/<name>/`. That directory matches the workspace glob but has
   * no manifest, so pnpm skipped it, `pnpm -r run build` never compiled it,
   * and `zudojs add --service <name>` reported it as an unknown service. The
   * files were unreachable and the command still exited 0. Refusing with the
   * two commands that do work is more useful than dead code.
   */
  if (architecture === "microservice" && schematic === "service") {
    throw new CLIValidationError(
      `A service in a microservice project is a workspace app, which "generate service" does not scaffold.\n` +
        `  - Add it at creation time:  zudojs create <project> --architecture microservice --services ${name}\n` +
        `  - Or add a module to an existing app:  zudojs generate module ${name} --service <existing-service>`,
    );
  }

  /**
   * A modular monolith has modules, not services, so `generate service` means
   * `generate module` there.
   *
   * This used to log the mapping and then run the service schematic anyway,
   * which wrote four inert files into a new top-level directory that the
   * runtime never loads. Rewriting the schematic here — rather than at the
   * dispatch switch — keeps the base-path resolution, the overwrite guard and
   * the result message all describing the same thing.
   */
  const effectiveSchematic =
    architecture === "modular-monolith" && schematic === "service"
      ? "module"
      : schematic;

  if (effectiveSchematic !== schematic) {
    context.logger.info(
      'Mapping "service" → "module" for modular-monolith architecture.',
    );
  }

  const schematicOptions: GenerateOptions = {
    service,
    module: moduleName,
    dryRun,
    architecture: architecture ?? undefined,
  };

  if (!dryRun && !force) {
    const planned = await captureWrites(() =>
      runSchematic(effectiveSchematic, name, schematicOptions, cwd),
    );
    const conflicts = findWriteConflicts(cwd, planned);
    if (conflicts.length > 0) {
      throw new CLIValidationError(
        `Refusing to overwrite existing files:\n${conflicts
          .map((file) => `  - ${file}`)
          .join("\n")}\nRe-run with --force to overwrite them.`,
      );
    }
  }

  const result = await runSchematic(
    effectiveSchematic,
    name,
    {
      ...schematicOptions,
      onModuleRegistered: (registration) => {
        if (registration.registered) return;
        context.logger.warn(
          `Could not register the module in app.ts automatically. Add:\n${registration.manualSteps
            .map((step) => `  ${step}`)
            .join("\n")}`,
        );
      },
    },
    cwd,
  );

  if (dryRun) {
    context.logger.info(
      `Dry run: ${result.length} files would be generated (nothing written):`,
    );
  } else {
    context.logger.info(`Generated ${result.length} files:`);
  }
  for (const file of result) {
    context.logger.info(`  - ${file}`);
  }
}

async function runSchematic(
  schematic: string,
  name: string,
  options: GenerateOptions,
  cwd: string,
): Promise<string[]> {
  try {
    const basePath =
      backendPrefix(cwd) +
      getBasePath(
        options.architecture,
        schematic,
        options.module,
        options.service,
      );
    const dryRun = options.dryRun;

    // In the microservice layout `--service` selected the owning app and is
    // already part of basePath, so it must not nest the schematic again.
    const cqrsService =
      options.architecture === "microservice"
        ? undefined
        : (options.service ?? "default");

    switch (schematic) {
      case "service":
        return await generateService({ name, basePath, dryRun }, cwd);

      case "module":
        return await generateModule(
          { name, feature: true, basePath, dryRun, onRegistered: options.onModuleRegistered },
          cwd,
        );

      case "command":
        return await generateCommand(
          { name, ...(cqrsService ? { service: cqrsService } : {}), basePath, dryRun },
          cwd,
        );

      case "query":
        return await generateQuery(
          { name, ...(cqrsService ? { service: cqrsService } : {}), basePath, dryRun },
          cwd,
        );

      case "controller":
        return await generateController({ name, basePath, dryRun }, cwd);

      case "repository":
        return await generateRepository({ name, basePath, dryRun }, cwd);

      case "middleware":
        return await generateMiddleware({ name, basePath, dryRun }, cwd);

      case "event":
        return await generateEvent({ name, basePath, dryRun }, cwd);

      case "job":
        return await generateJob({ name, basePath, dryRun }, cwd);

      case "route":
        return await generateRoute({ name, basePath, dryRun }, cwd);

      case "model":
        return await generateModel({ name, basePath, dryRun }, cwd);

      case "dto":
        return await generateDto({ name, basePath, dryRun }, cwd);

      case "validator":
        return await generateValidator({ name, basePath, dryRun }, cwd);

      default:
        throw new CLIValidationError(
          `Unknown schematic: "${schematic}". Available: ${VALID_SCHEMATICS.join(", ")}.`,
        );
    }
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to generate ${schematic}: ${name}`,
      error,
    );
  }
}
