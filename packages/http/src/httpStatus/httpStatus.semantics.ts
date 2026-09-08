/**
 * Response semantics helpers.
 *
 * Determines whether a status code allows a body, is cacheable by default,
 * or is retryable.
 */

import { STATUS } from "./httpStatus.statusConstant.js";

/**
 * Reports whether a response with this status may carry content.
 *
 * A 1xx response terminates before the content section (RFC 9110
 * section 6.4.1): writing a body after one corrupts connection framing,
 * because the client reads those bytes as the start of the next response.
 *
 * @param status - The status code.
 * @returns `true` if content is allowed.
 */
export function hasResponseBody(status: number): boolean {
  return !(status < 200 || status === 204 || status === 205 || status === 304);
}

export function isCacheableByDefault(status: number): boolean {
  switch (status) {
    case 200:
    case 203:
    case 204:
    case 206:
    case 300:
    case 301:
    case 308:
    case 404:
    case 405:
    case 410:
    case 414:
    case 501:
      return true;

    default:
      return false;
  }
}

export function isRetryableStatus(status: number): boolean {
  return (
    status === STATUS.REQUEST_TIMEOUT ||
    status === STATUS.TOO_EARLY ||
    status === STATUS.TOO_MANY_REQUESTS ||
    status === STATUS.INTERNAL_SERVER_ERROR ||
    status === STATUS.BAD_GATEWAY ||
    status === STATUS.SERVICE_UNAVAILABLE ||
    status === STATUS.GATEWAY_TIMEOUT
  );
}
