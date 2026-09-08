import { randomUUID } from "node:crypto";

import type { RPCResponse } from "../types/rpcResponse.type.js";

import type { RPCTransport } from "../transport/rpcTransport.type.js";

import { createRPCRequest } from "../types/rpcRequest.type.js";

import {
  isRPCError,
  RPCCancelledError,
  RPCError,
  RPCTimeoutError,
  RPCUnavailableError,
} from "../errors/rpc.errors.js";

import {
  DEFAULT_RPC_TIMEOUT,
  MAX_PENDING_REQUESTS,
} from "../constants/rpcConstants.core.js";

import { createTimeout } from "../reliability/timeout/rpcTimeout.helper.js";

/**
 * Options for RPC client calls.
 */
export interface RPCCallOptions {
  readonly timeout?: number;

  /** Cancels the call. An already-aborted signal fails immediately. */
  readonly signal?: AbortSignal;

  readonly metadata?: Record<string, string | number | boolean | undefined>;
}

/**
 * Options for constructing an RPC client.
 */
export interface RPCClientOptions {
  /** Default timeout for calls that do not specify one. */
  readonly timeout?: number;
  /**
   * Maximum number of calls in flight at once. Defaults to
   * {@link MAX_PENDING_REQUESTS}. Additional calls fail fast rather than
   * queueing without bound.
   */
  readonly maxPending?: number;
}

/**
 * A call currently in flight.
 */
interface PendingCall {
  readonly procedure: string;
  readonly startedAt: number;
  /** Aborts the call's own signal chain. */
  cancel(reason: Error): void;
}

/**
 * RPC client for invoking remote procedures.
 *
 * Every call is tracked while it is genuinely in flight and removed the
 * moment it settles, so the concurrency limit reflects real in-flight
 * work rather than accumulating entries from calls that already
 * succeeded.
 */
export class RPCClient {
  private readonly transport: RPCTransport;

  private readonly options: RPCClientOptions;

  private readonly pending = new Map<string, PendingCall>();

  private closed = false;

  constructor(transport: RPCTransport, options: RPCClientOptions = {}) {
    this.transport = transport;
    this.options = options;
  }

  /**
   * Number of calls currently in flight.
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Calls a remote procedure.
   */
  async call<TInput = unknown, TOutput = unknown>(
    procedure: string,
    input: TInput,
    options: RPCCallOptions = {},
  ): Promise<TOutput> {
    if (this.closed) {
      throw new RPCUnavailableError("RPC client has been closed.", procedure);
    }

    const maxPending = this.options.maxPending ?? MAX_PENDING_REQUESTS;

    if (this.pending.size >= maxPending) {
      throw new RPCUnavailableError(
        `Too many RPC requests in flight (${this.pending.size}/${maxPending}).`,
        procedure,
      );
    }

    if (options.signal?.aborted) {
      throw this.cancellationError(options.signal, procedure);
    }

    const id = randomUUID();
    const timeoutMs =
      options.timeout ?? this.options.timeout ?? DEFAULT_RPC_TIMEOUT;

    const controller = new AbortController();
    const timeout =
      timeoutMs > 0 ? createTimeout(timeoutMs, procedure) : undefined;

    const onCallerAbort = (): void => {
      controller.abort(this.cancellationError(options.signal, procedure));
    };

    options.signal?.addEventListener("abort", onCallerAbort, { once: true });

    this.pending.set(id, {
      procedure,
      startedAt: Date.now(),
      cancel: (reason) => {
        if (!controller.signal.aborted) {
          controller.abort(reason);
        }
      },
    });

    try {
      const request = createRPCRequest({
        id,
        procedure,
        payload: input,
        metadata: options.metadata,
      });

      const races: Promise<RPCResponse>[] = [
        this.transport.send(request, { signal: controller.signal }),
        this.abortPromise(controller.signal, procedure),
      ];

      if (timeout) {
        races.push(
          timeout.promise.catch((error: unknown) => {
            if (!controller.signal.aborted) {
              controller.abort(error);
            }
            throw error;
          }),
        );
      }

      const response = await Promise.race(races);

      if (!response.success) {
        throw this.toError(response, procedure);
      }

      return response.result as TOutput;
    } finally {
      // Removing the entry here — rather than leaving it for a timer to
      // reap — is what keeps `pendingCount` equal to the number of calls
      // actually in flight.
      this.pending.delete(id);
      timeout?.cancel();
      options.signal?.removeEventListener("abort", onCallerAbort);

      if (!controller.signal.aborted) {
        controller.abort(new RPCCancelledError("Call settled.", procedure));
      }
    }
  }

