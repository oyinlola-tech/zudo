/**
 * @zudojs/schema/inference
 *
 * Type inference utilities for extracting TypeScript types from schemas.
 */

import type { Prettify } from "@zudojs/types";

import type { Schema } from "../schemaBase/index.js";

/**
 * Infers the output type of a schema.
 *
 * @example
 * const UserSchema = schema.object({ name: schema.string() });
 * type User = Infer<typeof UserSchema>; // { name: string }
 */
export type Infer<TSchema> =
  TSchema extends Schema<infer TOutput, unknown>
    ? TOutput
    : TSchema extends Schema<infer TOutput>
      ? TOutput
      : never;

/**
 * Infers the input type of a schema.
 *
 * @example
 * const schema = schema.string().transform(Number);
 * type Input = Input<typeof schema>; // string
 */
export type SchemaInput<TSchema> =
  TSchema extends Schema<unknown, infer TInput>
    ? TInput
    : TSchema extends Schema<infer TOutput>
      ? TOutput
      : never;

/**
 * Infers the output type of a schema (alias for Infer).
 */
export type SchemaOutput<TSchema> = Infer<TSchema>;

/**
 * The parsed type of an object shape. A key whose schema can produce
 * `undefined` (`.optional()`, `any()`, `unknown()`) is an optional property:
 * when the input leaves it out, the parsed object leaves it out too, which
 * is what `exactOptionalPropertyTypes` expects.
 *
 * @example
 * const s = schema.object({ a: schema.number(), b: schema.string().optional() });
 * type T = Infer<typeof s>; // { a: number; b?: string | undefined }
 */
export type ObjectShapeOutput<TShape> = Prettify<
  {
    [K in keyof TShape as undefined extends Infer<TShape[K]>
      ? never
      : K]: Infer<TShape[K]>;
  } & {
    [K in keyof TShape as undefined extends Infer<TShape[K]>
      ? K
      : never]?: Infer<TShape[K]>;
  }
>;
