/**
 * @zudojs/storage — Repository query builders.
 *
 * Every identifier reaching a template literal here has already passed through
 * `identifier.helper.js`; nothing in this module interpolates a caller-supplied
 * value that was not validated first.
 */

import type { Query, QueryParameter } from "../types/storage.type.js";
import {
  type ColumnPolicy,
  type ColumnPolicyOptions,
  filterableColumnsOf,
  providedKeys,
  resolveColumnPolicy,
  sortableColumnsOf,
  writableColumnsOf,
} from "./baseRepository.columns.js";
import {
  assertIdentifier,
  assertIdentifiers,
  assertRowBound,
  assertSortDirection,
} from "./identifier.helper.js";

/**
 * Table and primary key names for a repository, validated once at
 * construction, plus its column allow-lists. `writableColumns`,
 * `filterableColumns` and `sortableColumns` each fall back to `columns`.
 */
export interface TableRef extends ColumnPolicy {
  readonly tableName: string;
  readonly primaryKey: string;
}

/** Options accepted by {@link buildFindAll}. */
export interface FindAllOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly orderBy?: string;
  readonly order?: "ASC" | "DESC";
}

/** Builds a select-by-primary-key query. */
export function buildFindById(table: TableRef, id: QueryParameter): Query {
  return {
    text: `SELECT * FROM ${table.tableName} WHERE ${table.primaryKey} = $1`,
    parameters: [id],
  };
}

/** Builds a select-by-many-primary-keys query. */
export function buildFindByIds(
  table: TableRef,
  ids: readonly QueryParameter[],
): Query {
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
  return {
    text: `SELECT * FROM ${table.tableName} WHERE ${table.primaryKey} IN (${placeholders})`,
    parameters: [...ids],
  };
}

/**
 * Builds an insert query from an entity's own enumerable properties.
 * Properties whose value is `undefined` are omitted (the column keeps its
 * default); `null` inserts `NULL`.
 */
export function buildCreate(
  table: TableRef,
  entity: Record<string, unknown>,
): Query {
  const keys = providedKeys(entity);
  if (keys.length === 0) {
    throw new TypeError("Cannot create an entity with no properties.");
  }

  const columns = assertIdentifiers(keys, "column name", writableColumnsOf(table));
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");

  return {
    text: `INSERT INTO ${table.tableName} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
    parameters: keys.map((key) => entity[key] as QueryParameter),
  };
}

/**
 * Builds an update-by-primary-key query. Properties whose value is
 * `undefined` are omitted (the column is left unchanged); `null` sets
 * `NULL`. Callers must handle a payload with no provided properties.
 */
export function buildUpdate(
  table: TableRef,
  id: QueryParameter,
  changes: Record<string, unknown>,
): Query {
  const keys = providedKeys(changes);
  if (keys.length === 0) {
    throw new TypeError("Cannot update an entity with no provided properties.");
  }
  const columns = assertIdentifiers(keys, "column name", writableColumnsOf(table));
  const setClauses = columns
    .map((column, index) => `${column} = $${index + 1}`)
    .join(", ");

  return {
    text: `UPDATE ${table.tableName} SET ${setClauses} WHERE ${table.primaryKey} = $${keys.length + 1} RETURNING *`,
    parameters: [...keys.map((key) => changes[key] as QueryParameter), id],
  };
}

/** Builds a delete-by-primary-key query. */
export function buildDelete(table: TableRef, id: QueryParameter): Query {
  return {
    text: `DELETE FROM ${table.tableName} WHERE ${table.primaryKey} = $1`,
    parameters: [id],
  };
}

/** Builds an existence probe for a primary key. */
export function buildExists(table: TableRef, id: QueryParameter): Query {
  return {
    text: `SELECT 1 FROM ${table.tableName} WHERE ${table.primaryKey} = $1 LIMIT 1`,
    parameters: [id],
  };
}

/** Builds a paginated select with an optional validated sort column. */
export function buildFindAll(table: TableRef, options?: FindAllOptions): Query {
  let text = `SELECT * FROM ${table.tableName}`;

  if (options?.orderBy !== undefined) {
    const column = assertIdentifiers(
      [options.orderBy],
      "sort column",
      sortableColumnsOf(table),
    )[0]!;
    text += ` ORDER BY ${column} ${assertSortDirection(options.order)}`;
  }

  const parameters: QueryParameter[] = [];

  if (options?.limit !== undefined) {
    parameters.push(assertRowBound(options.limit, "limit"));
    text += ` LIMIT $${parameters.length}`;
  }

  if (options?.offset !== undefined) {
    parameters.push(assertRowBound(options.offset, "offset"));
    text += ` OFFSET $${parameters.length}`;
  }

  return { text, parameters };
}

/** Builds a count query with optional equality filters. */
export function buildCount(
  table: TableRef,
  where?: Record<string, QueryParameter>,
): Query {
  let text = `SELECT COUNT(*) as count FROM ${table.tableName}`;
  const parameters: QueryParameter[] = [];

  if (where) {
    const keys = Object.keys(where);
    if (keys.length > 0) {
      const columns = assertIdentifiers(
        keys,
        "column name",
        filterableColumnsOf(table),
      );
      text += ` WHERE ${columns
        .map((column, index) => `${column} = $${index + 1}`)
        .join(" AND ")}`;
      parameters.push(...keys.map((key) => where[key]!));
    }
  }

  return { text, parameters };
}

/**
 * Validates and freezes the table reference a repository was configured
 * with. `policy` adds the specific allow-lists; each defaults to `columns`.
 */
export function createTableRef(
  tableName: string,
  primaryKey: string,
  columns?: readonly string[],
  policy: Omit<ColumnPolicyOptions, "columns"> = {},
): TableRef {
  return Object.freeze({
    tableName: assertIdentifier(tableName, "table name"),
    primaryKey: assertIdentifier(primaryKey, "primary key column"),
    ...resolveColumnPolicy({ ...policy, ...(columns ? { columns } : {}) }),
  });
}
