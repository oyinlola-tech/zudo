/**
 * @zudojs/api/schema
 *
 * Structural recognition of operation schemas (Standard Schema and
 * `safeParse` schemas such as `@zudojs/schema`) and fail-closed validation.
 */

export {
  assertAPISchema,
  isAPISchema,
  validateWithSchema,
} from "./apiSchema.adapter.js";

export type { APISchemaIssue, APISchemaResult } from "./apiSchema.adapter.js";
