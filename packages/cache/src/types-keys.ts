export type CacheKey = string;
export type CacheNamespace = string;

export interface CacheKeyOptions {
  readonly namespace?: CacheNamespace;
  readonly prefix?: string;
  readonly separator?: string;
}

export interface CacheKeyBuilder {
  build(key: string, options?: CacheKeyOptions): CacheKey;
  /**
   * Builds a fully-qualified glob pattern for pattern-based operations.
   *
   * Prefix and namespace are identity parts, never glob parts, so they are
   * validated exactly as `build()` validates them. Only the trailing
   * pattern segment may contain the glob metacharacters `*` and `?`.
   */
  buildPattern?(pattern: string, options?: CacheKeyOptions): string;
}
