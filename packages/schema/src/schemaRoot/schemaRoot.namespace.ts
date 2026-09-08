/**
 * @zudojs/schema/root
 *
 * The schema namespace — primary entry point for creating schemas.
 */

import { stringSchema } from "../schemaPrimitives/index.js";
import { numberSchema } from "../schemaPrimitives/index.js";
import { booleanSchema } from "../schemaPrimitives/index.js";
import { literalSchema } from "../schemaPrimitives/index.js";
import {
  nullSchema,
  undefinedSchema,
  bigintSchema,
  symbolSchema,
  anySchema,
  unknownSchema,
  neverSchema,
} from "../schemaPrimitives/index.js";
import { objectSchema } from "../schemaStructures/index.js";
import { arraySchema } from "../schemaStructures/index.js";
import { tupleSchema } from "../schemaStructures/index.js";
import { recordSchema } from "../schemaStructures/index.js";
import { mapSchema, setSchema } from "../schemaStructures/index.js";
import {
  unionSchema,
  discriminatedUnionSchema,
} from "../schemaComposition/index.js";
import { intersectionSchema } from "../schemaComposition/index.js";
import { lazySchema } from "../schemaComposition/index.js";
import { enumSchema } from "../schemaComposition/index.js";
import { optionalSchema, nullableSchema } from "../schemaModifiers/index.js";
import { defaultSchema } from "../schemaModifiers/index.js";
import { refineSchema } from "../schemaModifiers/index.js";
import { transformSchema } from "../schemaModifiers/index.js";
import {
  coerceNumberSchema,
  coerceBooleanSchema,
  coerceStringSchema,
  coerceBigIntSchema,
} from "../schemaCoerce/index.js";

/**
 * The schema namespace — primary API for creating schemas.
 *
 * @example
 * import { schema } from "@zudojs/schema";
 *
 * const UserSchema = schema.object({
 *   id: schema.string().uuid(),
 *   name: schema.string().min(2),
 *   email: schema.string().email(),
 *   age: schema.number().int().min(0).optional(),
 * });
 */
export const schema = {
  // Primitives
  string: stringSchema,
  number: numberSchema,
  boolean: booleanSchema,
  bigint: bigintSchema,
  symbol: symbolSchema,

  // Sentinels
  null: nullSchema,
  undefined: undefinedSchema,
  any: anySchema,
  unknown: unknownSchema,
  never: neverSchema,

  // Literals and enums
  literal: literalSchema,
  enum: enumSchema,

  // Structures
  object: objectSchema,
  array: arraySchema,
  tuple: tupleSchema,
  record: recordSchema,
  map: mapSchema,
  set: setSchema,

  // Composition
  union: unionSchema,
  discriminatedUnion: discriminatedUnionSchema,
  intersection: intersectionSchema,
  lazy: lazySchema,

  // Modifiers
  optional: optionalSchema,
  nullable: nullableSchema,
  default: defaultSchema,
  refine: refineSchema,
  transform: transformSchema,

  // Coercion
  coerce: {
    string: coerceStringSchema,
    number: coerceNumberSchema,
    boolean: coerceBooleanSchema,
    bigint: coerceBigIntSchema,
  },
};
