/**
 * @zudojs/cache — Key Builder
 *
 * Builds fully qualified cache keys from key parts, namespaces,
 * and prefixes. Ensures keys are well-formed and consistently formatted.
 *
 * Each part (prefix, namespace, raw key) is validated individually with a
 * pattern that excludes the separator character, so raw keys cannot forge
 * namespaced/prefixed keys (e.g. `build("admin:x")` throws).
 */

import type { CacheKey, CacheKeyOptions, CacheNamespace } from "./types.js";
import type { CacheKeyBuilder } from "./types-keys.js";
import {
  CACHE_KEY_PATTERN,
  DEFAULT_PREFIX,
  DEFAULT_SEPARATOR,
  MAX_KEY_LENGTH,
} from "./constants.js";
import { cacheInvalidKeyError } from "./errors.js";
import { assertValidPatternPart } from "./utils.js";

/* -------------------------------------------------------------------------- */
/* Default Key Builder                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Default implementation of the `CacheKeyBuilder` contract.
 *
 * Keys are built as: `[prefix:][namespace:]key`
 */
export class DefaultKeyBuilder implements CacheKeyBuilder {
  private readonly globalPrefix: string;
  private readonly globalSeparator: string;
  private readonly currentNamespace?: CacheNamespace;

  constructor(options?: {
    readonly prefix?: string;
    readonly separator?: string;
    readonly namespace?: CacheNamespace;
  }) {
    this.globalPrefix = options?.prefix ?? DEFAULT_PREFIX;
    this.globalSeparator = options?.separator ?? DEFAULT_SEPARATOR;
    this.currentNamespace = options?.namespace;
  }

  build(key: string, options?: CacheKeyOptions): CacheKey {
    const separator = options?.separator ?? this.globalSeparator;
    const namespace = options?.namespace ?? this.currentNamespace;
    const prefix = options?.prefix ?? this.globalPrefix;

    if (key.length === 0) {
      throw cacheInvalidKeyError(key, "Cache key must not be empty.");
    }

    const parts: string[] = [];

    if (prefix) {
      parts.push(prefix);
    }

    if (namespace) {
      parts.push(namespace);
    }

    parts.push(key);

    for (const part of parts) {
      this.validatePart(part, separator);
    }

    const fullKey = parts.join(separator);

    if (fullKey.length > MAX_KEY_LENGTH) {
      throw cacheInvalidKeyError(
        fullKey,
        `Cache key exceeds maximum length of ${MAX_KEY_LENGTH} characters.`,
      );
    }

    return fullKey;
  }

  /**
   * Builds a fully-qualified glob pattern.
   *
   * Prefix and namespace are *identity* parts — they are the scope boundary
   * a pattern operation must stay inside — so they are validated exactly as
   * `build()` validates them. A namespace of `"*"` is rejected rather than
   * silently widening the pattern to every namespace. Only the trailing
   * pattern segment may contain `*` and `?`.
   */
  buildPattern(pattern: string, options?: CacheKeyOptions): string {
    const separator = options?.separator ?? this.globalSeparator;
    const namespace = options?.namespace ?? this.currentNamespace;
    const prefix = options?.prefix ?? this.globalPrefix;

    const identityParts: string[] = [];
    if (prefix) identityParts.push(prefix);
    if (namespace) identityParts.push(namespace);
    for (const part of identityParts) this.validatePart(part, separator);

    assertValidPatternPart(pattern, separator);

    const fullPattern = [...identityParts, pattern].join(separator);
    if (fullPattern.length > MAX_KEY_LENGTH) {
      throw cacheInvalidKeyError(
        fullPattern,
        `Cache pattern exceeds maximum length of ${MAX_KEY_LENGTH} characters.`,
      );
    }
    return fullPattern;
  }

  namespace(namespace: CacheNamespace): CacheKeyBuilder {
    return new DefaultKeyBuilder({
      prefix: this.globalPrefix,
      separator: this.globalSeparator,
      namespace,
    });
  }

  private validatePart(part: string, separator: string): void {
    if (part.includes(separator) || !CACHE_KEY_PATTERN.test(part)) {
      throw cacheInvalidKeyError(
        part,
        `Invalid cache key part "${part}": parts must match ${String(
          CACHE_KEY_PATTERN,
        )} and must not contain the separator "${separator}".`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates a new `DefaultKeyBuilder` with the given options.
 */
export function createKeyBuilder(options?: {
  readonly prefix?: string;
  readonly separator?: string;
  readonly namespace?: CacheNamespace;
}): DefaultKeyBuilder {
  return new DefaultKeyBuilder(options);
}

/** Default key builder singleton. */
export const defaultKeyBuilder = new DefaultKeyBuilder();
