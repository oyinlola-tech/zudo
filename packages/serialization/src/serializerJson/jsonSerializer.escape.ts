/**
 * @zudojs/serialization — Escaping of user objects that look like type tags.
 *
 * With `preserveTypes`, a tagged object `{ "$type": "Map", "$value": [...] }`
 * is revived into a real `Map` on read. A *user* object carrying its own
 * string `$type` key used to be written out verbatim, so any caller who
 * controlled part of a payload could choose the runtime type the reader got
 * back (an `Error`, a `Buffer`, a `BigInt`), or plant a malformed tag that
 * made the record unreadable.
 *
 * Such objects are now written wrapped in a reserved tag:
 *
 * ```json
 * { "$type": "Object", "$value": { "$type": "Map", "note": "user data" } }
 * ```
 *
 * and unwrapped on read into the plain object they were, with their own
 * `$type` key left uninterpreted.
 */

import { SerializationTags } from "@zudojs/constants";
import { isPlainObject } from "@zudojs/types";

/**
 * Reserved type tag that marks an escaped plain object. No transformer may
 * register under this name.
 */
export const ESCAPED_OBJECT_TAG = "Object";

/** True when a plain object would be mistaken for a type tag on read. */
export function needsEscape(value: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(value, SerializationTags.TYPE) &&
    typeof value[SerializationTags.TYPE] === "string"
  );
}

/** Wraps an already-transformed object body in the reserved escape tag. */
export function escapeObject(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    [SerializationTags.TYPE]: ESCAPED_OBJECT_TAG,
    [SerializationTags.VALUE]: body,
  };
}

/**
 * Returns the escaped body when `value` is a well-formed escape wrapper,
 * `undefined` when it is not an escape wrapper at all, and `null` when it
 * claims to be one but its `$value` is not a plain object.
 */
export function escapedBody(
  value: Record<string, unknown>,
): Record<string, unknown> | null | undefined {
  if (value[SerializationTags.TYPE] !== ESCAPED_OBJECT_TAG) return undefined;
  const body = value[SerializationTags.VALUE];
  return isPlainObject(body) ? body : null;
}
