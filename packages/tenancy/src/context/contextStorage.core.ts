/**
 * AsyncLocalStorage-based tenant context storage.
 *
 * @module context/contextStorage
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionTenantContext } from "../tenancyTypes/tenantInterface.js";

/** Interface for tenant context storage. */
export interface TenantContextStorage {
  get(): ExecutionTenantContext | undefined;
  run<T>(context: ExecutionTenantContext, callback: () => T): T;
}

/**
 * Create an AsyncLocalStorage-backed tenant context storage.
 */
export function createTenantContextStorage(): TenantContextStorage {
  const storage = new AsyncLocalStorage<ExecutionTenantContext>();

  return {
    get(): ExecutionTenantContext | undefined {
      return storage.getStore();
    },

    run<T>(context: ExecutionTenantContext, callback: () => T): T {
      return storage.run(context, callback);
    },
  };
}

/** Default storage instance. */
let defaultStorage: TenantContextStorage | undefined;

/**
 * Get or create the default tenant context storage.
 */
export function getDefaultStorage(): TenantContextStorage {
  if (!defaultStorage) {
    defaultStorage = createTenantContextStorage();
  }
  return defaultStorage;
}

/**
 * Reset the default storage (useful for testing).
 */
export function resetDefaultStorage(): void {
  defaultStorage = undefined;
}
