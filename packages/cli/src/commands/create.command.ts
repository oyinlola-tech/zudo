/**
 * zudojs-cli — Create Command
 *
 * The `zudojs create` command.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import * as p from "@clack/prompts";
import type { CLIContext } from "../cliType/cliType.type.js";
import type { ScaffoldOptions } from "../types/index.js";
import type {
  FrontendFramework,
  ProjectConfiguration,
} from "../types/projectConfiguration.type.js";
import { generateProject } from "../generators/project/project.generator.js";
import { FrontendGenerator } from "../generators/frontend/frontendGenerator.core.js";
import { FullstackComposer } from "../generators/fullstack/fullstackComposer.core.js";
import { IntegrationGenerator } from "../generators/integration/integrationGenerator.core.js";
import { InfrastructureGenerator } from "../generators/infrastructure/infrastructure.generator.js";
import { BackendGenerator } from "../generators/backend/backend.generator.js";
import { RollbackManager } from "../rollback/rollbackManager.core.js";
import {
  promptProjectName,
  promptProjectType,
  promptConfirmation,
} from "../prompts/project/index.js";
import {
  promptBackendArchitecture,
  promptDatabase,
  promptApiStyle,
  promptServices,
} from "../prompts/backend/index.js";
import {
  promptFramework,
  promptFrontendArchitecture,
} from "../prompts/frontend/index.js";
import { promptPackageManager } from "../prompts/workspace/index.js";
import { promptCapabilities } from "../prompts/capabilities/index.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { execCommand, runStreaming } from "../utils/utils.exec.js";
import { writeFileTree } from "../utils/utils.fileSystem.js";
import { resolveMicroserviceServices } from "../templates/microservice/index.js";
import { ManifestManager } from "../manifest/manifestManager.core.js";
import { CLI_VERSION } from "../constants/index.js";

const VALID_PROJECT_TYPES = ["backend", "frontend", "fullstack"] as const;
const VALID_ARCHITECTURES = [
  "monolith",
  "modular-monolith",
  "microservice",
] as const;
const VALID_DATABASES = ["postgresql", "mysql", "sqlite", "mongodb"] as const;
const VALID_PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
const SERVICE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const VALID_FRONTENDS = [
  "none",
  "react",
  "next",
  "vue",
  "nuxt",
  "angular",
  "svelte",
  "sveltekit",
  "astro",
  "vanilla",
  "flutter",
  "react-native",
] as const;
const VALID_FRONTEND_ARCHITECTURES = [
  "zudojs-standard",
  "feature-based",
  "minimal",
  "framework-default",
] as const;
const VALID_LANGUAGES = ["typescript", "javascript"] as const;
const VALID_APIS = ["rest", "graphql", "rpc"] as const;

function validateProjectName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new CLIValidationError("Project name is required.");
  }

  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new CLIValidationError(
      "Project name must not contain path separators or '..'.",
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new CLIValidationError(
      "Project name must contain only alphanumeric characters, hyphens, and underscores.",
    );
  }
}

/**
 * Returns whether the user typed a flag on the command line.
 *
 * All the shapes the parser accepts must be recognised here, otherwise an
 * explicitly supplied flag is silently dropped and the interactive prompt
 * offers its own default instead:
 *
 *   `--type backend`  `--type=backend`  `-t backend`  `-tbackend`  `-abt`
 */
/**
 * Narrows a raw CLI string to one of a fixed set of choices.
 *
 * The returned value is typed as the union, which is what lets the
 * non-interactive branch build ScaffoldOptions without `as any` casts. The
 * cast below is guarded by the membership test immediately above it.
 */
function validateChoice<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CLIValidationError(
      `Invalid ${label}: ${value}. Valid: ${allowed.join(", ")}`,
    );
  }
  return value as T;
}

