/**
 * zudojs-cli — A resource's service and controller.
 */

import type { ResourceNames } from "../resource.names.js";

/** `services/<slug>.service.ts`: CRUD with NotFoundError for missing ids. */
export function renderResourceService(n: ResourceNames): string {
  const types = `Create${n.entity}Input, ${n.entity}, Update${n.entity}Input`;
  return `import { NotFoundError } from "@zudojs/errors";

import type { ${types} } from "../dtos/${n.slug}.dto.js";
import type { ${n.pascal}Repository } from "../repositories/${n.slug}.repository.js";

/** ${n.entity} use cases. Throws NotFoundError (404) for an unknown id. */
export class ${n.pascal}Service {
  public constructor(private readonly repository: ${n.pascal}Repository) {}

  public list(): Promise<readonly ${n.entity}[]> {
    return this.repository.findAll();
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

/**
 * `controllers/<slug>.controller.ts`: validates input with the DTO schemas
 * and maps service results to responses. Handlers are arrow properties so
 * they can be passed to the router unbound.
 */
export function renderResourceController(
  n: ResourceNames,
  appSrcFromControllers: string,
): string {
  const schemas = `Create${n.entity}Schema, ${n.entity}ParamsSchema, Update${n.entity}Schema`;
  return `import type { HttpResponseContext, HttpRouterContext } from "@zudojs/http";

import { ${schemas} } from "../dtos/${n.slug}.dto.js";
import type { ${n.pascal}Service } from "../services/${n.slug}.service.js";
import { empty, json, readJsonBody, validationFailed } from "${appSrcFromControllers}/utils/http.js";

/** HTTP handlers for ${n.routePath}. */
export class ${n.pascal}Controller {
  public constructor(private readonly service: ${n.pascal}Service) {}

  public readonly list = async (): Promise<HttpResponseContext> =>
    json(200, await this.service.list());

  public readonly get = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const params = ${n.entity}ParamsSchema.safeParse(ctx.params);
    if (!params.success) return validationFailed(params.issues);
    return json(200, await this.service.get(params.data.id));
  };

  public readonly create = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const body = Create${n.entity}Schema.safeParse(readJsonBody(ctx));
    if (!body.success) return validationFailed(body.issues);
    return json(201, await this.service.create(body.data));
  };

  public readonly update = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const params = ${n.entity}ParamsSchema.safeParse(ctx.params);
    if (!params.success) return validationFailed(params.issues);
    const body = Update${n.entity}Schema.safeParse(readJsonBody(ctx));
    if (!body.success) return validationFailed(body.issues);
    return json(200, await this.service.update(params.data.id, body.data));
  };

  public readonly remove = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const params = ${n.entity}ParamsSchema.safeParse(ctx.params);
    if (!params.success) return validationFailed(params.issues);
    await this.service.remove(params.data.id);
    return empty(204);
  };
}
`;
}
