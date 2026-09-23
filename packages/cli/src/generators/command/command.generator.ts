/**
 * zudojs-cli — Command Generator
 *
 * Generates a CQRS command, its handler and a barrel under
 * `<basePath>[/<service>]/commands/<name>/`.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { assertGeneratableName } from "../../utils/utils.name.js";
import {
  cqrsSchematicNames,
  renderCommandBarrel,
  renderCommandFile,
  renderCommandHandlerFile,
} from "./command.template.js";

/** Options for {@link generateCommand}. */
export interface GenerateCommandOptions {
  readonly name: string;
  readonly service?: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

/**
 * Writes `<name>.command.ts`, `<name>.handler.ts` and `index.ts`, and
 * returns their paths (only the paths on a dry run).
 */
export async function generateCommand(
  options: GenerateCommandOptions,
  cwd: string,
): Promise<string[]> {
  const names = cqrsSchematicNames(assertGeneratableName(options.name, "command name"));
  const basePath = options.basePath ?? "services";
  // Without a service group the schematic goes directly under basePath:
  // callers that resolved the owning app into basePath (the microservice
  // layout) pass no service, so the path is not nested twice.
  const servicePath = options.service ? `${basePath}/${options.service}` : basePath;
  const dir = `${servicePath}/commands/${names.slug}`;

  const files: Record<string, string> = {
    [`${dir}/${names.slug}.command.ts`]: renderCommandFile(names),
    [`${dir}/${names.slug}.handler.ts`]: renderCommandHandlerFile(names),
    [`${dir}/index.ts`]: renderCommandBarrel(names),
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to generate command: ${names.slug} in ${servicePath}`,
      error,
    );
  }
}
