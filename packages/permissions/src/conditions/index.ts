/**
 * Condition combinators for composing authorization policies.
 *
 * @module conditions
 */

export {
  allOf,
  anyOf,
  not,
  always,
  never,
  isOwner,
  tenantIsolation,
  metadataEquals,
  resourceEquals,
} from "./conditions.core.js";
