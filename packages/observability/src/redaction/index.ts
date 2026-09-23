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
  CIRCULAR_MARKER,
  MAX_DEPTH_MARKER,
} from "./redaction.core.js";
export { DEFAULT_SENSITIVE_FIELDS } from "./redaction.defaults.js";
