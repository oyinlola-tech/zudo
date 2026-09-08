import { DatabaseError } from "@zudojs/errors";

import type {
  DatabaseOperationOptions,
  PaginatedResult,
  QueryOptions,
  Repository,
  SoftDeletableRepository,
  SortInput,
} from "../databaseType/databaseType.type.js";
import {
  type CursorPaginatedResult,
  createPaginationMeta,
  normalizeLimit,
  normalizePage,
} from "../pagination/pagination.core.js";
import {
  buildKeysetWhere,
  createKeysetPage,
  decodeKeysetCursor,
} from "../pagination/pagination.keyset.js";
import type { QueryBuilder } from "../queryBuilder/queryBuilder.core.js";
import { toPrismaArgs } from "../queryBuilder/queryBuilder.prisma.js";
import type { QueryBuilderState } from "../queryBuilder/queryBuilder.type.js";
import type {
  RelationLoadOptions,
  RelationRegistry,
  ToPrismaIncludeOptions,
} from "../relations/relations.definition.js";
import {
  type RepositoryOperation,
  createAbortError,
  createTimeoutError,
  mapRepositoryError,
} from "./repository.errors.js";

/**
 * Generic Prisma-style delegate contract.
 *
 * This keeps the repository base class independent from generated
 * Prisma model types while still supporting standard CRUD operations.
 */
export interface RepositoryDelegate<
  TEntity,
  TId = string,
  TCreateInput = Partial<TEntity>,
  TUpdateInput = Partial<TEntity>,
  TWhereInput = unknown,
> {
  findUnique(args: { where: unknown }): Promise<TEntity | null>;

  findFirst(args: {
    where?: TWhereInput;
    orderBy?: unknown;
    select?: unknown;
  }): Promise<TEntity | null>;

  findMany(args?: {
    where?: TWhereInput;
    skip?: number;
    take?: number;
    orderBy?: unknown;
    select?: unknown;
    include?: unknown;
  }): Promise<readonly TEntity[]>;

  create(args: { data: TCreateInput }): Promise<TEntity>;

  update(args: { where: unknown; data: TUpdateInput }): Promise<TEntity>;

  delete(args: { where: unknown }): Promise<TEntity>;

  count(args?: { where?: TWhereInput }): Promise<number>;

  upsert?(args: {
    where: unknown;
    create: TCreateInput;
    update: TUpdateInput;
  }): Promise<TEntity>;

  createMany?(args: {
    data: readonly TCreateInput[];
  }): Promise<{ count: number }>;

  deleteMany?(args: { where?: TWhereInput }): Promise<{ count: number }>;
}

/**
 * Soft-delete configuration.
 */
export interface SoftDeleteOptions {
  /**
   * Nullable timestamp column marking deleted rows (default `deletedAt`).
   */
  readonly field?: string;
}

/**
 * Options for constructing a repository.
 */
export interface BaseRepositoryOptions {
  readonly modelName?: string;
  /**
   * Primary key field used by `findById`, `update`, `delete` and friends
   * (default `id`).
   */
  readonly idField?: string;
  /**
   * Enables soft deletion. Every read, count, exists, update and paginate
   * path then excludes rows whose soft-delete field is set.
   */
  readonly softDelete?: boolean | SoftDeleteOptions;
  /**
   * Secret used to sign keyset cursors produced by `paginateCursor`.
   */
  readonly cursorSecret?: string;
  /**
   * Property on a transaction client that yields this model's delegate
   * (default: `modelName` with a lower-cased first letter). Used by
   * `withTransaction`.
   */
  readonly delegateKey?: string;
  /**
   * Relation registry used to validate `include` definitions passed to
   * `findByQuery`.
   */
  readonly relations?: RelationRegistry;
  /**
   * Model identifier registered in `relations` for this repository's
   * entity (default `modelName`).
   */
  readonly relationParent?: unknown;
}

/**
 * Options for cursor pagination.
 */
