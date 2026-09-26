/**
 * zudojs-cli — A resource's DTO schemas: record, create/update bodies, path
 * parameters, and the list query and page shape.
 *
 * List endpoints paginate with a cursor: `?limit=` (1–MAX_PAGE_SIZE,
 * default DEFAULT_PAGE_SIZE) and `?cursor=<id of the last item seen>`. A
 * page answers `{ items, nextCursor }`, `nextCursor` being `null` on the
 * last page. They used to return every record at once — up to 10,000 from
 * the in-memory store.
 */

import { withArticle, type ResourceNames } from "../resource.names.js";

/** `dtos/<slug>.dto.ts`: @zudojs/schema schemas and their inferred types. */
export function renderResourceDto(n: ResourceNames): string {
  return `import { schema, type Infer } from "@zudojs/schema";

/** ${withArticle(n.label, true)} as the API returns it. */
export const ${n.entity}Schema = schema.object({
  id: schema.string().uuid(),
  name: schema.string(),
  createdAt: schema.string(),
  updatedAt: schema.string(),
});

/** Body of \`POST ${n.routePath}\`. Unknown fields are dropped. */
export const Create${n.entity}Schema = schema.object({
  name: schema.string().min(1).max(200),
});

/** Body of \`PATCH ${n.routePath}/:id\`. Every field is optional. */
export const Update${n.entity}Schema = schema.object({
  name: schema.string().min(1).max(200).optional(),
});

/** Path parameters of the \`${n.routePath}/:id\` routes. */
export const ${n.entity}ParamsSchema = schema.object({
  id: schema.string().uuid(),
});

/** Page size when \`limit\` is not given, and the most a client may ask for. */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Query of \`GET ${n.routePath}\`: page size and the id to continue after. */
export const List${n.pascal}QuerySchema = schema.object({
  limit: schema.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: schema.string().uuid().optional(),
});

/** One page of ${n.label} records; \`nextCursor\` is null on the last page. */
export const ${n.entity}PageSchema = schema.object({
  items: schema.array(${n.entity}Schema),
  nextCursor: schema.nullable(schema.string().uuid()),
});

/** What a repository is asked for: a page size and where to continue. */
export interface ${n.entity}PageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

export type ${n.entity} = Infer<typeof ${n.entity}Schema>;
export type Create${n.entity}Input = Infer<typeof Create${n.entity}Schema>;
export type Update${n.entity}Input = Infer<typeof Update${n.entity}Schema>;
export type List${n.pascal}Query = Infer<typeof List${n.pascal}QuerySchema>;
export type ${n.entity}Page = Infer<typeof ${n.entity}PageSchema>;
`;
}
