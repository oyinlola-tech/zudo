import type { CacheKey, CacheNamespace } from "./types-keys.js";
import type { MaybePromise as BaseMaybePromise } from "@zudojs/types";
import type { CacheSetOptions } from "./types-operations.js";

export type { BaseMaybePromise as MaybePromise };

export interface CacheOrComputeOptions extends CacheSetOptions {
  readonly namespace?: CacheNamespace;
  readonly forceRefresh?: boolean;
}

export interface CacheOrComputeResult<TValue> {
  readonly value: TValue;
  readonly cached: boolean;
}

/** A single operation in a `CacheService.batch()` call. */
export interface CacheBatchOperation {
  readonly type: "get" | "set" | "delete";
  readonly key: CacheKey;
  readonly value?: unknown;
  readonly options?: CacheSetOptions;
}

/** The outcome of one `CacheBatchOperation`, in submission order. */
export interface CacheBatchResult {
  readonly operation: CacheBatchOperation;
  readonly success: boolean;
  readonly result?: unknown;
  readonly error?: unknown;
}
