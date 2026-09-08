export type CacheKey = string;
export type CacheNamespace = string;

export interface CacheKeyParts {
  readonly namespace?: CacheNamespace;
  readonly key: CacheKey;
}

export interface CacheKeyOptions {
  readonly namespace?: CacheNamespace;
  readonly prefix?: string;
  readonly separator?: string;
}

export interface CacheKeyBuilder {
  build(key: string, options?: CacheKeyOptions): CacheKey;
  /**
   * Builds a fully-qualified glob pattern (prefix/namespace prepended,
   * no per-part validation) for pattern-based operations.
   */
  buildPattern?(pattern: string, options?: CacheKeyOptions): string;
}
