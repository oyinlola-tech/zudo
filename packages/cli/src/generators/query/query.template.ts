/**
 * zudojs-cli — Query schematic templates, written against the
 * @zudojs/cqrs API: a `QueryOf` type built with `createQuery`, and a
 * `QueryHandler` subclass (`queryType` + `execute`) registered on a
 * `QueryBus`.
 */

import type { CqrsSchematicNames } from "../command/command.template.js";

/** `<slug>.query.ts`: the discriminator, payload, query type and factory. */
export function renderQueryFile(n: CqrsSchematicNames): string {
  const id = `${n.constant}_QUERY`;
  return `import { createQuery, type QueryOf } from "@zudojs/cqrs";

/** Discriminator the query bus routes ${n.pascal} queries on. */
export const ${id} = "${n.pascal}";

/** Criteria a ${n.pascal} query carries. Replace it with the fields the read needs. */
export type ${n.pascal}QueryPayload = {
  readonly filter: Readonly<Record<string, unknown>>;
};

/** The ${n.pascal} query: \`{ type: "${n.pascal}", filter }\`. */
export type ${n.pascal}Query = QueryOf<typeof ${id}, ${n.pascal}QueryPayload>;

/** Creates an immutable ${n.pascal} query. */
export function create${n.pascal}Query(payload: ${n.pascal}QueryPayload): ${n.pascal}Query {
  return createQuery(${id}, payload);
}
`;
}

/** `<slug>.handler.ts`: the handler class and its bus registration. */
export function renderQueryHandlerFile(n: CqrsSchematicNames): string {
  const id = `${n.constant}_QUERY`;
  return `import { QueryHandler, type QueryBus } from "@zudojs/cqrs";

import { ${id}, type ${n.pascal}Query } from "./${n.slug}.query.js";

/** What executing a ${n.pascal} query returns. */
export interface ${n.pascal}QueryResult {
  readonly filter: Readonly<Record<string, unknown>>;
  readonly items: readonly unknown[];
  readonly total: number;
}

/** Handles ${n.pascal} queries: put the read-side logic in \`execute\`. */
export class ${n.pascal}QueryHandler extends QueryHandler<${n.pascal}Query, ${n.pascal}QueryResult> {
  public override readonly queryType = ${id};

  public override async execute(query: ${n.pascal}Query): Promise<${n.pascal}QueryResult> {
    return { filter: query.filter, items: [], total: 0 };
  }
}

/**
 * Registers {@link ${n.pascal}QueryHandler} on a query bus.
 *
 * @example
 * const bus = register${n.pascal}Query(createQueryBus());
 * const result = await bus.execute<${n.pascal}Query, ${n.pascal}QueryResult>(
 *   create${n.pascal}Query({ filter: {} }),
 * );
 */
export function register${n.pascal}Query(bus: QueryBus): QueryBus {
  return bus.register(${id}, new ${n.pascal}QueryHandler());
}
`;
}

/** `index.ts`: the query folder's barrel. */
export function renderQueryBarrel(n: CqrsSchematicNames): string {
  return `export * from "./${n.slug}.query.js";
export * from "./${n.slug}.handler.js";
`;
}
