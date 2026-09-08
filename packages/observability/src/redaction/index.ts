/**
 * @zudojs/observability — Redaction
 *
 * Sensitive field redaction for logs and traces.
 */

export {
  createRedactor,
  createStructureRedactor,
  redactObject,
  redactValue,
  isSensitiveField,
  DEFAULT_SENSITIVE_FIELDS,
  CIRCULAR_MARKER,
  MAX_DEPTH_MARKER,
} from "./redaction.core.js";
