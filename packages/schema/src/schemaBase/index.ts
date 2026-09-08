/**
 * @zudojs/schema/schemaBase
 *
 * Core schema types, result helpers, context, and the abstract base Schema class.
 */

export { Schema } from "./schemaBase.core.js";
export type {
  SchemaIssue,
  SchemaPathSegment,
  SchemaResult,
  SchemaSuccess,
  SchemaFailure,
  SchemaParseOptions,
  SchemaParseContext,
  SchemaMetadata,
} from "./schemaBase.type.js";
export {
  schemaSuccess,
  schemaFailure,
  isSchemaSuccess,
  isSchemaFailure,
  unwrapSchemaResult,
} from "./schemaBase.result.js";
export {
  createParseContext,
  childContext,
  addIssue,
  isMaxDepthExceeded,
  shouldAbortEarly,
  SchemaValidationSignal,
  failValidation,
  rethrowUnexpected,
  enterComposite,
  leaveComposite,
} from "./schemaBase.context.js";
