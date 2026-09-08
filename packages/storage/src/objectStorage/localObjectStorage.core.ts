/**
 * @zudojs/storage — Local Object Storage
 *
 * Filesystem-based object storage for development and testing.
 */

import { readFile, stat, unlink } from "node:fs/promises";
import type {
  ListObjectsResult,
  ObjectData,
  ObjectMetadata,
  ObjectPutOptions,
  ObjectStorage,
} from "../types/storage.type.js";
import type { ListOptions } from "./localObjectStorage.list.js";
import { listObjects } from "./localObjectStorage.list.js";
import {
  assertRealPathContained,
  resolveBasePath,
  resolveKeyPath,
} from "./localObjectStorage.path.js";
import {
  DEFAULT_MAX_OBJECT_BYTES,
  assertWithinBudget,
  collectStream,
  writeAtomic,
} from "./localObjectStorage.write.js";

/** Options for the local object storage. */
export interface LocalObjectStorageOptions {
  /** Maximum accepted object size in bytes. Defaults to 64 MiB. */
  readonly maxObjectBytes?: number;
}

/**
 * Local filesystem object storage implementation.
 */
export class LocalObjectStorage implements ObjectStorage {
  private readonly basePath: string;
  private readonly maxObjectBytes: number;

  constructor(basePath: string, options?: LocalObjectStorageOptions) {
    this.basePath = resolveBasePath(basePath);
    this.maxObjectBytes = options?.maxObjectBytes ?? DEFAULT_MAX_OBJECT_BYTES;
  }

  async put(
    key: string,
    data: Uint8Array | ReadableStream<Uint8Array>,
    options?: ObjectPutOptions,
  ): Promise<ObjectMetadata> {
    const filePath = await this.resolve(key);

    const buffer =
      data instanceof Uint8Array
        ? assertWithinBudget(data, this.maxObjectBytes)
        : await collectStream(data, this.maxObjectBytes);

    await writeAtomic(filePath, buffer);

    const stats = await stat(filePath);
    return {
      key,
      contentType: options?.contentType,
      size: stats.size,
      lastModified: stats.mtime,
      metadata: options?.metadata,
    };
  }

  async get(key: string): Promise<ObjectData | null> {
    const filePath = await this.resolve(key);

    let buffer: Buffer;
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(filePath);
      buffer = await readFile(filePath);
    } catch {
      return null;
    }

    const metadata: ObjectMetadata = {
      key,
      size: stats.size,
      lastModified: stats.mtime,
    };

    return {
      metadata,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(buffer));
          controller.close();
        },
      }),
      async arrayBuffer(): Promise<ArrayBuffer> {
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer;
      },
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = await this.resolve(key);
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = await this.resolve(key);
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async metadata(key: string): Promise<ObjectMetadata | null> {
    const filePath = await this.resolve(key);
    try {
      const stats = await stat(filePath);
      return { key, size: stats.size, lastModified: stats.mtime };
    } catch {
      return null;
    }
  }

  async list(
    prefix?: string,
    options?: ListOptions,
  ): Promise<ListObjectsResult> {
    return listObjects(this.basePath, prefix, options);
  }

  /** Resolve a key to a contained absolute path, following symlinks. */
  private async resolve(key: string): Promise<string> {
    const filePath = resolveKeyPath(this.basePath, key);
    await assertRealPathContained(this.basePath, filePath, key);
    return filePath;
  }
}
