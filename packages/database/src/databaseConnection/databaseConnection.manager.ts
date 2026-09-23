import { DatabaseOperation } from "@zudojs/errors";

import {
  DatabaseClient,
  type DatabaseClientOptions,
} from "../databaseClient/databaseClient.core.js";
import { normalizeDatabaseError } from "../databaseClient/databaseClient.errors.js";
import {
  checkDatabaseHealth,
  getHealthCheckCause,
  type DatabaseHealth as DetailedDatabaseHealth,
} from "../health/health.check.js";

import type {
  DatabaseHealth,
  DatabaseStatus,
} from "../databaseType/databaseType.type.js";

/**
 * Connection lifecycle events.
 */
export type DatabaseConnectionEvent =
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected"
  | "error"
  | "reconnecting";

/**
 * Listener invoked when the connection state changes.
 */
export type DatabaseConnectionListener = (
  event: DatabaseConnectionEvent,
  details: DatabaseConnectionEventDetails,
) => void;

/**
 * Details associated with a connection event.
 */
export interface DatabaseConnectionEventDetails {
  readonly status: DatabaseStatus;
  readonly timestamp: Date;
  readonly error?: unknown;
  readonly attempt?: number;
}

/**
 * Reconnect policy applied after scheduled health checks fail.
 */
export interface DatabaseReconnectOptions {
  /**
   * Consecutive failed health checks before a reconnect is attempted.
   * Defaults to 1.
   */
  readonly failureThreshold?: number;

  /**
   * Maximum reconnect attempts per outage. Defaults to 5.
   */
  readonly maxAttempts?: number;

  /**
   * Base delay between reconnect attempts; doubles each attempt up to
   * `maxDelayMs`. Defaults to 500 ms. The wait keeps the process alive
   * (a reconnect is never abandoned because the event loop drained) and
   * is cancelled by `disconnect()` / `destroy()`.
   */
  readonly baseDelayMs?: number;

  /**
   * Upper bound for the backoff delay. Defaults to 30 000 ms.
   */
  readonly maxDelayMs?: number;
}

/**
 * Options for the connection manager.
 */
export interface DatabaseConnectionManagerOptions extends DatabaseClientOptions {
  /**
   * Existing client to manage. When supplied the other client options are
   * ignored, so one Prisma instance is never wrapped by two lifecycle
   * state machines.
   */
  readonly client?: DatabaseClient;

  readonly autoConnect?: boolean;

  /**
   * Interval for scheduled health checks. Disabled when omitted.
   */
  readonly healthCheckIntervalMs?: number;

  /**
   * Timeout for each scheduled health check. Defaults to the smaller of
   * the interval and 5 000 ms.
   */
  readonly healthCheckTimeoutMs?: number;

  /**
   * Reconnect policy. Pass `false` to disable automatic reconnects.
   */
  readonly reconnect?: DatabaseReconnectOptions | false;
}

/**
 * Manages the database connection lifecycle.
 *
 * The manager intentionally does not connect during construction.
 * Application bootstrap should call `connect()` explicitly unless
 * `autoConnect` is enabled.
 */
export class DatabaseConnectionManager {
  private readonly client: DatabaseClient;
  private readonly listeners = new Set<DatabaseConnectionListener>();
  private readonly autoConnect: boolean;
  private readonly healthCheckIntervalMs?: number;
  private readonly healthCheckTimeoutMs: number;
  private readonly reconnect: Required<DatabaseReconnectOptions> | undefined;

  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private healthCheckInFlight?: Promise<void>;
  private consecutiveFailures = 0;
  private reconnectPromise?: Promise<void>;
  private reconnectAbort?: AbortController;
  private lastHealth?: DetailedDatabaseHealth;
  private destroyed = false;

