/**
 * @zudojs/cache — Constants
 *
 * Default values, limits, and magic numbers used across the cache package.
 */

/* -------------------------------------------------------------------------- */
/* Default TTL                                                                */
/* -------------------------------------------------------------------------- */

/** Default time-to-live in milliseconds (5 minutes). */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Maximum supported TTL (24 hours). TTLs above this are rejected. */
export const MAX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Minimum TTL (1 millisecond). TTLs below this (zero or negative) are
 * rejected; use `ttl: null` for entries that never expire.
 */
export const MIN_TTL_MS = 1;

/* -------------------------------------------------------------------------- */
/* Key Generation                                                             */
/* -------------------------------------------------------------------------- */

/** Default namespace separator. */
export const DEFAULT_SEPARATOR = ":";

/** Default key prefix. */
export const DEFAULT_PREFIX = "zudojs";

/** Maximum key length in characters. */
export const MAX_KEY_LENGTH = 256;

/**
 * Pattern used to validate each individual cache key part (prefix,
 * namespace, and raw key). Deliberately excludes the default separator
 * (`:`) so callers cannot forge namespaced keys (e.g. `build("admin:x")`
 * throws). Parts are additionally checked against the active separator.
 */
export const CACHE_KEY_PATTERN = /^[a-zA-Z0-9._\-]+$/;

/* -------------------------------------------------------------------------- */
/* Lock Defaults                                                              */
/* -------------------------------------------------------------------------- */

/** Default lock TTL in milliseconds (30 seconds). */
export const DEFAULT_LOCK_TTL_MS = 30_000;

/** Default number of retry attempts for lock acquisition. */
export const DEFAULT_LOCK_RETRY_ATTEMPTS = 3;

/** Default delay between lock retry attempts in milliseconds. */
export const DEFAULT_LOCK_RETRY_DELAY_MS = 100;

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/** Maximum number of latency samples to keep per operation. */
export const MAX_LATENCY_SAMPLES = 1_000;

/** Maximum number of distinct keys tracked for hot-key metrics. */
export const MAX_TRACKED_KEYS = 1_024;

/** Bucket boundaries for latency histograms (ms). A +Infinity bucket is appended at query time. */
export const LATENCY_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const;

/* -------------------------------------------------------------------------- */
/* Memory Adapter                                                             */
/* -------------------------------------------------------------------------- */

/** Default maximum number of entries for the in-memory adapter. */
export const DEFAULT_MAX_ENTRIES = 10_000;

/** Default maximum memory budget in bytes (50 MB). */
export const DEFAULT_MAX_MEMORY_BYTES = 50 * 1024 * 1024;
