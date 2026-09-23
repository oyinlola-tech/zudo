import type { APIHandler } from "../handler/handler.type.js";

import type { APIOperationMetadata } from "./operation.type.js";

/**
 * A schema the executor can validate against, as a type: a Standard
 * Schema (a `"~standard"` object with `validate`, implemented by Zod,
 * Valibot, ArkType, …) or a `safeParse` schema such as `@zudojs/schema`.
 */
export type APIInputSchema =
  | { readonly "~standard": { validate(value: unknown): unknown } }
  | { safeParse(value: unknown): unknown };

/**
 * The value a schema produces on success — what the executor hands the
 * handler after validating the input.
 *
 * Read from a Standard Schema's `"~standard".types.output`, or from the
 * `data` of a `safeParse` success result (`@zudojs/schema`, Zod). A schema
 * that declares neither yields `unknown`.
 *
 * @example
 * const TodoInput = schema.object({ title: schema.string() });
 * type T = InferAPISchemaOutput<typeof TodoInput>; // { title: string }
 */
export type InferAPISchemaOutput<TSchema> = TSchema extends {
  readonly "~standard": { readonly types?: infer TTypes };
}
  ? NonNullable<TTypes> extends { readonly output: infer TOut }
    ? TOut
    : unknown
  : TSchema extends { safeParse(...args: never[]): infer TResult }
    ? Extract<Awaited<TResult>, { readonly success: true }> extends {
        readonly data: infer TData;
      }
      ? TData
      : unknown
    : unknown;

/**
 * Options for a `defineOperation` call whose input type is inferred from
 * its `input` schema: `handler`'s `input` parameter is the schema's
 * output type, with no type arguments or annotations needed.
 */
export interface DefineOperationWithSchemaOptions<
  TSchema extends APIInputSchema,
  TOutput = unknown,
> {
  readonly name: string;

  /** The input schema; the handler's input type is inferred from it. */
  readonly input: TSchema;

  /** Output schema; see `APIOperation.output`. */
  readonly output?: unknown;

  readonly handler: APIHandler<InferAPISchemaOutput<TSchema>, TOutput>;

  readonly metadata?: APIOperationMetadata;

  /** Timeout in milliseconds; see `APIOperation.timeout`. */
  readonly timeout?: number;
}
