import { mkdir } from "node:fs/promises";
import type { ScaffoldOptions } from "../../types/index.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLI_VERSION } from "../../constants/index.js";
import { generateMonolithFiles } from "../../templates/monolith/index.js";
import { generateModularMonolithFiles } from "../../templates/modular-monolith/index.js";
import { generateMicroserviceFiles } from "../../templates/microservice/index.js";
import { CLIGenerationError } from "../../errors/index.js";

export interface GenerateProjectResult {
  readonly projectPath: string;
  readonly filesCreated: readonly string[];
}

export async function generateProject(
  options: ScaffoldOptions,
  basePath = ".",
): Promise<GenerateProjectResult> {
  let templateFiles: Record<string, string>;

  switch (options.architecture) {
    case "monolith":
      templateFiles = generateMonolithFiles(options);
      break;
    case "modular-monolith":
      templateFiles = generateModularMonolithFiles(options);
      break;
    case "microservice":
      templateFiles = generateMicroserviceFiles(options);
      break;
    default:
      throw new CLIGenerationError(
        `Unknown architecture: ${options.architecture}`,
      );
  }

  const projectPath = basePath;

  try {
    await mkdir(projectPath, { recursive: true });
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to create project directory: ${projectPath}`,
      error,
    );
  }

  try {
    await writeFileTree(projectPath, templateFiles);
  } catch (error) {
    // This message is what the user sees at the moment the CLI rolls back and
    // deletes the directory it created, so it has to say why. It used to end
    // in a colon with the cause never rendered.
    const reason = error instanceof Error ? error.message : String(error);

    throw new CLIGenerationError(
      `Failed to write project files into ${projectPath}: ${reason}`,
      error,
    );
  }

  const filesCreated = Object.keys(templateFiles);

  // Note: git initialization and dependency installation are orchestrated by
  // the create command — this generator only writes project files.

  return {
    projectPath,
    filesCreated,
  };
}

export function getZudojsVersion(): string {
  return CLI_VERSION;
}
