/**
 * zudojs-cli — A resource's service.
 */

import type { ResourceNames } from "../resource.names.js";

/** `services/<slug>.service.ts`: CRUD with NotFoundError for missing ids. */
export function renderResourceService(n: ResourceNames): string {
  const types = `Create${n.entity}Input, ${n.entity}, ${n.entity}Page, List${n.pascal}Query, Update${n.entity}Input`;
  return `import { NotFoundError } from "@zudojs/errors";

import { DEFAULT_PAGE_SIZE } from "../dtos/${n.slug}.dto.js";
import type { ${types} } from "../dtos/${n.slug}.dto.js";
import type { ${n.pascal}Repository } from "../repositories/${n.slug}.repository.js";

/** ${n.entity} use cases. Throws NotFoundError (404) for an unknown id. */
export class ${n.pascal}Service {
  public constructor(private readonly repository: ${n.pascal}Repository) {}

  /** One page of ${n.label} records (\`limit\` defaults to DEFAULT_PAGE_SIZE). */
  public list(query: List${n.pascal}Query): Promise<${n.entity}Page> {
    return this.repository.list({
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  }

  public async get(id: string): Promise<${n.entity}> {
    const record = await this.repository.findById(id);
    if (record === undefined) throw notFound(id);
    return record;
  }

  public create(input: Create${n.entity}Input): Promise<${n.entity}> {
    return this.repository.create(input);
  }

  public async update(id: string, input: Update${n.entity}Input): Promise<${n.entity}> {
    const record = await this.repository.update(id, input);
    if (record === undefined) throw notFound(id);
    return record;
  }

  public async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw notFound(id);
  }
}

function notFound(id: string): NotFoundError {
  return new NotFoundError(\`${n.entity} "\${id}" was not found.\`);
}
`;
}
