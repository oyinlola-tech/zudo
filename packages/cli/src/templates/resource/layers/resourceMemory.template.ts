/**
 * zudojs-cli — A resource's repository contract and in-memory store.
 */

import type { ResourceNames } from "../resource.names.js";

/** `repositories/<slug>.repository.ts`: the contract and a memory store. */
export function renderResourceRepository(n: ResourceNames): string {
  const types = `Create${n.entity}Input, ${n.entity}, ${n.entity}Page, ${n.entity}PageRequest, Update${n.entity}Input`;
  return `import { randomUUID } from "node:crypto";

import { ConflictError } from "@zudojs/errors";

import type { ${types} } from "../dtos/${n.slug}.dto.js";

/** Storage contract for ${n.label} records; the service depends on this only. */
export interface ${n.pascal}Repository {
  /** One page in creation order, continuing after \`cursor\` when given. */
  list(page: ${n.entity}PageRequest): Promise<${n.entity}Page>;
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

  public async list(page: ${n.entity}PageRequest): Promise<${n.entity}Page> {
    // A Map iterates in insertion order, which is creation order here.
    const all = [...this.records.values()];
    let start = 0;
    if (page.cursor !== undefined) {
      const at = all.findIndex((record) => record.id === page.cursor);
      if (at === -1) return { items: [], nextCursor: null };
      start = at + 1;
    }
    const items = all.slice(start, start + page.limit);
    const last = items.at(-1);
    const nextCursor = last !== undefined && start + page.limit < all.length ? last.id : null;
    return { items, nextCursor };
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