function hasExplicitFlag(
  args: readonly string[],
  long: string,
  short?: string,
): boolean {
  const longName = long.startsWith("--") ? long.slice(2) : long;
  const shortName =
    short !== undefined && short.startsWith("-") ? short.slice(1) : short;

  for (const arg of args) {
    if (arg === "--") break;

    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const separator = body.indexOf("=");
      const name = separator >= 0 ? body.slice(0, separator) : body;
      // `--no-install` negates the boolean `install`; both count as explicit.
      if (name === longName || name === `no-${longName}`) return true;
      continue;
    }

    if (shortName === undefined) continue;

    if (arg.startsWith("-") && arg.length > 1) {
      // Every short flag `create` defines takes a value, so it can only be
      // the first character of the token: `-t backend` or `-tbackend`.
      // Matching anywhere would treat the "t" in `-fnuxt` as `--type`.
      if (arg[1] === shortName) return true;
    }
  }

  return false;
}

export async function runCreateCommand(context: CLIContext): Promise<void> {
  const projectName = context.values["project-name"] as string | undefined;
  const projectType = (context.values.type as string | undefined) ?? "backend";
  const architecture =
    (context.values.architecture as string | undefined) ?? "monolith";
  const packageManager =
    (context.values["package-manager"] as string | undefined) ?? "pnpm";
  const database =
    (context.values.database as string | undefined) ?? "postgresql";
  const api = (context.values.api as string | undefined) ?? "rest";
  const frontend = (context.values.frontend as string | undefined) ?? "none";
  const frontendArchitecture =
    (context.values["frontend-architecture"] as string | undefined) ??
    "zudojs-standard";
  const language =
    (context.values.language as string | undefined) ?? "typescript";
  const noInstall = context.values["no-install"] === true;
  const noGit = context.values["no-git"] === true;
  const servicesRaw = context.values.services as string | undefined;
  const servicesExplicit = hasExplicitFlag(context.args, "--services");
  const parsedServices = servicesRaw
    ? servicesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  // The --services option only applies to microservice architecture; ignore
  // its parser-applied default for other architectures.
  const services =
    servicesExplicit || architecture === "microservice" ? parsedServices : [];

  if (projectName) {
    validateProjectName(projectName);
  }

  const projectTypeValue = validateChoice(
    projectType,
    VALID_PROJECT_TYPES,
    "project type",
  );
  const architectureValue = validateChoice(
    architecture,
    VALID_ARCHITECTURES,
    "architecture",
  );
  const databaseValue = validateChoice(database, VALID_DATABASES, "database");
  const packageManagerValue = validateChoice(
    packageManager,
    VALID_PACKAGE_MANAGERS,
    "package manager",
  );
  const frontendValue = validateChoice(frontend, VALID_FRONTENDS, "frontend");
  const frontendArchitectureValue = validateChoice(
    frontendArchitecture,
    VALID_FRONTEND_ARCHITECTURES,
    "frontend architecture",
  );
  const languageValue = validateChoice(language, VALID_LANGUAGES, "language");
  const apiValue = validateChoice(api, VALID_APIS, "API style");

  for (const service of services) {
    if (!SERVICE_NAME_PATTERN.test(service)) {
      throw new CLIValidationError(
        `Invalid service name: "${service}". Service names must contain only alphanumeric characters, hyphens, and underscores.`,
      );
    }
  }

  const resolvedFrontend: (typeof VALID_FRONTENDS)[number] | undefined =
    projectTypeValue === "frontend" || projectTypeValue === "fullstack"
      ? frontendValue === "none"
        ? "react"
        : frontendValue
      : undefined;

  const explicitOverrides: Record<string, unknown> = {
    projectName,
  };

  if (hasExplicitFlag(context.args, "--type", "-t")) {
    explicitOverrides.projectType = projectType;
  }

  if (hasExplicitFlag(context.args, "--architecture", "-a")) {
    explicitOverrides.architecture = architecture;
  }

  if (hasExplicitFlag(context.args, "--package-manager", "-p")) {
    explicitOverrides.packageManager = packageManager;
  }

  if (hasExplicitFlag(context.args, "--database", "-d")) {
    explicitOverrides.database = database;
  }

  if (hasExplicitFlag(context.args, "--api")) {
    explicitOverrides.api = api;
  }

  if (hasExplicitFlag(context.args, "--frontend", "-f")) {
    explicitOverrides.frontend = resolvedFrontend;
  }

  if (hasExplicitFlag(context.args, "--frontend-architecture", "-F")) {
    explicitOverrides.frontendArchitecture = frontendArchitecture;
  }

  if (hasExplicitFlag(context.args, "--language", "-l")) {
    explicitOverrides.language = language;
  }

  const isInteractive = process.stdin.isTTY;

  let answers: ScaffoldOptions;

  if (isInteractive) {
    p.intro("Zudojs");

    const name = (await promptProjectName(projectName ?? undefined)) as string;
    const type = await promptProjectType(
      explicitOverrides.projectType as ScaffoldOptions["projectType"],
    );

    // `architecture` is a required ScaffoldOptions field and is written to
    // the project manifest. For a frontend-only project no prompt runs, so
    // without this default it was `undefined` and the generated manifest
    // came out with no architecture at all, breaking `zudojs dev` and
    // `zudojs generate` in the new project.
    const arch: ScaffoldOptions["architecture"] =
      type === "backend" || type === "fullstack"
        ? await promptBackendArchitecture(
            explicitOverrides.architecture as ScaffoldOptions["architecture"],
          )
        : ((explicitOverrides.architecture as
            | ScaffoldOptions["architecture"]
            | undefined) ?? architectureValue);

    const interactiveServices =
      arch === "microservice"
        ? await promptServices(servicesExplicit ? services : undefined)
        : services;

    const db =
      type === "backend" || type === "fullstack"
        ? await promptDatabase(
            explicitOverrides.database as ScaffoldOptions["database"],
          )
        : (explicitOverrides.database as ScaffoldOptions["database"]);

    const apiStyle =
      type === "backend" || type === "fullstack"
        ? await promptApiStyle(explicitOverrides.api as ScaffoldOptions["api"])
        : (explicitOverrides.api as ScaffoldOptions["api"]);

    const frontend =
      type === "frontend" || type === "fullstack"
        ? await promptFramework(
            type,
            explicitOverrides.frontend as
              FrontendFramework | "none" | undefined,
          )
        : (resolvedFrontend ?? "none");

    const frontendArch =
      type === "frontend" || type === "fullstack"
        ? await promptFrontendArchitecture(
            explicitOverrides.frontendArchitecture as ScaffoldOptions["frontendArchitecture"],
          )
        : (explicitOverrides.frontendArchitecture as ScaffoldOptions["frontendArchitecture"]);

    const pkgManager = await promptPackageManager(
      explicitOverrides.packageManager as ScaffoldOptions["packageManager"],
    );

    const capabilities = await promptCapabilities([]);
    const enableCQRS = capabilities.includes("cqrs");
    const enableMessaging = capabilities.includes("messaging");
    const enableObservability = capabilities.includes("observability");
    const enableOpenAPI = capabilities.includes("openapi");
    const enableDatabase = capabilities.includes("database");
    const enableQueue = capabilities.includes("queue");
    const enableDocker = arch === "microservice";

    const confirmed = await promptConfirmation(
      `Create project "${name}"?`,
      true,
    );

    if (!confirmed) {
      p.cancel("Project creation cancelled.");
      return;
    }

    answers = {
      projectName: name,
      projectType: type,
      architecture: arch,
      packageManager: pkgManager,
      database: db,
      api: apiStyle,
      frontend: frontend as ScaffoldOptions["frontend"],
      frontendArchitecture: frontendArch,
      frontendPath: "apps/web",
      language: (explicitOverrides.language ??
        "typescript") as ScaffoldOptions["language"],
      services: interactiveServices,
      enableCQRS,
      enableMessaging,
      enableObservability,
      enableOpenAPI,
      enableDatabase,
      enableQueue,
      enableDocker,
      installDeps: !noInstall,
      initGit: !noGit,
    };
  } else {
    answers = {
      projectName: projectName ?? "",
      projectType: projectTypeValue,
      architecture: architectureValue,
      packageManager: packageManagerValue,
      database: databaseValue,
      api: apiValue,
      ...(resolvedFrontend !== undefined
        ? { frontend: resolvedFrontend }
        : {}),
      frontendArchitecture: frontendArchitectureValue,
      frontendPath: "apps/web",
      language: languageValue,
      services,
      enableCQRS: true,
      enableMessaging: true,
      enableObservability: true,
      enableOpenAPI: true,
      enableDatabase: true,
      enableQueue: false,
      // Match the interactive branch, which enables Docker for microservices.
      enableDocker: architectureValue === "microservice",
      installDeps: !noInstall,
      initGit: !noGit,
    };
  }

  if (!answers.projectName) {
    throw new CLIValidationError("Project name is required.");
  }

  await createProject(answers, context);
}

