import type { RPCContext } from "../context/rpcContext.type.js";

import { MAX_MIDDLEWARE } from "../constants/rpcConstants.core.js";

/**
 * Middleware function for the RPC pipeline.
 */
export type RPCMiddleware = (
  context: RPCContext,
  next: () => Promise<unknown>,
) => Promise<unknown>;

/**
 * Stack of RPC middleware.
 */
export class RPCMiddlewareStack {
  private readonly middleware: readonly RPCMiddleware[];

  constructor(middleware: RPCMiddleware[] = []) {
    if (middleware.length > MAX_MIDDLEWARE) {
      throw new RangeError(
        `An RPC middleware stack may hold at most ${MAX_MIDDLEWARE} entries; received ${middleware.length}.`,
      );
    }

    this.middleware = Object.freeze([...middleware]);
  }

  /**
   * Number of middleware in the stack.
   */
  get size(): number {
    return this.middleware.length;
  }

  /**
   * Returns a new stack with additional middleware appended.
   */
  with(...middleware: RPCMiddleware[]): RPCMiddlewareStack {
    return new RPCMiddlewareStack([...this.middleware, ...middleware]);
  }

  /**
   * Executes the middleware stack around the given handler.
   *
   * Each middleware may call `next()` exactly once. A second call throws
   * rather than silently re-entering the chain, which would run the
   * handler — and every middleware below it — twice.
   */
  async execute(
    context: RPCContext,
    handler: () => Promise<unknown>,
  ): Promise<unknown> {
    const stack = this.middleware;
    const called = new Set<number>();

    const runAt = async (index: number): Promise<unknown> => {
      if (called.has(index)) {
        throw new Error(
          `RPC middleware at index ${index - 1} called next() more than once.`,
        );
      }
      called.add(index);

      if (index >= stack.length) {
        return handler();
      }

      const mw = stack[index];
      if (!mw) {
        return runAt(index + 1);
      }

      return mw(context, () => runAt(index + 1));
    };

    return runAt(0);
  }
}
