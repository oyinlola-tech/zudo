/**
 * @zudojs/adapters/capabilities
 *
 * Adapter capabilities — declares what an adapter supports.
 */

/**
 * Adapter capabilities.
 *
 * Not every platform supports every feature. Adapters declare their
 * capabilities so runtime code can adapt behavior accordingly.
 *
 * The well-known keys are listed in {@link KnownAdapterCapabilities}; any
 * other name (`refunds`, `bulkExport`, …) is a business capability an
 * adapter may declare and `findByCapability` / `supports` /
 * `requireCapability` can look up. The interface used to be closed, so a
 * capability outside the list was a compile error and could never be
 * queried.
 */
export interface AdapterCapabilities extends KnownAdapterCapabilities {
  readonly [capability: string]: boolean | undefined;
}

/**
 * The capability names this package defines. Kept separate from
 * {@link AdapterCapabilities} so `AdapterCapabilityName` can still offer
 * them for completion while accepting any string.
 */
export interface KnownAdapterCapabilities {
  /** Supports HTTP request/response handling. */
  readonly http?: boolean;

  /** Supports WebSocket connections. */
  readonly websocket?: boolean;

  /** Supports streaming responses and requests. */
  readonly streaming?: boolean;

  /** Supports file system access. */
  readonly filesystem?: boolean;

  /** Supports raw TCP connections. */
  readonly tcp?: boolean;

  /** Supports UDP datagrams. */
  readonly udp?: boolean;

  /** Supports background task execution. */
  readonly backgroundTasks?: boolean;

  /** Supports long-running server processes. */
  readonly longRunning?: boolean;

  /** Runs on an edge runtime (Cloudflare, Vercel Edge, etc.). */
  readonly edgeRuntime?: boolean;

  /** Runs in a serverless environment (Lambda, etc.). */
  readonly serverless?: boolean;

  /** Supports graceful shutdown. */
  readonly gracefulShutdown?: boolean;

  /** Supports request cancellation via AbortSignal. */
  readonly abortSignal?: boolean;
}