async function createProject(
  options: ScaffoldOptions,
  context: CLIContext,
): Promise<void> {
  const { projectName, packageManager } = options;
  const targetPath = join(context.cwd, projectName);

  if (existsSync(targetPath)) {
    throw new CLIValidationError(
      `Directory "${projectName}" already exists in ${context.cwd}`,
    );
  }

  const rollback = new RollbackManager();
  rollback.trackDirectory(targetPath);

  const spinner = p.spinner();

  try {
    spinner.start("Creating project structure");
    await mkdir(targetPath, { recursive: true });
    spinner.stop("Project structure created");

    if (
      options.projectType === "fullstack" &&
      options.frontend &&
      options.frontend !== "none"
    ) {
      spinner.start("Generating fullstack project");
      await generateFullstackProject(options, targetPath, rollback);
      spinner.stop("Fullstack project generated");
    } else if (
      options.projectType === "frontend" &&
      options.frontend &&
      options.frontend !== "none"
    ) {
      spinner.start("Generating frontend project");
      await generateFrontendProject(options, targetPath);
      spinner.stop("Frontend project generated");
    } else {
      spinner.start("Generating backend project");
      const result = await generateProject(options, targetPath);
      spinner.stop(
        `Backend project generated (${result.filesCreated.length} files)`,
      );
    }

    await writeProjectManifest(options, targetPath);

    if (options.installDeps) {
      spinner.start("Installing dependencies");
      const installFile =
        packageManager === "pnpm"
          ? "pnpm"
          : packageManager === "yarn"
            ? "yarn"
            : packageManager === "bun"
              ? "bun"
              : "npm";

      try {
        // Streamed with no timeout: installs can be slow and their output
        // should reach the user.
        spinner.stop("Installing dependencies...");
        await runStreaming(installFile, ["install"], targetPath);
        p.log.success("Dependencies installed");
      } catch (error) {
        // The project is complete without its node_modules; say what
        // failed and how to retry instead of a bare "skipped".
        const reason = error instanceof Error ? error.message : String(error);
        p.log.warn(
          `Dependency installation failed: ${reason}\nRun "${installFile} install" inside ${projectName} to retry.`,
        );
      }
    }

    if (options.initGit) {
      spinner.start("Initializing git repository");
      try {
        await execCommand("git", ["init"], targetPath);
        spinner.stop("Git repository initialized");
      } catch {
        spinner.stop("Git initialization skipped");
      }
    }

    const devCmd =
      packageManager === "npm"
        ? "npm run dev"
        : packageManager === "yarn"
          ? "yarn dev"
          : packageManager === "bun"
            ? "bun run dev"
            : "pnpm run dev";

    p.note(`cd ${projectName}\n${devCmd}`, "Next steps");

    p.outro("Project created successfully.");
  } catch (error) {
    await rollback.rollback();
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(`Failed to create project: ${message}`);
    throw new CLIGenerationError(
      `Failed to create project "${projectName}"`,
      error,
    );
  }
}

