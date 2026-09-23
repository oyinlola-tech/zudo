import type { RPCMetadata } from "../types/rpcMetadata.type.js";

import type { RPCRequest } from "../types/rpcRequest.type.js";

/**
 * Identity and other facts established by the transport (a verified
 * bearer token, an mTLS peer, a session looked up server-side).
 *
 * Unlike frame `metadata`, which the caller writes, this is supplied by
 * the server's own code through `RPCServer.handle(request, { auth })`, so
 * it is the only context field safe to authorise on.
 */
export type RPCAuthContext = Readonly<Record<string, unknown>>;

/**
 * Extra, server-supplied values for {@link createRPCContext}.
 */
export interface RPCContextOptions {
  /** Trusted, transport-derived identity. See {@link RPCAuthContext}. */
  readonly auth?: RPCAuthContext;
  /**
   * Aborts when the caller is gone — the HTTP client disconnected, the
   * in-process caller cancelled. The dispatch then fails with
   * `RPC_CANCELLED` and the handler's `context.signal` aborts, so the
   * server stops work nobody will read.
   */
  readonly signal?: AbortSignal;
}

/**
 * Context passed through the RPC execution pipeline.
 */
export interface RPCContext {
  readonly request: RPCRequest;

  /**
   * Frame metadata exactly as the caller sent it. Untrusted: any client
   * can set `userId`, `tenantId` or any other key. Authorise on
   * {@link RPCContext.auth} instead.
   */
  readonly metadata: RPCMetadata;

  /**
   * Trusted identity supplied by the transport through
   * `RPCServer.handle(request, { auth })`; `undefined` when none was given.
   */
  readonly auth: RPCAuthContext | undefined;

  /**
   * The payload after the procedure's input schema has parsed it
   * (stripped, defaulted, coerced), or the raw payload when the procedure
   * declares no input schema. `undefined` until validation has run, i.e.
   * in an interceptor before it calls `next()`. `request.payload` always
   * stays the raw, unvalidated value.
   */
  readonly input: unknown;

  readonly signal: AbortSignal;

  readonly state: Map<string, unknown>;

  get<T>(key: string): T | undefined;

  set<T>(key: string, value: T): void;
}

const inputs = new WeakMap<RPCContext, unknown>();

/**
 * Records the validated input on a context. Called by the dispatcher
 * once, after input validation and before the middleware stack runs.
 */
export function bindRPCContextInput(context: RPCContext, input: unknown): void {
  inputs.set(context, input);
}

/**
 * Creates a new RPC context.
 */
export function createRPCContext(
  request: RPCRequest,
  signal: AbortSignal,
  options: RPCContextOptions = {},
): RPCContext {
  const state = new Map<string, unknown>();
  const auth =
    options.auth === undefined ? undefined : Object.freeze({ ...options.auth });

  const context: RPCContext = {
    request,
    // A frame decoded from JSON may omit `metadata`; middleware reads
    // `context.metadata.userId` and the like without guarding.
    metadata: request.metadata ?? {},
    auth,
    get input(): unknown {
      return inputs.get(context);
    },
    signal,
    state,
    get<T>(key: string): T | undefined {
      return state.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      state.set(key, value);
    },
  };

  return Object.freeze(context);
}
