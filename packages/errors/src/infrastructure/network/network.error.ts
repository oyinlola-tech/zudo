/**
 * Network error classes — re-exports from focused files.
 */

export {
  NetworkError,
  createNetworkError,
  isNetworkError,
} from "./networkError.base.js";
export type { NetworkErrorOptions } from "./networkError.base.js";

export {
  connectionFailedError,
  networkTimeoutError,
  networkServiceUnavailableError,
} from "./networkError.factory.js";
