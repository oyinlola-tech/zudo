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
import { mapRepositoryError } from "./baseRepository.errors.js";
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
 *
 * Driver failures raised by the `Database` are normalised through
 * `mapRepositoryError` (see `baseRepository.errors.ts`): constraint
 * violations become exposable 409 `StorageError`s, bad values 400s, and
 * the raw driver error is kept as `cause`. Run custom queries in
 * subclasses through {@link BaseRepository.execute} to get the same.
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
   * Runs a database call, normalising any driver failure into a
   * `StorageError` tagged with the table and operation name. Build the
   * query first: builder validation errors are programming errors and are
   * not driver failures.
   */
  protected async execute<T>(operation: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      throw mapRepositoryError(error, { table: this.table.tableName, operation });
    }
  }

  /**
   * Find an entity by its primary key.
   */
  async findById(id: ID): Promise<Entity | null> {
    const query = buildFindById(this.table, id as QueryParameter);
    const result = await this.execute("findById", () =>
      this.database.query<Entity>(query),
    );
    return result.rows[0] ?? null;
  }

  /**
   * Find multiple entities by their IDs.
   */
  async findByIds(ids: readonly ID[]): Promise<readonly Entity[]> {
    if (ids.length === 0) return [];

    const query = buildFindByIds(this.table, ids as readonly QueryParameter[]);
    const result = await this.execute("findByIds", () =>
      this.database.query<Entity>(query),
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
    const query = buildCreate(this.table, entity);
    const result = await this.execute("create", () =>
      this.database.query<Entity>(query),
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

    const query = buildUpdate(this.table, id as QueryParameter, changes);
    const result = await this.execute("update", () =>
      this.database.query<Entity>(query),
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
    const query = buildDelete(this.table, id as QueryParameter);
    await this.execute("delete", () => this.database.execute(query));
  }

  /**
   * Check if an entity exists by primary key.
   */
  async exists(id: ID): Promise<boolean> {
    const query = buildExists(this.table, id as QueryParameter);
    const result = await this.execute("exists", () => this.database.query(query));
    return result.rowCount > 0;
  }

  /**
   * Find all entities with optional limit, offset and sort column.
   */
  async findAll(options?: FindAllOptions): Promise<readonly Entity[]> {
    const query = buildFindAll(this.table, options);
    const result = await this.execute("findAll", () =>
      this.database.query<Entity>(query),
    );
    return result.rows;
  }

  /**
   * Count entities matching optional where conditions.
   */
  async count(where?: Record<string, QueryParameter>): Promise<number> {
    const query = buildCount(this.table, where);
    const result = await this.execute("count", () =>
      this.database.query<{ count: string | number }>(query),
    );
    const raw = result.rows[0]?.count ?? 0;
    return typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  }
}
