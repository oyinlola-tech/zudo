/**
 * @zudojs/serialization — Serialization envelope.
 *
 * Wraps serialized data with metadata for cross-service communication.
 */

export {
  createEnvelope,
  assertValidEnvelope,
  contentTypeForFormat,
  unwrapEnvelope,
  serializeToEnvelope,
  deserializeFromEnvelope,
} from "./envelope.core.js";