  /**
   * Cancels every in-flight call and stops accepting new ones.
   */
  async close(reason?: string): Promise<void> {
    this.closed = true;

    const error = new RPCCancelledError(reason ?? "RPC client closed.");

    for (const call of this.pending.values()) {
      call.cancel(error);
    }

    this.pending.clear();

    await this.transport.close?.();
  }

  /**
   * Describes the calls currently in flight, for diagnostics.
   */
  inspectPending(): readonly { procedure: string; elapsedMs: number }[] {
    const now = Date.now();
    return [...this.pending.values()].map((call) => ({
      procedure: call.procedure,
      elapsedMs: now - call.startedAt,
    }));
  }

  /**
   * A promise that rejects when the signal aborts.
   */
  private abortPromise(
    signal: AbortSignal,
    procedure?: string,
  ): Promise<never> {
    return new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(this.abortReason(signal, procedure));
        return;
      }

      signal.addEventListener(
        "abort",
        () => reject(this.abortReason(signal, procedure)),
        { once: true },
      );
    });
  }

  private abortReason(signal: AbortSignal, procedure?: string): Error {
    return this.toCancellation(signal.reason, procedure);
  }

  private cancellationError(
    signal: AbortSignal | undefined,
    procedure: string,
  ): Error {
    return this.toCancellation(signal?.reason, procedure);
  }

  /**
   * Normalises an abort reason into an `RPCCancelledError`.
   *
   * A bare `controller.abort()` yields a `DOMException`, so callers that
   * branch on error type would never see a cancellation. The original
   * reason is preserved as `cause`; a reason that is already an RPC
   * error is passed through untouched.
   */
  private toCancellation(reason: unknown, procedure?: string): Error {
    if (isRPCError(reason)) {
      return reason;
    }

    const message =
      reason instanceof Error && reason.name !== "AbortError"
        ? reason.message
        : "Call cancelled by caller.";

    const error = new RPCCancelledError(message, procedure);

    if (reason !== undefined) {
      Object.defineProperty(error, "cause", {
        value: reason,
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }

    return error;
  }

  /**
   * Reconstructs a typed error from an error response.
   *
   * The wire code drives the type, so a caller can tell an
   * authentication failure from a timeout without string matching.
   */
  private toError(response: RPCResponse, procedure: string): Error {
    const message = response.error?.message ?? "RPC call failed.";
    const code = response.error?.code;

    switch (code) {
      case "RPC_TIMEOUT":
        return new RPCTimeoutError(0, procedure);
      case "RPC_CANCELLED":
        return new RPCCancelledError(message, procedure);
      case "RPC_UNAVAILABLE":
        return new RPCUnavailableError(message, procedure);
      default:
        break;
    }

    const error = new RPCError(message, { procedureName: procedure });

    // Preserve the server's code and any details for callers that
    // branch on them.
    Object.defineProperty(error, "code", {
      value: code ?? error.code,
      enumerable: true,
      configurable: true,
    });

    if (response.error?.details !== undefined) {
      Object.defineProperty(error, "details", {
        value: response.error.details,
        enumerable: true,
        configurable: true,
      });
    }

    return error;
  }
}
