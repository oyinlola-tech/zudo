/**
 * @zudojs/schema/modifiers/modifiable
 *
 * Base class giving a schema the chainable modifiers every primitive offers:
 * `optional()`, `nullable()`, `default()`, `refine()` and `transform()`.
 */

import { Schema } from "../schemaBase/index.js";
import { TransformSchema } from "../schemaPrimitives/schemaTransform.core.js";

import {
  NullableModifierSchema,
  OptionalModifierSchema,
} from "./schemaOptionalNullable.core.js";
import { DefaultSchema } from "./schemaDefault.core.js";
import { RefineSchema } from "./schemaRefine.core.js";

/**
 * A schema with the standard chainable modifiers.
 *
 * `string()` and `number()` always had them; `boolean()`, `bigint()`,
 * `symbol()`, `literal()`, `enum()`, the sentinel schemas and the coerce
 * schemas extend this class so `schema.boolean().optional()` works like
 * `schema.string().optional()` instead of being a type error.
 */
export abstract class ModifiableSchema<TOutput> extends Schema<TOutput> {
  /** Makes this schema optional (accepts undefined). */
  public optional(): Schema<TOutput | undefined> {
    return new OptionalModifierSchema(this);
  }

  /** Makes this schema nullable (accepts null). */
  public nullable(): Schema<TOutput | null> {
    return new NullableModifierSchema(this);
  }

  /** Adds a default value used when the input is undefined. */
  public default(defaultValue: TOutput | (() => TOutput)): Schema<TOutput> {
    return new DefaultSchema(this, defaultValue);
  }

  /** Adds a custom refinement check. */
  public refine(
    check: (value: TOutput) => boolean,
    message: string,
  ): Schema<TOutput> {
    return new RefineSchema(this, check, message);
  }

  /** Transforms the validated value. */
  public transform<TNext>(
    fn: (value: TOutput) => TNext,
  ): TransformSchema<TOutput, TNext> {
    return new TransformSchema(this, fn);
  }
}