  constructor(options: DatabaseConnectionManagerOptions = {}) {
    const { client, autoConnect, healthCheckIntervalMs, healthCheckTimeoutMs, reconnect, ...clientOptions } = options;
    this.client = client ?? new DatabaseClient(clientOptions);
    this.autoConnect = autoConnect ?? false;

    if (healthCheckIntervalMs !== undefined) {
      if (!Number.isFinite(healthCheckIntervalMs) || healthCheckIntervalMs <= 0) {
        throw new TypeError("healthCheckIntervalMs must be a positive finite number.");
      }
      this.healthCheckIntervalMs = Math.floor(healthCheckIntervalMs);
    }

    const defaultTimeout = Math.min(this.healthCheckIntervalMs ?? 5_000, 5_000);
    this.healthCheckTimeoutMs = healthCheckTimeoutMs ?? defaultTimeout;
    if (!Number.isFinite(this.healthCheckTimeoutMs) || this.healthCheckTimeoutMs <= 0) {
      throw new TypeError("healthCheckTimeoutMs must be a positive finite number.");
    }

    this.reconnect =
      reconnect === false
        ? undefined
        : {
            failureThreshold: Math.max(1, Math.floor(reconnect?.failureThreshold ?? 1)),
            maxAttempts: Math.max(1, Math.floor(reconnect?.maxAttempts ?? 5)),
            baseDelayMs: Math.max(0, reconnect?.baseDelayMs ?? 500),
            maxDelayMs: Math.max(0, reconnect?.maxDelayMs ?? 30_000),
          };
  }

  /**
   * Initializes the connection manager.
   */
  public async initialize(): Promise<void> {
    if (!this.autoConnect) return;
    await this.connect();
  }

