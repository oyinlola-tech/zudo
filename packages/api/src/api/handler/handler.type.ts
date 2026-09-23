import type { APIContext } from "../context/context.type.js";

/**
 * Handler for an API operation.
 *
 * Receives the operation input and the execution context, and returns
 * the operation output. When the operation declares an `input` schema (a
 * Standard Schema or a `safeParse` schema), the handler receives the
 * validated value; without one, input is passed through as-is and the
 * handler must validate it itself.
 *
 * `context.signal` aborts when the operation's deadline elapses or the
 * caller aborts; pass it to anything cancellable.
 */
export type APIHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: APIContext,
) => Promise<TOutput>;
