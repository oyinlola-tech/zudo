/**
 * zudojs-cli — Command Generator
 *
 * Generates a CQRS command with handler.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { normalizeName } from "../../utils/utils.name.js";

export interface GenerateCommandOptions {
  readonly name: string;
  readonly service?: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

export async function generateCommand(
  options: GenerateCommandOptions,
  cwd: string,
): Promise<string[]> {
  const name = normalizeName(options.name);
  const nameCamel = name
    .replace(/-([a-z])/g, (_m: string, c: string) => c.toUpperCase())
    .replace(/^./, (c: string) => c.toUpperCase());
  const service = options.service;
  const basePath = options.basePath ?? "services";
  // When no service grouping is given the schematic is written directly under
  // basePath. Callers that resolved the owning app into basePath (the
  // microservice layout) pass no service, so the path is not nested twice.
  const servicePath = service ? `${basePath}/${service}` : basePath;

  const files: Record<string, string> = {
    [`${servicePath}/commands/${name}/${name}.command.ts`]: `import type { BaseCommand } from "@zudojs/cqrs";

export interface ${nameCamel}CommandPayload {
  readonly [key: string]: unknown;
}

export class ${nameCamel}Command implements BaseCommand<${nameCamel}CommandPayload> {
  readonly commandName = "${name}";

  constructor(public readonly payload: ${nameCamel}CommandPayload) {}
}
`,

    [`${servicePath}/commands/${name}/${name}.handler.ts`]: `import type { CommandHandler, CommandResult } from "@zudojs/cqrs";
import { createLogger } from "@zudojs/logger";
import { ${nameCamel}Command } from "./${name}.command.js";

export class ${nameCamel}CommandHandler implements CommandHandler<${nameCamel}Command> {
  private readonly logger = createLogger({ name: "${name}-handler" });

  async handle(command: ${nameCamel}Command): Promise<CommandResult> {
    this.logger.info("Processing ${name} command", { payload: command.payload });

    return {
      success: true,
      data: { id: crypto.randomUUID(), ...command.payload },
    };
  }
}
`,

    [`${servicePath}/commands/${name}/index.ts`]: `export { ${nameCamel}Command } from "./${name}.command.js";
export { ${nameCamel}CommandHandler } from "./${name}.handler.js";
`,
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to generate command: ${name} in ${servicePath}`,
      error,
    );
  }
}
