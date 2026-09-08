/**
 * Zudojs HTTP server core.
 *
 * @module httpServer/core
 */

import {
  isHttpAdapter,
  startAdapter,
  stopAdapter,
} from "../../httpAdapter/http.adapter.js";

import type {
  HttpAdapter,
  HttpHandler,
  HttpErrorHandler,
} from "../../httpAdapter/http.adapter.js";

import type {
  HttpServerState,
  HttpServerAddress,
  HttpServerOptions,
  HttpServerEvents,
  HttpServerSnapshot,
} from "../types/httpServer.type.js";

import {
  HttpServerLifecycleError,
  InvalidHttpServerStateError,
  HttpServerStartError,
  HttpServerStopError,
} from "@zudojs/errors";

import {
  withTimeout,
  validateShutdownTimeout,
} from "../factory/httpServer.factory.js";

export class HttpServer {
  readonly name: string;

  readonly adapter: HttpAdapter;

  readonly metadata: Readonly<Record<string, unknown>>;

  readonly gracefulShutdownTimeout: number;

  private stateValue: HttpServerState = "created";

  private addressValue: HttpServerAddress | undefined;

  private startedAtValue: Date | undefined;

  private stoppedAtValue: Date | undefined;

  private requestCount = 0;

  /**
   * Listeners per event.
   *
   * A single-slot registry (the previous shape) meant two independent
   * subsystems could not both subscribe to `onError`: the second `on()` call
   * threw.
   */
  private readonly listeners = new Map<
    keyof HttpServerEvents,
    Set<(...args: never[]) => void>
  >();

  private startPromise: Promise<void> | undefined;

  private stopPromise: Promise<void> | undefined;

  constructor(options: HttpServerOptions) {
    if (!isHttpAdapter(options.adapter)) {
      throw new TypeError("HttpServer requires a valid HTTP adapter.");
    }

    this.name = options.name ?? "zudojs-http";

    this.adapter = options.adapter;

    this.metadata = Object.freeze({
      ...(options.metadata ?? {}),
    });

    this.gracefulShutdownTimeout = validateShutdownTimeout(
      options.gracefulShutdownTimeout ?? 30_000,
    );

    for (const [event, listener] of Object.entries(options.events ?? {})) {
      if (typeof listener === "function") {
        this.on(
          event as keyof HttpServerEvents,
          listener as NonNullable<HttpServerEvents[keyof HttpServerEvents]>,
        );
      }
    }

    if (options.handler) {
      this.adapterHandler(options.handler);
    }

    if (options.errorHandler) {
      this.adapterErrorHandler(options.errorHandler);
    }
  }

  get state(): HttpServerState {
    return this.stateValue;
  }

  get isRunning(): boolean {
    return this.stateValue === "running";
  }

  get isStarting(): boolean {
    return this.stateValue === "starting";
  }

  get isStopping(): boolean {
    return this.stateValue === "stopping";
  }

  get isStopped(): boolean {
    return this.stateValue === "stopped" || this.stateValue === "created";
  }

  get address(): HttpServerAddress | undefined {
    return this.addressValue;
  }

  get startedAt(): Date | undefined {
    return this.startedAtValue;
  }

  get stoppedAt(): Date | undefined {
    return this.stoppedAtValue;
  }

  get requests(): number {
    return this.requestCount;
  }

  get uptime(): number {
    if (!this.startedAtValue) {
      return 0;
    }

    const end = this.stoppedAtValue ?? new Date();

    return Math.max(0, end.getTime() - this.startedAtValue.getTime());
  }

  async start(): Promise<this> {
    if (this.stateValue === "running") {
      return this;
    }

    if (this.stateValue === "starting") {
      await this.startPromise;

      return this;
    }

    if (this.stateValue === "stopping") {
      throw new InvalidHttpServerStateError(this.stateValue, "start");
    }

    this.stateValue = "starting";

    this.emit("onStarting", this);

    this.startPromise = this.performStart();

    try {
      await this.startPromise;

      this.stateValue = "running";

      this.startedAtValue = new Date();

      this.stoppedAtValue = undefined;

      this.refreshAddress();

      this.emit("onStarted", this);

      return this;
    } catch (error) {
      this.stateValue = "failed";

      const wrapped =
        error instanceof HttpServerStartError
          ? error
          : new HttpServerStartError("Failed to start the HTTP server.", error);

      this.emit("onError", wrapped, this);

      throw wrapped;
    } finally {
      this.startPromise = undefined;
    }
  }

  async stop(
    options: {
      readonly force?: boolean;
      readonly timeout?: number;
    } = {},
  ): Promise<this> {
    if (this.stateValue === "created" || this.stateValue === "stopped") {
      return this;
    }

    if (this.stateValue === "stopping") {
      await this.stopPromise;

      return this;
    }

    if (this.stateValue === "starting") {
      throw new InvalidHttpServerStateError(this.stateValue, "stop");
    }

    this.stateValue = "stopping";

    this.emit("onStopping", this);

    const timeout = validateShutdownTimeout(
      options.timeout ?? this.gracefulShutdownTimeout,
    );

    this.stopPromise = this.performStop(options.force ?? false, timeout);

    try {
      await this.stopPromise;

      this.stateValue = "stopped";

      this.stoppedAtValue = new Date();

      this.emit("onStopped", this);

      return this;
    } catch (error) {
      this.stateValue = "failed";

      const wrapped =
        error instanceof HttpServerStopError
          ? error
          : new HttpServerStopError("Failed to stop the HTTP server.", error);

      this.emit("onError", wrapped, this);

      throw wrapped;
    } finally {
      this.stopPromise = undefined;
    }
  }