  /**
   * Opens the database connection. Concurrent calls share the client's
   * in-flight attempt.
   */
  public async connect(): Promise<void> {
    if (this.client.getStatus() === "connected") return;

    this.emit("connecting");
    try {
      await this.client.connect();
      this.consecutiveFailures = 0;
      this.emit("connected");
      this.startHealthChecks();
    } catch (error) {
      this.emit("error", error);
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.CONNECT,
        fallbackMessage: "Database connection failed.",
      });
    }
  }

  /**
   * Closes the database connection. Cancels an in-progress reconnect,
   * including its backoff wait, so no further attempt is made.
   */
  public async disconnect(): Promise<void> {
    this.stopHealthChecks();
    this.cancelReconnect();

    const status = this.client.getStatus();
    if (status === "disconnected" || status === "disconnecting") return;

    this.emit("disconnecting");
    try {
      await this.client.disconnect();
      this.emit("disconnected");
    } catch (error) {
      this.emit("error", error);
      throw normalizeDatabaseError(error, {
        operation: DatabaseOperation.DISCONNECT,
        fallbackMessage: "Database disconnection failed.",
      });
    }
  }

  /**
   * Ensures that the connection is ready.
   */
  public async ensureConnected(): Promise<void> {
    if (this.client.getStatus() !== "connected") {
      await this.connect();
    }
  }

  /**
   * Returns the current connection status.
   */
  public getStatus(): DatabaseStatus {
    return this.client.getStatus();
  }

  /**
   * Performs a database health check (with the configured timeout).
   */
  public async healthCheck(): Promise<DatabaseHealth> {
    return this.client.healthCheck({ timeoutMs: this.healthCheckTimeoutMs });
  }

  /**
   * Returns the result of the most recent scheduled health check.
   */
  public getLastHealth(): DetailedDatabaseHealth | undefined {
    return this.lastHealth;
  }

  /**
   * Returns the underlying database client.
   */
  public getClient(): DatabaseClient {
    return this.client;
  }

  /**
   * Subscribes to connection lifecycle events.
   */
  public on(listener: DatabaseConnectionListener): () => void {
    if (typeof listener !== "function") {
      throw new TypeError("A connection listener must be a function.");
    }
    this.listeners.add(listener);
    return () => {
      this.off(listener);
    };
  }

  /**
   * Removes a connection listener.
   */
  public off(listener: DatabaseConnectionListener): boolean {
    return this.listeners.delete(listener);
  }

  /**
   * Removes all connection listeners.
   */
  public removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Starts periodic database health checks. A tick is skipped while a
   * previous check is still in flight, so a hung database never
   * accumulates pending probes.
   */
  public startHealthChecks(): void {
    this.stopHealthChecks();
    const interval = this.healthCheckIntervalMs;
    if (!interval || this.destroyed) return;

    this.healthCheckTimer = setInterval(() => {
      void this.runScheduledHealthCheck();
    }, interval);
    (this.healthCheckTimer as { unref?: () => void }).unref?.();
  }

  /**
   * Stops periodic database health checks.
   */
  public stopHealthChecks(): void {
    if (!this.healthCheckTimer) return;
    clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = undefined;
  }

  /**
   * Runs one scheduled health check immediately (also used by the timer).
   * Resolves once the check, and any reconnect it triggers, has settled.
   */
  public async runScheduledHealthCheck(): Promise<void> {
    if (this.healthCheckInFlight) return this.healthCheckInFlight;
    this.healthCheckInFlight = this.performScheduledHealthCheck().finally(() => {
      this.healthCheckInFlight = undefined;
    });
    return this.healthCheckInFlight;
  }

  /**
   * Releases connection manager resources.
   */
  public async destroy(): Promise<void> {
    this.destroyed = true;
    this.stopHealthChecks();
    await this.disconnect();
    this.removeAllListeners();
  }

  private async performScheduledHealthCheck(): Promise<void> {
    const health = await checkDatabaseHealth(this.client, {
      timeoutMs: this.healthCheckTimeoutMs,
    });
    this.lastHealth = health;

    if (health.healthy) {
      this.consecutiveFailures = 0;
      return;
    }

    this.consecutiveFailures += 1;
    this.emit("error", getHealthCheckCause(health) ?? health.error);

    if (
      this.reconnect &&
      !this.destroyed &&
      this.consecutiveFailures >= this.reconnect.failureThreshold
    ) {
      await this.reconnectWithBackoff();
    }
  }

  private reconnectWithBackoff(): Promise<void> {
    if (this.reconnectPromise) return this.reconnectPromise;
    const abort = new AbortController();
    this.reconnectAbort = abort;
    this.reconnectPromise = this.performReconnect(abort.signal).finally(() => {
      this.reconnectPromise = undefined;
      if (this.reconnectAbort === abort) this.reconnectAbort = undefined;
    });
    return this.reconnectPromise;
  }

  private cancelReconnect(): void {
    this.reconnectAbort?.abort();
    this.reconnectAbort = undefined;
  }

  private async performReconnect(signal: AbortSignal): Promise<void> {
    const policy = this.reconnect;
    if (!policy) return;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      if (this.destroyed || signal.aborted) return;
      this.emit("reconnecting", undefined, attempt);
      try {
        await this.client.disconnect().catch(() => undefined);
        if (signal.aborted) return;
        await this.client.connect();
        if (signal.aborted) return;
        this.consecutiveFailures = 0;
        this.emit("connected", undefined, attempt);
        return;
      } catch (error) {
        if (signal.aborted) return;
        this.emit("error", error, attempt);
        if (attempt === policy.maxAttempts) return;
        const delay = Math.min(
          policy.maxDelayMs,
          policy.baseDelayMs * Math.pow(2, attempt - 1),
        );
        if (delay > 0) await sleep(delay, signal);
      }
    }
  }

  private emit(
    event: DatabaseConnectionEvent,
    error?: unknown,
    attempt?: number,
  ): void {
    const details: DatabaseConnectionEventDetails = Object.freeze({
      status: this.client.getStatus(),
      timestamp: new Date(),
      error,
      attempt,
    });

    for (const listener of [...this.listeners]) {
      try {
        listener(event, details);
      } catch {
        // Listeners must never break the connection lifecycle itself.
      }
    }
  }
}

/**
 * Backoff wait between reconnect attempts. The timer is deliberately *not*
 * unref'd: a script whose only pending work is a reconnect must stay alive
 * until the reconnect finishes. Aborting `signal` (from `disconnect()` or
 * `destroy()`) clears the timer and resolves at once.
 */
function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Creates a database connection manager.
 */
export function createConnectionManager(
  options: DatabaseConnectionManagerOptions = {},
): DatabaseConnectionManager {
  return new DatabaseConnectionManager(options);
}
