import { ValidationError } from "@zudojs/errors";

/**
 * Why a client-supplied pagination cursor was rejected. Carried as the
 * `code` of the single issue on the thrown `ValidationError`.
 */
export type InvalidCursorReason =
  | "cursor_required"
  | "cursor_signature"
  | "cursor_malformed"
  | "cursor_payload"
  | "cursor_field";

/**
 * Creates the error thrown for a missing, forged, tampered or malformed
 * pagination cursor.
 *
 * A cursor is client input, so a bad one is a `ValidationError` (HTTP 400,
 * exposable) rather than a `TypeError` that an HTTP layer would turn into a
 * 500. Messages never echo the cursor or its contents, and the decoding
 * failure is kept only as the non-exposed `cause`.
 */
export function createInvalidCursorError(
  message: string,
  reason: InvalidCursorReason,
  cause?: unknown,
): ValidationError {
  return new ValidationError(message, {
    issues: [{ field: "cursor", path: ["cursor"], code: reason, message }],
    ...(cause !== undefined ? { cause } : {}),
  });
}
