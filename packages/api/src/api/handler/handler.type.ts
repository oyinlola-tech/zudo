import type { APIContext } from "../context/context.type.js";

/**
 * Handler for an API operation.
 *
 * Receives the operation input and the execution context, and returns
 * the operation output. Input is validated by the executor only when the
 * operation's `input` is a Standard Schema (https://standardschema.dev,
 * implemented by Zod, Valibot, ArkType, …); otherwise it is passed
 * through as-is and the handler must validate it itself.
 */
export type APIHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: APIContext,
) => Promise<TOutput>;