/**
 * Writes the machine-managed .zudojs/manifest.json so follow-up commands
 * (`zudojs dev`, `generate`, `add`) recognize the project immediately.
 */
async function writeProjectManifest(
  options: ScaffoldOptions,
  targetPath: string,
): Promise<void> {
  const capabilities: string[] = [];
  if (options.enableCQRS) capabilities.push("cqrs");
  if (options.enableMessaging) capabilities.push("messaging");
  if (options.enableObservability) capabilities.push("observability");
  if (options.enableOpenAPI) capabilities.push("openapi");
  if (options.enableDatabase) capabilities.push("database");
  if (options.enableQueue) capabilities.push("queue");

  // Record the services actually generated, not the raw request: the
  // template drops reserved names (gateway) and duplicates, and substitutes
  // its own defaults for an empty list.
  const services =
    options.architecture === "microservice"
      ? resolveMicroserviceServices(options.services)
      : undefined;

  const hasFrontend =
    options.frontend !== undefined && options.frontend !== "none";
  const hasBackend = options.projectType !== "frontend";

  await new ManifestManager(targetPath).create({
    version: CLI_VERSION,
    projectType: options.projectType ?? "backend",
    architecture: options.architecture,
    ...(hasBackend
      ? {
          backend: {
            architecture: options.architecture,
            api: options.api ?? "rest",
          },
        }
      : {}),
    ...(hasFrontend
      ? {
          frontend: {
            framework: options.frontend as string,
            architecture: options.frontendArchitecture ?? "zudojs-standard",
          },
        }
      : {}),
    ...(options.database ? { database: { provider: options.database } } : {}),
    workspace: { packageManager: options.packageManager },
    capabilities,
    ...(services ? { services: [...services] } : {}),
  });
}

