import { ContextStorage } from "./contextStorage.storage.js";

/**
 * The process-wide default ContextStorage.
 *
 * Every framework component that needs ambient execution context
 * (runtime, module lifecycle, application, container scoping,
 * logging) falls back to this instance when no storage is injected,
 * so they all observe the same AsyncLocalStorage by default.
 * Inject a dedicated ContextStorage everywhere when isolation is
 * required (for example in tests that run applications in
 * parallel).
 */
export const defaultContextStorage: ContextStorage = new ContextStorage();

/**
 * Returns the process-wide default ContextStorage.
 */
export function getDefaultContextStorage(): ContextStorage {
  return defaultContextStorage;
}
