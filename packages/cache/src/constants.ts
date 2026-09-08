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

/**
 * Pattern used to validate the caller-supplied *glob* segment of a key
 * pattern. It is the key alphabet plus the two glob metacharacters `*` and
 * `?` — nothing else has meaning for the matcher, so anything else is
 * caller error. The separator is excluded so a pattern cannot escape the
 * prefix/namespace scope it is composed into.
 */
export const CACHE_PATTERN_PART_PATTERN = /^[a-zA-Z0-9._\-*?]+$/;

/** Maximum length of a cache tag. Tags are untrusted map keys. */
export const MAX_TAG_LENGTH = 128;

/* -------------------------------------------------------------------------- */
/* Lock Defaults                                                              */
/* -------------------------------------------------------------------------- */

/** Default lock TTL in milliseconds (30 seconds). */
export const DEFAULT_LOCK_TTL_MS = 30_000;

/** Default number of retry attempts for lock acquisition. */
export const DEFAULT_LOCK_RETRY_ATTEMPTS = 3;

/** Default delay between lock retry attempts in milliseconds. */
export const DEFAULT_LOCK_RETRY_DELAY_MS = 100;

/**
 * Divisor applied to a lock's TTL to derive its heartbeat interval, so a
 * lease is renewed roughly three times per TTL window while the critical
 * section runs.
 */
export const LOCK_HEARTBEAT_DIVISOR = 3;

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

/**
 * Default maximum memory budget in bytes (50 MB) for the in-memory adapter.
 * Entry sizes are estimated (see `MemoryCacheAdapter`), so the budget is
 * approximate; it exists to bound worst-case retention, not to be exact.
 */
export const DEFAULT_MAX_MEMORY_BYTES = 50 * 1024 * 1024;

/**
 * How often (at most) the in-memory adapter opportunistically purges expired
 * entries on the overwrite path, where no eviction is otherwise triggered.
 */
export const EXPIRED_PURGE_INTERVAL_MS = 30_000;

/**
 * Maximum number of value nodes visited when estimating an entry's size.
 * Keeps `set` O(1)-ish for large object graphs at the cost of accuracy.
 */
export const SIZE_ESTIMATE_NODE_BUDGET = 512;
