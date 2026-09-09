/**
 * Object storage types for the storage package.
 */

/** Options for putting an object. */
export interface ObjectPutOptions {
  readonly contentType?: string;
  readonly metadata?: Record<string, string>;
  readonly cacheControl?: string;
}

/** Metadata about a stored object. */
export interface ObjectMetadata {
  readonly key: string;
  readonly contentType?: string;
  readonly size: number;
  readonly lastModified: Date;
  /** Cache-control directive recorded when the object was stored. */
  readonly cacheControl?: string;
  /** Content hash of the stored bytes, set by implementations that compute one. */
  readonly etag?: string;
  readonly metadata?: Record<string, string>;
}

/** Data read from object storage. */
export interface ObjectData {
  readonly metadata: ObjectMetadata;
  readonly body: ReadableStream<Uint8Array>;
  /** Read entire content as Uint8Array (use only for small objects). */
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Object storage abstraction. */
export interface ObjectStorage {
  put(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array>,
    options?: ObjectPutOptions,
  ): Promise<ObjectMetadata>;
  get(key: string): Promise<ObjectData | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  metadata(key: string): Promise<ObjectMetadata | null>;
  list(
    prefix?: string,
    options?: {
      readonly maxKeys?: number;
      readonly continuationToken?: string;
    },
  ): Promise<ListObjectsResult>;
}

/** Result of listing objects. */
export interface ListObjectsResult {
  readonly objects: readonly ObjectMetadata[];
  readonly continuationToken?: string;
  readonly isTruncated: boolean;
}