  async restart(): Promise<this> {
    if (this.stateValue === "running" || this.stateValue === "failed") {
      await this.stop({
        force: this.stateValue === "failed",
      });
    }

    return this.start();
  }

  async close(): Promise<this> {
    return this.stop();
  }

  setHandler(handler: HttpHandler): this {
    this.adapterHandler(handler);

    return this;
  }

  setErrorHandler(handler: HttpErrorHandler): this {
    this.adapterErrorHandler(handler);

    return this;
  }

  private adapterHandler(handler: HttpHandler): void {
    const adapter = this.adapter as HttpAdapter & {
      handler?: HttpHandler;
      setHandler?: (value: HttpHandler) => void;
    };

    if (typeof adapter.setHandler === "function") {
      adapter.setHandler(handler);

      return;
    }

    if ("handler" in adapter) {
      adapter.handler = handler;

      return;
    }

    /*
     * Returning silently here left a listening server answering every request
     * with HTTP_HANDLER_NOT_CONFIGURED, with nothing to say the application
     * handler had been discarded.
     */
    throw new HttpServerLifecycleError(
      "The configured HTTP adapter cannot accept a request handler: it exposes neither setHandler() nor a handler property.",
      { code: "HTTP_SERVER_ADAPTER_HANDLER_UNSUPPORTED" },
    );
  }

  private adapterErrorHandler(handler: HttpErrorHandler): void {
    const adapter = this.adapter as HttpAdapter & {
      errorHandler?: HttpErrorHandler;
      setErrorHandler?: (value: HttpErrorHandler) => void;
    };

    if (typeof adapter.setErrorHandler === "function") {
      adapter.setErrorHandler(handler);

      return;
    }

    if ("errorHandler" in adapter) {
      adapter.errorHandler = handler;

      return;
    }

    throw new HttpServerLifecycleError(
      "The configured HTTP adapter cannot accept an error handler: it exposes neither setErrorHandler() nor an errorHandler property.",
      { code: "HTTP_SERVER_ADAPTER_ERROR_HANDLER_UNSUPPORTED" },
    );
  }

  recordRequest(): void {
    this.requestCount += 1;

    this.emit("onRequest", this);
  }

  recordResponse(): void {
    this.emit("onResponse", this);
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }

  on(
    event: keyof HttpServerEvents,
    listener: NonNullable<HttpServerEvents[keyof HttpServerEvents]>,
  ): () => void {
    let set = this.listeners.get(event);

    if (!set) {
      set = new Set();

      this.listeners.set(event, set);
    }

    set.add(listener as (...args: never[]) => void);

    return () => {
      this.listeners.get(event)?.delete(listener as (...args: never[]) => void);
    };
  }

  /**
   * Invokes every listener for an event.
   *
   * A listener that throws is isolated: it must not abort a start/stop
   * transition or prevent the remaining listeners from running.
   */
  private emit(event: keyof HttpServerEvents, ...args: unknown[]): void {
    const set = this.listeners.get(event);

    if (!set) {
      return;
    }

    for (const listener of [...set]) {
      try {
        (listener as (...values: unknown[]) => void)(...args);
      } catch {
        /* Listener failures are contained. */
      }
    }
  }

  snapshot(): HttpServerSnapshot {
    const address = this.addressValue;
    const startedAt = this.startedAtValue;
    const stoppedAt = this.stoppedAtValue;

    return {
      name: this.name,

      state: this.stateValue,

      adapter: this.adapter.name,

      address: address === undefined ? undefined : { ...address },

      startedAt:
        startedAt === undefined ? undefined : new Date(startedAt.getTime()),

      stoppedAt:
        stoppedAt === undefined ? undefined : new Date(stoppedAt.getTime()),

      uptime: this.uptime,

      requests: this.requestCount,

      metadata: Object.freeze({ ...this.metadata }),
    };
  }

  toJSON(): HttpServerSnapshot {
    return this.snapshot();
  }

  private async performStart(): Promise<void> {
    await startAdapter(this.adapter);
  }

  private async performStop(force: boolean, timeout: number): Promise<void> {
    if (force) {
      await stopAdapter(this.adapter);

      return;
    }

    try {
      await withTimeout(
        stopAdapter(this.adapter),
        timeout,
        "HTTP server shutdown timed out.",
      );
    } catch (error) {
      /*
       * A graceful stop that times out used to leave the server listening and
       * the sockets open while reporting failure, so a redeploy could not
       * rebind the port. Escalate to a forced stop before rethrowing.
       */
      try {
        await stopAdapter(this.adapter);
      } catch {
        /* The original timeout is the more useful error. */
      }

      throw error;
    }
  }

  private refreshAddress(): void {
    const adapter = this.adapter as HttpAdapter & {
      address?: HttpServerAddress;
    };

    if (adapter.address) {
      this.addressValue = adapter.address;
    }
  }
}
