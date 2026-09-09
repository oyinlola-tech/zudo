/**
 * zudojs-cli — Query Generator
 *
 * Generates a CQRS query with handler.
 */

import { writeFileTree } from "../../utils/utils.fileSystem.js";
import { CLIGenerationError } from "../../errors/index.js";
import { normalizeName } from "../../utils/utils.name.js";

export interface GenerateQueryOptions {
  readonly name: string;
  readonly service?: string;
  readonly basePath?: string;
  readonly dryRun?: boolean;
}

export async function generateQuery(
  options: GenerateQueryOptions,
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
    [`${servicePath}/queries/${name}/${name}.query.ts`]: `import type { BaseQuery } from "@zudojs/cqrs";

export interface ${nameCamel}QueryPayload {
  readonly [key: string]: unknown;
}

export class ${nameCamel}Query implements BaseQuery<${nameCamel}QueryPayload> {
  readonly queryName = "${name}";

  constructor(public readonly payload: ${nameCamel}QueryPayload) {}
}
`,

    [`${servicePath}/queries/${name}/${name}.handler.ts`]: `import type { QueryHandler, QueryResult } from "@zudojs/cqrs";
import { createLogger } from "@zudojs/logger";
import { ${nameCamel}Query } from "./${name}.query.js";

export class ${nameCamel}QueryHandler implements QueryHandler<${nameCamel}Query> {
  private readonly logger = createLogger({ name: "${name}-handler" });

  async handle(query: ${nameCamel}Query): Promise<QueryResult> {
    this.logger.info("Processing ${name} query", { payload: query.payload });

    return {
      success: true,
      data: { items: [], total: 0 },
    };
  }
}
`,

    [`${servicePath}/queries/${name}/index.ts`]: `export { ${nameCamel}Query } from "./${name}.query.js";
export { ${nameCamel}QueryHandler } from "./${name}.handler.js";
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
      `Failed to generate query: ${name} in ${servicePath}`,
      error,
    );
  }
}
