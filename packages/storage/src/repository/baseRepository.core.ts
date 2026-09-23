/**
 * @zudojs/storage — Base Repository
 *
 * Provides a base implementation for repository CRUD operations.
 * Concrete repositories can extend this for domain-specific queries.
 */

import { NotFoundError } from "@zudojs/errors";
import type {
  Database,
  QueryParameter,
  Repository,
} from "../types/storage.type.js";
import { providedKeys } from "./baseRepository.columns.js";
import type { FindAllOptions, TableRef } from "./baseRepository.query.js";
import {
  buildCount,
  buildCreate,
  buildDelete,
  buildExists,
  buildFindAll,
  buildFindById,
  buildFindByIds,
  buildUpdate,
  createTableRef,
} from "./baseRepository.query.js";

/**
 * Options for the base repository.
 */
export interface BaseRepositoryOptions {
  /** The database table name. Must be a plain SQL identifier. */
  readonly tableName: string;
  /** The primary key column name (default: "id"). */
  readonly primaryKey?: string;
  /**
   * Optional allowlist of writable, filterable and sortable columns.
   *
   * When supplied, any column name reaching `create`, `update`, `count` or
   * `findAll`'s `orderBy` must be a member, unless the specific list below
   * for that use is supplied. Strongly recommended for repositories whose
   * inputs derive from request data.
   */
  readonly columns?: readonly string[];
  /** Columns `create` and `update` may write. Defaults to `columns`. */
  readonly writableColumns?: readonly string[];
  /** Columns `count` may filter on. Defaults to `columns`. */
  readonly filterableColumns?: readonly string[];
  /** Columns `findAll` may sort by (`orderBy`). Defaults to `columns`. */
  readonly sortableColumns?: readonly string[];
}

/**
 * Base repository providing common CRUD operations.
 * Override methods for domain-specific behavior.
 */
export class BaseRepository<
  Entity extends Record<string, unknown>,
  ID = string,
> implements Repository<Entity, ID>
{
  protected readonly table: TableRef;

  constructor(
    protected readonly database: Database,
    options: BaseRepositoryOptions,
  ) {
    this.table = createTableRef(
      options.tableName,
      options.primaryKey ?? "id",
      options.columns,
      {
        ...(options.writableColumns ? { writableColumns: options.writableColumns } : {}),
        ...(options.filterableColumns ? { filterableColumns: options.filterableColumns } : {}),
        ...(options.sortableColumns ? { sortableColumns: options.sortableColumns } : {}),
      },
    );
  }

  /** The database table name. */
  protected get tableName(): string {
    return this.table.tableName;
  }

  /** The primary key column name. */
  protected get primaryKey(): string {
    return this.table.primaryKey;
  }

  /**
   * Find an entity by its primary key.
   */
  async findById(id: ID): Promise<Entity | null> {
    const result = await this.database.query<Entity>(
      buildFindById(this.table, id as QueryParameter),
    );
    return result.rows[0] ?? null;
  }

  /**
   * Find multiple entities by their IDs.
   */
  async findByIds(ids: readonly ID[]): Promise<readonly Entity[]> {
    if (ids.length === 0) return [];

    const result = await this.database.query<Entity>(
      buildFindByIds(this.table, ids as readonly QueryParameter[]),
    );
    return result.rows;
  }

  /**
   * Create a new entity.
   *
   * Properties set to `undefined` are treated as not provided and omitted
   * from the INSERT; `null` inserts `NULL`.
   */
  async create(entity: Entity): Promise<Entity> {
    const result = await this.database.query<Entity>(
      buildCreate(this.table, entity),
    );
    return result.rows[0]!;
  }

  /**
   * Update an entity by primary key.
   *
   * Properties set to `undefined` are treated as not provided: they are
   * left out of the UPDATE, so a partial DTO cannot wipe columns it did
   * not send. Only an explicit `null` writes `NULL`. When nothing is
   * provided the current row is returned unchanged.
   */
  async update(id: ID, changes: Partial<Entity>): Promise<Entity> {
    if (providedKeys(changes).length === 0) {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError(`Entity not found: ${String(id)}`, {
          code: "STORAGE_ENTITY_NOT_FOUND",
          statusCode: 404,
        });
      }
      return existing;
    }

    const result = await this.database.query<Entity>(
      buildUpdate(this.table, id as QueryParameter, changes),
    );
    const updated = result.rows[0];
    if (updated === undefined) {
      // `RETURNING *` yields no row when nothing matched. The declared
      // return type is `Entity`; resolving `undefined` here while the
      // zero-change path throws made "missing" depend on the payload.
      throw new NotFoundError(`Entity not found: ${String(id)}`, {
        code: "STORAGE_ENTITY_NOT_FOUND",
        statusCode: 404,
      });
    }
    return updated;
  }

  /**
   * Delete an entity by primary key.
   */
  async delete(id: ID): Promise<void> {
    await this.database.execute(buildDelete(this.table, id as QueryParameter));
  }

  /**
   * Check if an entity exists by primary key.
   */
  async exists(id: ID): Promise<boolean> {
    const result = await this.database.query(
      buildExists(this.table, id as QueryParameter),
    );
    return result.rowCount > 0;
  }

  /**
   * Find all entities with optional limit, offset and sort column.
   */
  async findAll(options?: FindAllOptions): Promise<readonly Entity[]> {
    const result = await this.database.query<Entity>(
      buildFindAll(this.table, options),
    );
    return result.rows;
  }

  /**
   * Count entities matching optional where conditions.
   */
  async count(where?: Record<string, QueryParameter>): Promise<number> {
    const result = await this.database.query<{ count: string | number }>(
      buildCount(this.table, where),
    );
    const raw = result.rows[0]?.count ?? 0;
    return typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  }
}
