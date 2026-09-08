/**
 * @zudojs/database — Pagination
 *
 * Offset and cursor pagination utilities.
 */

export {
  normalizePagination,
  normalizePage,
  normalizeLimit,
  calculateOffset,
  calculateTotalPages,
  createPaginationMeta,
  createPaginatedResult,
  getNextPage,
  getPreviousPage,
  isValidPage,
  getItemRange,
  paginateCollection,
  encodeCursor,
  decodeCursor,
  validateCursorPayload,
  normalizeCursorPagination,
  createCursorPaginationMeta,
  createCursorPaginatedResult,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type NormalizedPagination,
  type CursorPaginationInput,
  type CursorPaginationMeta,
  type CursorPaginatedResult,
  type CursorPayload,
  type EncodeCursorOptions,
  type DecodeCursorOptions,
} from "./pagination.core.js";

export {
  decodeKeysetCursor,
  buildKeysetWhere,
  createKeysetCursor,
  createKeysetPage,
  type KeysetPageOptions,
  type KeysetWhere,
} from "./pagination.keyset.js";
