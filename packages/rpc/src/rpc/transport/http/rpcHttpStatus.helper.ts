import type { RPCResponse } from "../../types/rpcResponse.type.js";

/**
 * HTTP status used by {@link createRPCFetchHandler} for each wire code.
 *
 * The status is advisory — for proxies, logs and dashboards. The frame's
 * `error.code` is authoritative, and {@link createRPCHttpTransport} reads
 * any well-formed frame whatever status it arrives with. Codes not listed
 * here (custom `RPCError` codes) are sent as 500.
 */
export const RPC_HTTP_STATUS: Readonly<Record<string, number>> = Object.freeze({
  RPC_INVALID_REQUEST: 400,
  RPC_DESERIALIZATION_ERROR: 400,
  RPC_UNAUTHENTICATED: 401,
  RPC_FORBIDDEN: 403,
  RPC_PROCEDURE_NOT_FOUND: 404,
  RPC_NOT_FOUND: 404,
  RPC_CONFLICT: 409,
  RPC_VALIDATION_ERROR: 422,
  RPC_RATE_LIMITED: 429,
  RPC_CANCELLED: 499,
  RPC_INTERNAL_ERROR: 500,
  RPC_SERIALIZATION_ERROR: 500,
  RPC_UNAVAILABLE: 503,
  RPC_TIMEOUT: 504,
  RPC_DEADLINE_EXCEEDED: 504,
});

/**
 * Returns the HTTP status for a response frame: 200 for success, the
 * mapped status for a known error code, and 500 otherwise.
 */
export function rpcHttpStatus(response: RPCResponse): number {
  if (response.success) {
    return 200;
  }
  const code = response.error?.code;
  return (code !== undefined ? RPC_HTTP_STATUS[code] : undefined) ?? 500;
}
