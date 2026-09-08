/**
 * Adapter helpers and in-memory transaction adapter.
 *
 * @module adapter/adapter
 */

import type {
  TransactionAdapter,
  TransactionAdapterCapabilities,
  TransactionHandle,
} from "../transactionTypes/transactionAdapter.js";
import type { TransactionOptions } from "../transactionTypes/transaction.interface.js";
import { TransactionAdapterError } from "../transactionErrors/transactionError.types.js";

/** In-memory transaction state. */
interface InMemoryHandle {
  readonly id: string;
  active: boolean;
  readonly savepoints: string[];
}

let counter = 0;

/** Narrows an opaque handle to an in-memory handle, or fails loudly. */
function asHandle(handle: TransactionHandle): InMemoryHandle {
  if (
    typeof handle !== "object" ||
    handle === null ||
    !("savepoints" in handle)
  ) {
    throw new TransactionAdapterError(
      "Handle was not issued by the in-memory adapter",
    );
  }
  return handle as InMemoryHandle;
}

/**
 * Create an in-memory transaction adapter (useful for testing).
 *
 * Capabilities are declared honestly: the adapter emulates savepoints and
 * accepts every isolation level, because it enforces none of them and so
 * cannot fail to provide what it claims.
 */
export function createInMemoryAdapter(): TransactionAdapter {
  const handles = new Map<string, InMemoryHandle>();

  return {
    capabilities: Object.freeze({
      savepoints: true,
      nestedTransactions: true,
      isolationLevels: [
        "read_uncommitted",
        "read_committed",
        "repeatable_read",
        "serializable",
      ],
      readOnlyTransactions: true,
      timeouts: true,
    } satisfies TransactionAdapterCapabilities),

    async begin(_options?: TransactionOptions): Promise<TransactionHandle> {
      const id = `mem_${++counter}`;
      const handle: InMemoryHandle = { id, active: true, savepoints: [] };
      handles.set(id, handle);
      return handle;
    },

    async commit(handle: TransactionHandle): Promise<void> {
      const h = asHandle(handle);
      h.active = false;
      handles.delete(h.id);
    },

    async rollback(handle: TransactionHandle): Promise<void> {
      const h = asHandle(handle);
      h.active = false;
      handles.delete(h.id);
    },

    async createSavepoint(
      handle: TransactionHandle,
      name: string,
    ): Promise<void> {
      asHandle(handle).savepoints.push(name);
    },

    async rollbackToSavepoint(
      handle: TransactionHandle,
      name: string,
    ): Promise<void> {
      const h = asHandle(handle);
      const index = h.savepoints.indexOf(name);
      if (index === -1) {
        throw new TransactionAdapterError(`Unknown savepoint: ${name}`);
      }
      h.savepoints.length = index + 1;
    },

    async releaseSavepoint(
      handle: TransactionHandle,
      name: string,
    ): Promise<void> {
      const h = asHandle(handle);
      const index = h.savepoints.indexOf(name);
      if (index !== -1) h.savepoints.splice(index, 1);
    },
  };
}

/**
 * Create an adapter with custom capabilities.
 */
export function createAdapter(
  implementation: TransactionAdapter,
  capabilities: TransactionAdapterCapabilities,
): TransactionAdapter {
  return {
    ...implementation,
    capabilities: Object.freeze(capabilities),
  };
}