async function generateFullstackProject(
  options: ScaffoldOptions,
  projectPath: string,
  rollback: RollbackManager,
): Promise<void> {
  const composer = new FullstackComposer();

  const result = await composer.generate({
    project: {
      name: options.projectName,
      type: "fullstack",
      backend: {
        architecture: options.architecture,
        api: options.api ?? "rest",
        database: options.database,
      },
      frontend:
        options.frontend && options.frontend !== "none"
          ? {
              framework: options.frontend,
              architecture: options.frontendArchitecture ?? "zudojs-standard",
              language: options.language ?? "typescript",
            }
          : undefined,
      workspace: {
        packageManager: options.packageManager,
      },
      features: options.services,
    },
    projectPath,
    installDeps: options.installDeps,
  });

  if (!result.success) {
    throw new CLIGenerationError(
      `Fullstack generation failed:\n${result.errors.join("\n")}`,
    );
  }

  // Uses the same BackendGenerator the generator registry exposes rather
  // than a third private copy of the architecture switch.
  const backendFiles = await new BackendGenerator().generate(
    options,
    join(projectPath, "apps/api"),
  );

  // The backend template may carry its own workspace definition; nested in
  // apps/api it would create a second workspace root, so strip it.
  delete backendFiles["pnpm-workspace.yaml"];

  await writeFileTree(join(projectPath, "apps/api"), backendFiles);
  rollback.trackDirectory(join(projectPath, "apps/api"));

  const integrationGenerator = new IntegrationGenerator();
  await integrationGenerator.generate({
    project: {
      name: options.projectName,
      type: "fullstack",
      backend: {
        architecture: options.architecture,
        api: options.api ?? "rest",
        database: options.database,
      },
      frontend:
        options.frontend && options.frontend !== "none"
          ? {
              framework: options.frontend,
              architecture: options.frontendArchitecture ?? "zudojs-standard",
              language: options.language ?? "typescript",
            }
          : undefined,
      workspace: {
        packageManager: options.packageManager,
      },
      features: options.services,
    } as ProjectConfiguration,
    projectPath,
    backendPort: 3000,
    frontendPort: options.frontend === "next" ? 3000 : 5173,
  });

  const infrastructureGenerator = new InfrastructureGenerator();
  await infrastructureGenerator.generate(
    {
      projectName: options.projectName,
      architecture: options.architecture,
      database: options.database ?? "postgresql",
      packageManager: options.packageManager,
      services: options.services,
    },
    projectPath,
  );
}

async function generateFrontendProject(
  options: ScaffoldOptions,
  projectPath: string,
): Promise<void> {
  const generator = new FrontendGenerator();

  const result = await generator.generate({
    project: {
      name: options.projectName,
      type: "frontend",
      frontend:
        options.frontend && options.frontend !== "none"
          ? {
              framework: options.frontend,
              architecture: options.frontendArchitecture ?? "zudojs-standard",
              language: options.language ?? "typescript",
            }
          : undefined,
      workspace: {
        packageManager: options.packageManager,
      },
    },
    projectPath,
    framework: options.frontend ?? "react",
    architecture: options.frontendArchitecture ?? "zudojs-standard",
    language: options.language ?? "typescript",
    packageManager: options.packageManager,
    installDeps: options.installDeps,
  });

  if (!result.success) {
    throw new CLIGenerationError(
      `Frontend generation failed:\n${result.errors.join("\n")}`,
    );
  }
}
