import type { SortInput } from "../databaseType/databaseType.type.js";
import type { CursorPayload } from "./pagination.core.js";

/**
 * Direction a keyset cursor pages in. A `nextCursor` pages forward (rows
 * after the cursor position); a `previousCursor` pages backward (rows
 * before it).
 */
export type KeysetDirection = "forward" | "backward";

/**
 * Reserved cursor payload key marking a backward cursor. It can never
 * collide with a sort field, because sort fields must be identifiers.
 */
export const KEYSET_BACKWARD_KEY = "$before";

/**
 * Returns the direction a decoded keyset cursor pages in.
 */
export function getKeysetDirection(cursor: CursorPayload): KeysetDirection {
  return cursor[KEYSET_BACKWARD_KEY] === true ? "backward" : "forward";
}

/**
 * Flips every direction in a sort definition. A backward page is fetched
 * with the reversed sort (so the rows nearest the cursor come first) and
 * then put back into the requested order by `createKeysetPage`.
 */
export function reverseKeysetSort<TField extends string>(
  sort: readonly SortInput<TField>[],
): readonly SortInput<TField>[] {
  return sort.map((entry) => ({
    ...entry,
    direction: entry.direction === "desc" ? "asc" : "desc",
  }));
}

/**
 * Returns the sort a page must be fetched with for the given direction:
 * the requested sort going forward, the reversed sort going backward.
 */
export function keysetFetchSort<TField extends string>(
  sort: readonly SortInput<TField>[],
  direction: KeysetDirection,
): readonly SortInput<TField>[] {
  return direction === "backward" ? reverseKeysetSort(sort) : sort;
}
