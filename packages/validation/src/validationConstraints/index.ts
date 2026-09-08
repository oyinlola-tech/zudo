/**
 * @zudojs/validation/validationConstraints
 *
 * Built-in validation constraints and rules.
 */

// Base constraints
export {
  createConstraint,
  checkConstraint,
  checkConstraints,
  combineConstraints,
  not,
  required,
  assertNonNegativeInteger,
} from "./validationConstraints.base.js";

export type {
  ValidationConstraint,
  ConstraintOptions,
} from "./validationConstraints.base.js";

// Scalar constraints: strings, numbers, dates
export * from "./scalar/index.js";

// Collection constraints: arrays and membership
export * from "./collection/index.js";

// Structural guards: depth, size, and circular references
export * from "./structure/index.js";
