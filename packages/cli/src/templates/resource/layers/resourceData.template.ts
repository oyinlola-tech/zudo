/**
 * zudojs-cli — A resource's DTO schemas and in-memory repository.
 */

import type { ResourceNames } from "../resource.names.js";

/** `dtos/<slug>.dto.ts`: @zudojs/schema schemas and their inferred types. */
export function renderResourceDto(n: ResourceNames): string {
  return `import { schema, type Infer } from "@zudojs/schema";

/** A ${n.label} as the API returns it. */
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

export type ${n.entity} = Infer<typeof ${n.entity}Schema>;
export type Create${n.entity}Input = Infer<typeof Create${n.entity}Schema>;
export type Update${n.entity}Input = Infer<typeof Update${n.entity}Schema>;
`;
}

/** `repositories/<slug>.repository.ts`: the contract and a memory store. */
export function renderResourceRepository(n: ResourceNames): string {
  const types = `Create${n.entity}Input, ${n.entity}, Update${n.entity}Input`;
  return `import { randomUUID } from "node:crypto";

import { ConflictError } from "@zudojs/errors";

import type { ${types} } from "../dtos/${n.slug}.dto.js";

/** Storage contract for ${n.label} records; the service depends on this only. */
export interface ${n.pascal}Repository {
  findAll(): Promise<readonly ${n.entity}[]>;
  findById(id: string): Promise<${n.entity} | undefined>;
  create(input: Create${n.entity}Input): Promise<${n.entity}>;
  update(id: string, input: Update${n.entity}Input): Promise<${n.entity} | undefined>;
  delete(id: string): Promise<boolean>;
}

/** Most records the in-memory store keeps, so it cannot exhaust memory. */
const MAX_RECORDS = 10_000;

/**
 * Keeps ${n.label} records in process memory: for development and tests.
 * Data is lost on restart. Swap the implementation in container.ts.
 */
export class InMemory${n.pascal}Repository implements ${n.pascal}Repository {
  private readonly records = new Map<string, ${n.entity}>();

  public async findAll(): Promise<readonly ${n.entity}[]> {
    return [...this.records.values()];
  }

  public async findById(id: string): Promise<${n.entity} | undefined> {
    return this.records.get(id);
  }

  public async create(input: Create${n.entity}Input): Promise<${n.entity}> {
    if (this.records.size >= MAX_RECORDS) {
      throw new ConflictError("The in-memory ${n.label} store is full.");
    }
    const now = new Date().toISOString();
    const record: ${n.entity} = {
      id: randomUUID(),
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  public async update(
    id: string,
    input: Update${n.entity}Input,
  ): Promise<${n.entity} | undefined> {
    const existing = this.records.get(id);
    if (existing === undefined) return undefined;
    const updated: ${n.entity} = {
      ...existing,
      name: input.name ?? existing.name,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}
`;
}
