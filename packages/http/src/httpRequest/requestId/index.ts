/**
 * @zudojs/http/httpRequest/requestId
 *
 * Validation of an incoming `x-request-id` before it becomes `request.id`.
 */

export {
  MAX_INCOMING_REQUEST_ID_LENGTH,
  INCOMING_REQUEST_ID_PATTERN,
  resolveIncomingRequestId,
} from "./httpRequest.requestId.js";
