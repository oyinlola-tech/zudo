/**
 * Storage error factory functions.
 */

import { ErrorCode } from "../../base/types/errorCode.type.js";
import { StorageError, StorageOperation } from "./storageError.base.js";

/** Creates a storage read error. */
export function storageReadError(
  resource: string,
  provider?: string,
  cause?: unknown,
): StorageError {
  return new StorageError(`Failed to read "${resource}".`, {
    code: ErrorCode.STORAGE_READ,
    operation: StorageOperation.READ,
    provider,
    resource,
    cause,
  });
}

/** Creates a storage write error. */
export function storageWriteError(
  resource: string,
  provider?: string,
  cause?: unknown,
): StorageError {
  return new StorageError(`Failed to write "${resource}".`, {
    code: ErrorCode.STORAGE_WRITE,
    operation: StorageOperation.WRITE,
    provider,
    resource,
    cause,
  });
}

/** Creates a storage upload error. */
export function storageUploadError(
  resource: string,
  provider?: string,
  cause?: unknown,
): StorageError {
  return new StorageError(`Failed to upload "${resource}".`, {
    code: ErrorCode.STORAGE_UPLOAD,
    operation: StorageOperation.UPLOAD,
    provider,
    resource,
    cause,
  });
}

/** Creates a storage download error. */
export function storageDownloadError(
  resource: string,
  provider?: string,
  cause?: unknown,
): StorageError {
  return new StorageError(`Failed to download "${resource}".`, {
    code: ErrorCode.STORAGE_DOWNLOAD,
    operation: StorageOperation.DOWNLOAD,
    provider,
    resource,
    cause,
  });
}

/** Creates a storage delete error. */
export function storageDeleteError(
  resource: string,
  provider?: string,
  cause?: unknown,
): StorageError {
  return new StorageError(`Failed to delete "${resource}".`, {
    code: ErrorCode.STORAGE_DELETE,
    operation: StorageOperation.DELETE,
    provider,
    resource,
    cause,
  });
}

/** Creates a storage not found error. */
export function storageNotFoundError(
  resource: string,
  provider?: string,
): StorageError {
  return new StorageError(`Resource "${resource}" was not found.`, {
    code: ErrorCode.STORAGE_NOT_FOUND,
    operation: StorageOperation.READ,
    provider,
    resource,
    statusCode: 404,
    expose: true,
  });
}
