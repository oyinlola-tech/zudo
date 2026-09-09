/**
 * @zudojs/adapters/storage
 *
 * Storage adapter contracts — bridges Zudojs storage to external providers.
 *
 * Examples: Local filesystem, AWS S3, Cloudflare R2, Google Cloud Storage, Azure Blob.
 */

import type { Adapter, AdapterOperationOptions } from "../index.js";

/**
 * Storage adapter — connects Zudojs storage abstractions to external providers.
 */
export interface StorageAdapter extends Adapter {
  /** Retrieves an object by key. */
  get(key: string, options?: AdapterOperationOptions): Promise<unknown>;

  /** Stores an object. */
  put(
    key: string,
    value: unknown,
    options?: AdapterOperationOptions,
  ): Promise<void>;

  /** Deletes an object. */
  delete(key: string, options?: AdapterOperationOptions): Promise<void>;

  /** Checks if an object exists. */
  exists(key: string, options?: AdapterOperationOptions): Promise<boolean>;

  /** Lists objects with optional prefix. */
  list(
    prefix?: string,
    options?: AdapterOperationOptions,
  ): Promise<readonly string[]>;
}
