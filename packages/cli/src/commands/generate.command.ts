/**
 * zudojs-cli — Generate Command
 *
 * The `zudojs generate` (alias: `g`) command.
 * Reads zudojs.config.ts to determine project architecture.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CLIContext } from "../cliType/cliType.type.js";
import { generateService } from "../generators/service/service.generator.js";
import { generateModule } from "../generators/module/module.generator.js";
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
      return serviceName !== undefined
        ? `apps/services/${serviceName}/src`
        : "apps/gateway/src";

    case "monolith":
    default:
      if (schematic === "module") {
        return "src/modules";
      }
      return "src";
  }
}

function readZudojsArchitecture(cwd: string): string | null {
  for (const configFile of ["zudojs.config.ts", "zudojs.config.js"]) {
    const configPath = join(cwd, configFile);
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const match = content.match(/architecture:\s*["'](\w[\w-]*)["']/);
      if (match?.[1]) return match[1];
    }
  }

  // Fall back to the machine-managed manifest written by `zudojs create`.
  const manifestPath = join(cwd, ".zudojs", "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
        architecture?: string;
      };
      if (manifest.architecture) return manifest.architecture;
    } catch {
      // ignore malformed manifest
    }
  }

  // Fall back to the zudojs field in package.json.
  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        zudojs?: { architecture?: string };
      };
      if (pkg.zudojs?.architecture) return pkg.zudojs.architecture;
    } catch {
      // ignore malformed package.json
    }
  }

  return null;
}

export async function runGenerateCommand(context: CLIContext): Promise<void> {
  const schematic = context.values.schematic as string | undefined;
  const name = context.values.name as string | undefined;
  const service = context.values.service as string | undefined;
  const moduleName = context.values.module as string | undefined;
  const dryRun = context.values["dry-run"] === true;

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
  const architecture = readZudojsArchitecture(cwd);

  if (architecture) {
    context.logger.info(`Detected architecture: ${architecture}`);
  } else {
    context.logger.warn(
      "No Zudojs project detected (no zudojs.config.ts, .zudojs/manifest.json " +
        "or `zudojs` field in package.json). Run `zudojs create` first.",
    );
  }

  if (architecture === "microservice" && schematic === "service") {
    context.logger.warn(
      'In microservice architecture, prefer "zudojs generate module" — services are top-level apps.',
    );
  }

  if (architecture === "modular-monolith" && schematic === "service") {
    context.logger.info(
      'Mapping "service" → "module" for modular-monolith architecture.',
    );
  }

  const result = await runSchematic(
    schematic,
    name,
    {
      service,
      module: moduleName,
      dryRun,
      architecture: architecture ?? undefined,
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
    const basePath = getBasePath(
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
          { name, feature: true, basePath, dryRun },
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
