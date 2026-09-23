import type { APIContext } from "../context/context.type.js";

/**
 * The context an operation handler receives.
 *
 * The caller's {@link APIContext} with a non-optional `signal`: the
 * executor always derives one, which aborts when the operation's deadline
 * elapses or the caller's own signal aborts, even when the caller passed
 * no signal. Contexts built by callers (`createAPIContext`,
 * `executor.execute(op, input, context)`) may still omit it.
 */
export type APIHandlerContext<TState = unknown> = APIContext<TState> & {
  readonly signal: AbortSignal;
};

/**
 * Handler for an API operation.
 *
 * Receives the operation input and the execution context, and returns
 * the operation output. When the operation declares an `input` schema (a
 * Standard Schema or a `safeParse` schema), the handler receives the
 * validated value; without one, input is passed through as-is and the
 * handler must validate it itself.
 *
 * `context.signal` is always present. It aborts when the operation's
 * deadline elapses or the caller aborts; pass it to anything cancellable.
 */
export type APIHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: APIHandlerContext,
) => Promise<TOutput>;