export interface CursorQueryOptions<TField extends string = string>
  extends DatabaseOperationOptions {
  readonly cursor?: string | null;
  readonly limit?: number;
  /**
   * Sort order. The id field is appended as a tiebreaker when absent.
   */
  readonly sort?: readonly SortInput<TField>[];
}

/**
 * A Prisma transaction client (or any object exposing model delegates).
 */
export type TransactionClientLike = Readonly<Record<string, unknown>>;

const DEFAULT_SOFT_DELETE_FIELD = "deletedAt";

const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Generic base repository implementation.
 *
 * Concrete repositories should extend this class and provide the
 * appropriate Prisma delegate plus any domain-specific behavior.
 */
export abstract class BaseRepository<
  TEntity,
  TId = string,
  TCreateInput = Partial<TEntity>,
  TUpdateInput = Partial<TEntity>,
  TWhereInput = Record<string, unknown>,
> implements
  Repository<TEntity, TId, TCreateInput, TUpdateInput, TWhereInput>,
  SoftDeletableRepository<TEntity, TId, TCreateInput, TUpdateInput, TWhereInput>
{
  protected readonly delegate: RepositoryDelegate<
    TEntity,
    TId,
    TCreateInput,
    TUpdateInput,
    TWhereInput
  >;

  protected readonly modelName: string;

  protected readonly idField: string;

  protected readonly softDeleteField?: string;

  protected readonly cursorSecret?: string;

  protected readonly delegateKey: string;

  protected readonly relations?: RelationRegistry;

  protected readonly relationParent: unknown;

  /**
   * When true, soft-deleted rows are visible to reads (see `withDeleted`).
   */
  protected readonly includeDeleted: boolean = false;

  constructor(
    delegate: RepositoryDelegate<
      TEntity,
      TId,
      TCreateInput,
      TUpdateInput,
      TWhereInput
    >,
    options: BaseRepositoryOptions = {},
  ) {
    if (!delegate) {
      throw new TypeError("A repository delegate is required.");
    }

    this.delegate = delegate;

    this.modelName = options.modelName ?? "DatabaseEntity";

    this.idField = validateFieldName(options.idField ?? "id", "idField");

    if (options.softDelete) {
      const field =
        typeof options.softDelete === "object"
          ? (options.softDelete.field ?? DEFAULT_SOFT_DELETE_FIELD)
          : DEFAULT_SOFT_DELETE_FIELD;

      this.softDeleteField = validateFieldName(field, "softDelete.field");
    }

    if (options.cursorSecret !== undefined) {
      if (
        typeof options.cursorSecret !== "string" ||
        options.cursorSecret.length === 0
      ) {
        throw new TypeError("cursorSecret must be a non-empty string.");
      }

      this.cursorSecret = options.cursorSecret;
    }

    this.delegateKey = validateFieldName(
      options.delegateKey ?? lowerFirst(this.modelName),
      "delegateKey",
    );

    this.relations = options.relations;

    this.relationParent = options.relationParent ?? this.modelName;
  }

  /**
   * Returns a copy of this repository bound to a transaction client's
   * delegate, so operations run inside the transaction.
   */
  public withTransaction(transaction: TransactionClientLike): this {
    if (transaction === null || typeof transaction !== "object") {
      throw new TypeError("A transaction client is required.");
    }

    const delegate = transaction[this.delegateKey];

    if (!delegate || typeof delegate !== "object") {
      throw new DatabaseError(
        `Transaction client has no "${this.delegateKey}" delegate for ${this.modelName}.`,
      );
    }

    return this.withDelegate(
      delegate as RepositoryDelegate<
        TEntity,
        TId,
        TCreateInput,
        TUpdateInput,
        TWhereInput
      >,
    );
  }

  /**
   * Returns a copy of this repository bound to a different delegate.
   */
  public withDelegate(
    delegate: RepositoryDelegate<
      TEntity,
      TId,
      TCreateInput,
      TUpdateInput,
      TWhereInput
    >,
  ): this {
    if (!delegate) {
      throw new TypeError("A repository delegate is required.");
    }

    return this.rebind({ delegate });
  }

  /**
   * Returns a copy of this repository whose reads include soft-deleted
   * rows.
   */
  public withDeleted(): this {
    return this.rebind({ includeDeleted: true });
  }

  /**
   * Finds an entity by its primary identifier.
   */
  public async findById(
    id: TId,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity | null> {
    this.validateId(id);

    return this.execute(
      "findById",
      () =>
        this.isScoped()
          ? this.delegate.findFirst({
              where: this.scope(this.whereId(id) as TWhereInput),
            })
          : this.delegate.findUnique({
              where: this.whereId(id),
            }),
      options,
    );
  }

  /**
   * Finds the first entity matching a filter.
   */
  public async findOne(
    filter: TWhereInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity | null> {
    this.validateFilter(filter);

    return this.execute(
      "findOne",
      () =>
        this.delegate.findFirst({
          where: this.scope(filter),
        }),
      options,
    );
  }

  /**
   * Finds all entities matching a filter.
   */
  public async findMany(
    filter?: TWhereInput,
    options?: DatabaseOperationOptions,
  ): Promise<readonly TEntity[]> {
    if (filter !== undefined) {
      this.validateFilter(filter);
    }

    return this.execute(
      "findMany",
      () =>
        this.delegate.findMany({
          where: this.scope(filter),
        }),
      options,
    );
  }

  /**
   * Finds entities using pagination and sorting.
   */
  public async findPaginated<TField extends string = string>(
    filter?: TWhereInput,
    options?: QueryOptions<TField>,
  ): Promise<PaginatedResult<TEntity>> {
    if (filter !== undefined) {
      this.validateFilter(filter);
    }

    const page = normalizePage(options?.pagination?.page);

    const limit = normalizeLimit(options?.pagination?.limit);

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.execute(
        "findPaginated",
        () =>
          this.delegate.findMany({
            where: this.scope(filter),
            skip,
            take: limit,
            orderBy: this.buildOrderBy(options?.sort),
          }),
        options,
      ),
      this.count(filter, options),
    ]);

    return {
      data,
      meta: createPaginationMeta(page, limit, total),
    };
  }

  /**
   * Alias of {@link findPaginated}.
   */
  public async paginate<TField extends string = string>(
    filter?: TWhereInput,
    options?: QueryOptions<TField>,
  ): Promise<PaginatedResult<TEntity>> {
    return this.findPaginated(filter, options);
  }

  /**
   * Finds entities using keyset (cursor) pagination.
   *
   * Rows are ordered by `options.sort` (the id field is appended as a
   * tiebreaker), `limit + 1` rows are fetched and the extra row decides
   * `hasNextPage`. Cursors are validated against the sort fields and, when
   * `cursorSecret` is configured, signed.
   */
  public async paginateCursor<TField extends string = string>(
    filter?: TWhereInput,
    options?: CursorQueryOptions<TField>,
  ): Promise<CursorPaginatedResult<TEntity>> {
    if (filter !== undefined) {
      this.validateFilter(filter);
    }

    const sort = this.buildCursorSort(options?.sort);

    const limit = normalizeLimit(options?.limit);

    const cursor = options?.cursor ?? null;

    let where: unknown = this.scope(filter);

    if (cursor !== null) {
      const payload = decodeKeysetCursor(cursor, sort, this.cursorSecret);

      const keyset = buildKeysetWhere(payload, sort);

      where = where === undefined ? keyset : { AND: [where, keyset] };
    }

    const rows = await this.execute(
      "paginateCursor",
      () =>
        this.delegate.findMany({
          where: where as TWhereInput,
          take: limit + 1,
          orderBy: this.buildOrderBy(sort),
        }),
      options,
    );

    return createKeysetPage(
      rows as readonly (TEntity & Readonly<Record<string, unknown>>)[],
      {
        sort,
        limit,
        cursor,
        secret: this.cursorSecret,
      },
    );
  }

  /**
   * Finds entities from a query builder (or its built state), applying the
   * filter, sort, select, include and pagination it carries.
   *
   * `options.includeDeleted` and `options.depth` control how relation
   * includes are resolved (see `toPrismaInclude`); by default soft-deleted
   * rows of collection relations are filtered whenever this repository
   * filters its own rows.
   */
  public async findByQuery<TField extends string = string>(
    query: QueryBuilder<TField> | QueryBuilderState<TField>,
    options?: RelationLoadOptions,
  ): Promise<readonly TEntity[]> {
    const state = isQueryBuilder<TField>(query) ? query.build() : query;

    if (!state || typeof state !== "object") {
      throw new DatabaseError(`${this.modelName} query is required.`);
    }

    const includeDeleted =
      options?.includeDeleted ?? (this.includeDeleted || !this.softDeleteField);

    const includeOptions: ToPrismaIncludeOptions | undefined = this.relations
      ? {
          registry: this.relations,
          parent: this.relationParent,
          includeDeleted,
          softDeleteField: this.softDeleteField,
          ...(options?.depth !== undefined ? { depth: options.depth } : {}),
        }
      : options?.depth !== undefined
        ? { depth: options.depth }
        : undefined;

    const args = toPrismaArgs(state, { include: includeOptions });

    const where = this.scope(args.where as TWhereInput | undefined);

    return this.execute(
      "findByQuery",
      () =>
        this.delegate.findMany({
          where,
          skip: args.skip,
          take: args.take,
          orderBy: args.orderBy,
          select: args.select,
          include: args.include,
        }),
      options,
    );
  }

  /**
   * Creates a new entity.
   */
  public async create(
    input: TCreateInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity> {
    if (input === undefined || input === null) {
      throw new DatabaseError(
        `Cannot create ${this.modelName}: input is required.`,
      );
    }

    return this.execute(
      "create",
      () =>
        this.delegate.create({
          data: input,
        }),
      options,
    );
  }

  /**
   * Creates many entities and returns the number created.
   */
  public async createMany(
    inputs: readonly TCreateInput[],
    options?: DatabaseOperationOptions,
  ): Promise<number> {
    if (!Array.isArray(inputs)) {
      throw new DatabaseError(
        `Cannot create ${this.modelName}: inputs must be an array.`,
      );
    }

    if (inputs.some((input) => input === undefined || input === null)) {
      throw new DatabaseError(
        `Cannot create ${this.modelName}: every input is required.`,
      );
    }

    if (inputs.length === 0) {
      return 0;
    }

    const createMany = this.delegate.createMany;

    if (typeof createMany !== "function") {
      throw new DatabaseError(
        `createMany is not supported by ${this.modelName}.`,
      );
    }

    const result = await this.execute(
      "createMany",
      () => createMany.call(this.delegate, { data: inputs }),
      options,
    );

    return result.count;
  }

  /**
   * Updates an entity by its identifier.
   */
  public async update(
    id: TId,
    input: TUpdateInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity> {
    this.validateId(id);

    if (input === undefined || input === null) {
      throw new DatabaseError(
        `Cannot update ${this.modelName}: input is required.`,
      );
    }

    return this.execute(
      "update",
      () =>
        this.delegate.update({
          where: this.scope(this.whereId(id) as TWhereInput),
          data: input,
        }),
      options,
    );
  }

  /**
   * Deletes an entity by its identifier (hard delete).
   */
  public async delete(
    id: TId,
    options?: DatabaseOperationOptions,
  ): Promise<void> {
    this.validateId(id);

    await this.execute(
      "delete",
      () =>
        this.delegate.delete({
          where: this.whereId(id),
        }),
      options,
    );
  }

  /**
   * Deletes every entity matching a filter (hard delete, including
   * soft-deleted rows) and returns the number removed.
   */
  public async deleteMany(
    filter: TWhereInput,
    options?: DatabaseOperationOptions,
  ): Promise<number> {
    this.validateFilter(filter);

    const deleteMany = this.delegate.deleteMany;

    if (typeof deleteMany !== "function") {
      throw new DatabaseError(
        `deleteMany is not supported by ${this.modelName}.`,
      );
    }

    const result = await this.execute(
      "deleteMany",
      () => deleteMany.call(this.delegate, { where: filter }),
      options,
    );

    return result.count;
  }

  /**
   * Marks an entity as deleted by setting its soft-delete field.
   */
  public async softDelete(
    id: TId,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity> {
    const field = this.requireSoftDelete("softDelete");

    this.validateId(id);

    return this.execute(
      "softDelete",
      () =>
        this.delegate.update({
          where: { ...this.whereId(id), [field]: null },
          data: { [field]: new Date() } as TUpdateInput,
        }),
      options,
    );
  }

  /**
   * Restores a soft-deleted entity.
   */
  public async restore(
    id: TId,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity> {
    const field = this.requireSoftDelete("restore");

    this.validateId(id);

    return this.execute(
      "restore",
      () =>
        this.delegate.update({
          where: { ...this.whereId(id), [field]: { not: null } },
          data: { [field]: null } as TUpdateInput,
        }),
      options,
    );
  }

  /**
   * Finds soft-deleted entities matching a filter.
   */
  public async findDeleted(
    filter?: TWhereInput,
    options?: DatabaseOperationOptions,
  ): Promise<readonly TEntity[]> {
    const field = this.requireSoftDelete("findDeleted");

    if (filter !== undefined) {
      this.validateFilter(filter);
    }

    const deleted = { [field]: { not: null } };

    return this.execute(
      "findDeleted",
      () =>
        this.delegate.findMany({
          where: (filter === undefined
            ? deleted
            : { AND: [filter, deleted] }) as TWhereInput,
        }),
      options,
    );
  }

  /**
   * Checks whether an entity exists.
   */
  public async exists(
    filter: TWhereInput,
    options?: DatabaseOperationOptions,
  ): Promise<boolean> {
    this.validateFilter(filter);

    const total = await this.execute(
      "exists",
      () =>
        this.delegate.count({
          where: this.scope(filter),
        }),
      options,
    );

    return total > 0;
  }

  /**
   * Counts entities matching a filter.
   */
  public async count(
    filter?: TWhereInput,
    options?: DatabaseOperationOptions,
  ): Promise<number> {
    if (filter !== undefined) {
      this.validateFilter(filter);
    }

    return this.execute(
      "count",
      () =>
        this.delegate.count({
          where: this.scope(filter),
        }),
      options,
    );
  }

  /**
   * Updates an entity if it exists, otherwise creates it.
   */
  public async upsert(
    where: TWhereInput,
    create: TCreateInput,
    update: TUpdateInput,
    options?: DatabaseOperationOptions,
  ): Promise<TEntity> {
    this.validateFilter(where);

    if (create === undefined || create === null) {
      throw new DatabaseError(
        `Cannot upsert ${this.modelName}: create input is required.`,
      );
    }

    if (update === undefined || update === null) {
      throw new DatabaseError(
        `Cannot upsert ${this.modelName}: update input is required.`,
      );
    }

    const upsert = this.delegate.upsert;

    if (typeof upsert !== "function") {
      throw new DatabaseError(`Upsert is not supported by ${this.modelName}.`);
    }

    return this.execute(
      "upsert",
      () =>
        upsert.call(this.delegate, {
          where,
          create,
          update,
        }),
      options,
    );
  }

  /**
   * Executes a repository operation and normalizes database failures.
   *
   * Honours `options.signal` for the whole duration of the call and
   * `options.timeoutMs` as a client-side deadline (the underlying query is
   * not cancelled server-side).
   */
  protected async execute<TResult>(
    operation: RepositoryOperation | string,
    callback: () => Promise<TResult>,
    options?: DatabaseOperationOptions,
  ): Promise<TResult> {
    const context = {
      model: this.modelName,
      operation,
      metadata: options?.metadata,
    };

    const signal = options?.signal;

    if (signal?.aborted) {
      throw createAbortError(context, signal.reason);
    }

    const startedAt = Date.now();

    let timer: ReturnType<typeof setTimeout> | undefined;

    let onAbort: (() => void) | undefined;

    const guards: Promise<never>[] = [];

    if (signal) {
      guards.push(
        new Promise<never>((_, reject) => {
          onAbort = () => reject(createAbortError(context, signal.reason));

          signal.addEventListener("abort", onAbort, { once: true });
        }),
      );
    }

    if (options?.timeoutMs !== undefined) {
      if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new DatabaseError(
          `${this.modelName} ${operation}: timeoutMs must be a positive number.`,
        );
      }

      const timeoutMs = options.timeoutMs;

      guards.push(
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(createTimeoutError(context, timeoutMs)),
            timeoutMs,
          );
        }),
      );
    }

    try {
      const promise = Promise.resolve().then(callback);

      if (guards.length === 0) {
        return await promise;
      }

      // Keep a handler on the operation so a late rejection after a
      // timeout/abort does not surface as an unhandled rejection.
      promise.catch(() => undefined);

      return await Promise.race([promise, ...guards]);
    } catch (error) {
      throw mapRepositoryError(error, {
        ...context,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }

      if (signal && onAbort) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  /**
   * Validates an entity identifier.
   */
  protected validateId(id: TId): void {
    if (
      id === undefined ||
      id === null ||
      (typeof id === "string" && id.trim().length === 0) ||
      (typeof id === "number" && !Number.isFinite(id))
    ) {
      throw new DatabaseError(`${this.modelName} identifier is required.`);
    }
  }

  /**
   * Validates a repository filter.
   */
  protected validateFilter(filter: TWhereInput): void {
    if (
      filter === undefined ||
      filter === null ||
      typeof filter !== "object" ||
      Array.isArray(filter)
    ) {
      throw new DatabaseError(`${this.modelName} filter is required.`);
    }
  }

  /**
   * Builds the primary-key `where` for an identifier.
   */
  protected whereId(id: TId): Record<string, unknown> {
    return { [this.idField]: id };
  }

  /**
   * Applies the soft-delete scope to a filter when enabled.
   */
  protected scope(filter?: TWhereInput): TWhereInput | undefined {
    if (!this.isScoped()) {
      return filter;
    }

    const alive = { [this.softDeleteField!]: null };

    if (filter === undefined) {
      return alive as TWhereInput;
    }

    return { AND: [filter, alive] } as TWhereInput;
  }

  /**
   * Converts generic sort definitions into Prisma-compatible orderBy.
   */
  protected buildOrderBy<TField extends string>(
    sort?: readonly SortInput<TField>[],
  ): ReadonlyArray<Record<string, string>> | undefined {
    if (!sort || sort.length === 0) {
      return undefined;
    }

    return sort.map((entry) => ({
      [entry.field]: entry.direction,
    }));
  }

  private isScoped(): boolean {
    return this.softDeleteField !== undefined && !this.includeDeleted;
  }

  private requireSoftDelete(operation: string): string {
    if (!this.softDeleteField) {
      throw new DatabaseError(
        `${this.modelName} ${operation} requires the softDelete option.`,
      );
    }

    return this.softDeleteField;
  }

  private buildCursorSort<TField extends string>(
    sort?: readonly SortInput<TField>[],
  ): SortInput<string>[] {
    const result: SortInput<string>[] = (sort ?? []).map((entry) => ({
      field: entry.field,
      direction: entry.direction,
    }));

    if (!result.some((entry) => entry.field === this.idField)) {
      result.push({
        field: this.idField,
        direction: result[0]?.direction ?? "asc",
      });
    }

    return result;
  }

  private rebind(overrides: Readonly<Record<string, unknown>>): this {
    const copy = Object.create(Object.getPrototypeOf(this)) as this;

    Object.assign(copy, this, overrides);

    return copy;
  }
}

function isQueryBuilder<TField extends string>(
  value: unknown,
): value is QueryBuilder<TField> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { build?: unknown }).build === "function"
  );
}

function validateFieldName(field: string, name: string): string {
  if (typeof field !== "string" || !FIELD_PATTERN.test(field)) {
    throw new TypeError(`Invalid ${name} "${String(field)}".`);
  }

  return field;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

