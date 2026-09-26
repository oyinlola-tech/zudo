/**
 * zudojs-cli — A resource's controller.
 */

import type { ResourceNames } from "../../resource.names.js";

/**
 * `controllers/<slug>.controller.ts`: validates input with the DTO schemas
 * and maps service results to responses. Handlers are arrow properties so
 * they can be passed to the router unbound.
 */
export function renderResourceController(
  n: ResourceNames,
  appSrcFromControllers: string,
): string {
  const schemas = `Create${n.entity}Schema, List${n.pascal}QuerySchema, ${n.entity}ParamsSchema, Update${n.entity}Schema`;
  return `import type { HttpResponseContext, HttpRouterContext } from "@zudojs/http";

import { ${schemas} } from "../dtos/${n.slug}.dto.js";
import type { ${n.pascal}Service } from "../services/${n.slug}.service.js";
import { empty, json, readJsonBody, validationFailed } from "${appSrcFromControllers}/utils/http.js";

/** HTTP handlers for ${n.routePath}. */
export class ${n.pascal}Controller {
  public constructor(private readonly service: ${n.pascal}Service) {}

  public readonly list = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const query = List${n.pascal}QuerySchema.safeParse(ctx.query);
    if (!query.success) return validationFailed(query.issues);
    return json(200, await this.service.list(query.data));
  };

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
