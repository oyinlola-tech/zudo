/**
 * CQRS middleware composition, built on `compose` from `@zudojs/middleware`.
 */

import { compose, type Middleware } from "@zudojs/middleware";

import type {
  Command,
  Query,
  CqrsContext,
  CqrsMiddleware,
} from "../cqrsTypes/cqrsTypes.type.js";

import { MiddlewareExecutionError } from "../cqrsErrors/cqrsError.base.js";

/**
 * Per-execution state threaded through the shared composer. CQRS `next()`
 * may replace the request and context, so each call records them here
 * before advancing.
 */
interface CqrsPipelineState {
  request: Command | Query;
  context: CqrsContext | undefined;
  readonly terminal: Parameters<CqrsMiddleware>[2];
}

/** Adapts one CQRS middleware to the shared `(context, next)` shape. */
function adapt(middleware: CqrsMiddleware): Middleware<CqrsPipelineState, unknown> {
  return async (state, next) => {
    let called = false;
    return middleware(state.request, state.context, (request, context) => {
      if (called) {
        return Promise.reject(new MiddlewareExecutionError());
      }
      called = true;
      state.request = request;
      state.context = context;
      return next();
    });
  };
}

/**
 * Combines multiple middleware functions into a single middleware.
 *
 * Each middleware may call `next()` at most once per execution; a second
 * call throws `MiddlewareExecutionError`. The command and query buses
 * build their pipelines with this function, so the same rule applies
 * there.
 */
export function composeMiddleware(
  middleware: readonly CqrsMiddleware[],
): CqrsMiddleware {
  const run = compose<CqrsPipelineState, unknown>(
    middleware.map(adapt),
    async (state) => state.terminal(state.request, state.context),
    { maxDepth: Number.POSITIVE_INFINITY },
  );

  return async (request, context, terminal) =>
    run({ request, context, terminal });
}
