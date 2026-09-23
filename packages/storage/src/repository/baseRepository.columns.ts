/**
 * @zudojs/storage — Repository column policy and write-value helpers.
 */

import { assertIdentifiers } from "./identifier.helper.js";

/**
 * Column allow-lists for a repository. Each list is optional; the three
 * specific lists default to `columns`, so a config that only sets
 * `columns` keeps one list governing writes, filters and sorting.
 */
export interface ColumnPolicyOptions {
  /** Shared allow-list used by any specific list that is not supplied. */
  readonly columns?: readonly string[];
  /** Columns `create` and `update` may write. Defaults to `columns`. */
  readonly writableColumns?: readonly string[];
  /** Columns `count` may filter on. Defaults to `columns`. */
  readonly filterableColumns?: readonly string[];
  /** Columns `findAll` may sort by. Defaults to `columns`. */
  readonly sortableColumns?: readonly string[];
}

/** Resolved, validated column allow-lists stored on a `TableRef`. */
export interface ColumnPolicy {
  readonly columns?: ReadonlySet<string>;
  readonly writableColumns?: ReadonlySet<string>;
  readonly filterableColumns?: ReadonlySet<string>;
  readonly sortableColumns?: ReadonlySet<string>;
}

function toSet(list: readonly string[] | undefined): ReadonlySet<string> | undefined {
  return list ? new Set(assertIdentifiers(list, "column name")) : undefined;
}

/**
 * Validates the allow-lists and applies the `columns` defaults.
 */
export function resolveColumnPolicy(options: ColumnPolicyOptions = {}): ColumnPolicy {
  const columns = toSet(options.columns);
  const writableColumns = toSet(options.writableColumns) ?? columns;
  const filterableColumns = toSet(options.filterableColumns) ?? columns;
  const sortableColumns = toSet(options.sortableColumns) ?? columns;
  return {
    ...(columns ? { columns } : {}),
    ...(writableColumns ? { writableColumns } : {}),
    ...(filterableColumns ? { filterableColumns } : {}),
    ...(sortableColumns ? { sortableColumns } : {}),
  };
}

/** Allow-list for writes: `writableColumns`, else `columns`. */
export function writableColumnsOf(policy: ColumnPolicy): ReadonlySet<string> | undefined {
  return policy.writableColumns ?? policy.columns;
}

/** Allow-list for filters: `filterableColumns`, else `columns`. */
export function filterableColumnsOf(policy: ColumnPolicy): ReadonlySet<string> | undefined {
  return policy.filterableColumns ?? policy.columns;
}

/** Allow-list for sorting: `sortableColumns`, else `columns`. */
export function sortableColumnsOf(policy: ColumnPolicy): ReadonlySet<string> | undefined {
  return policy.sortableColumns ?? policy.columns;
}

/**
 * The own enumerable keys of a write payload whose value is not
 * `undefined`.
 *
 * `undefined` means "not provided" and is never written, so an optional
 * field a partial DTO did not send cannot wipe a column. Only an explicit
 * `null` writes SQL `NULL`.
 */
export function providedKeys(values: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.keys(values).filter((key) => values[key] !== undefined);
}
