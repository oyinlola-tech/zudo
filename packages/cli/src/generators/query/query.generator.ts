/**
 * zudojs-cli — Query Generator
 *
 * Generates a CQRS query, its handler and a barrel under
 * `<basePath>[/<service>]/queries/<name>/`.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { assertGeneratableName } from "../../utils/utils.name.js";
import { cqrsSchematicNames } from "../command/command.template.js";
import {
  renderQueryBarrel,
  renderQueryFile,
  renderQueryHandlerFile,
} from "./query.template.js";

/** Options for {@link generateQuery}. */
export interface GenerateQueryOptions {
  readonly name: string;
  readonly service?: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

/**
 * Writes `<name>.query.ts`, `<name>.handler.ts` and `index.ts`, and returns
 * their paths (only the paths on a dry run).
 */
export async function generateQuery(
  options: GenerateQueryOptions,
  cwd: string,
): Promise<string[]> {
  const names = cqrsSchematicNames(assertGeneratableName(options.name, "query name"));
  const basePath = options.basePath ?? "services";
  // Without a service group the schematic goes directly under basePath:
  // callers that resolved the owning app into basePath (the microservice
  // layout) pass no service, so the path is not nested twice.
  const servicePath = options.service ? `${basePath}/${options.service}` : basePath;
  const dir = `${servicePath}/queries/${names.slug}`;

  const files: Record<string, string> = {
    [`${dir}/${names.slug}.query.ts`]: renderQueryFile(names),
    [`${dir}/${names.slug}.handler.ts`]: renderQueryHandlerFile(names),
    [`${dir}/index.ts`]: renderQueryBarrel(names),
  };

  if (options.dryRun) {
    return Object.keys(files);
  }

  try {
    await writeFileTree(cwd, files);
    return Object.keys(files);
  } catch (error) {
    throw new CLIGenerationError(
      `Failed to generate query: ${names.slug} in ${servicePath}`,
      error,
    );
  }
}
