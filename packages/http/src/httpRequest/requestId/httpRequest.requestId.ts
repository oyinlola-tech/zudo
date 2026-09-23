/**
 * Incoming request id handling.
 *
 * @module httpRequest/requestId
 */

/** Longest incoming `x-request-id` value reused as `request.id`. */
export const MAX_INCOMING_REQUEST_ID_LENGTH = 128;

/**
 * Characters an incoming request id may contain: letters, digits and
 * `.`, `_`, `:`, `-`. That covers UUIDs, ULIDs, W3C trace ids and the
 * `service:counter` style many proxies emit, and rules out spaces, quotes,
 * control characters and anything else that could forge a log field.
 */
export const INCOMING_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Returns the incoming request id when it is safe to reuse, otherwise
 * `undefined` (the caller then generates one).
 *
 * The header is client-controlled, so it is only trusted when it is 1 to
 * {@link MAX_INCOMING_REQUEST_ID_LENGTH} characters from
 * {@link INCOMING_REQUEST_ID_PATTERN}. A header sent more than once (joined
 * with `", "` by Node) fails the pattern and is ignored.
 */
export function resolveIncomingRequestId(
  value: string | readonly string[] | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const id = value.trim();

  if (id.length === 0 || id.length > MAX_INCOMING_REQUEST_ID_LENGTH) {
    return undefined;
  }

  return INCOMING_REQUEST_ID_PATTERN.test(id) ? id : undefined;
}
