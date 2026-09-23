/**
 * Limits and defaults shared across the RPC package: timeouts, payload
 * and frame sizes, procedure-name rules, and the fixed internal-error
 * message returned to remote callers.
 */

export {
  DEFAULT_RPC_TIMEOUT,
  MAX_RPC_PAYLOAD_SIZE,
  MAX_RPC_REQUEST_ID_LENGTH,
  MAX_PENDING_REQUESTS,
  MAX_MIDDLEWARE,
  MAX_PROCEDURES,
  MAX_PROCEDURE_NAME_LENGTH,
  MAX_TIMER_DELAY,
  PROCEDURE_NAME_PATTERN,
  INTERNAL_ERROR_MESSAGE,
  DEFAULT_RPC_HTTP_MAX_BODY_BYTES,
  MAX_RPC_FRAME_DEPTH,
} from "./rpcConstants.core.js";
