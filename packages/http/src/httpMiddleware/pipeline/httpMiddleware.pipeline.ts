/**
 * HTTP middleware pipeline implementation.
 *
 * @module httpMiddleware/pipeline
 */

import type {
  HttpMiddleware,
  HttpMiddlewareErrorHandler,
  HttpMiddlewarePipelineOptions,
  HttpMiddlewareState,
  InternalMiddleware,
  RegisteredMiddleware,
} from "../httpMiddleware.type.js";

import type { HttpRequestContext as RequestContext } from "../../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../../httpResponse/httpResponse.context.js";

import {
  use as registerUse,
  remove as registerRemove,
  setEnabled,
  has as registerHas,
  get as registerGet,
  list as registerList,
} from "./httpPipeline.registration.js";

import { isRegisteredMiddleware } from "./httpPipeline.helper.js";

import { executePipeline } from "./httpPipeline.execution.js";

export class HttpMiddlewarePipeline {
  private readonly entries: InternalMiddleware[] = [];

  private readonly metadata: Readonly<Record<string, unknown>>;

  private readonly onError: HttpMiddlewareErrorHandler | undefined;

  private sequence = 0;

  constructor(options: HttpMiddlewarePipelineOptions = {}) {
    this.metadata = Object.freeze({
      ...(options.metadata ?? {}),
    });

    this.onError = options.onError;

    for (const middleware of options.middlewares ?? []) {
      if (typeof middleware === "function") {
        this.use(middleware);

        continue;
      }

      /*
       * Pre-registered middleware objects were previously dropped on the
       * floor by a `typeof === "function"` filter, so a pipeline constructed
       * from `list()` output lost every entry.
       */
      if (isRegisteredMiddleware(middleware)) {
        this.entries.push({
          id: middleware.id,
          middleware: middleware.middleware,
          name: middleware.name,
          priority: middleware.priority,
          sequence: this.entries.length,
          enabled: middleware.enabled,
        });
      }
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Registration                                                             */
  /* ------------------------------------------------------------------------ */

  use(
    middleware: HttpMiddleware,
    options: {
      readonly name?: string;

      readonly priority?: number;

      readonly enabled?: boolean;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): () => void {
    return registerUse(
      this.entries,
      middleware,
      () => `${options.name ?? "middleware"}-${++this.sequence}`,
      {
        name: options.name,
        priority: options.priority,
        enabled: options.enabled,
        metadata: options.metadata,
        sequence: this.entries.length,
      },
    );
  }

  remove(id: string): boolean {
    return registerRemove(this.entries, id);
  }

  enable(id: string): boolean {
    return setEnabled(this.entries, id, true);
  }

  disable(id: string): boolean {
    return setEnabled(this.entries, id, false);
  }

  has(id: string): boolean {
    return registerHas(this.entries, id);
  }

  clear(): void {
    this.entries.length = 0;
  }

  count(): number {
    return this.entries.length;
  }

  get(id: string): RegisteredMiddleware | undefined {
    return registerGet(this.entries, id);
  }

  list(): readonly RegisteredMiddleware[] {
    return registerList(this.entries);
  }

  /* ------------------------------------------------------------------------ */
  /* Execution                                                                */
  /* ------------------------------------------------------------------------ */

  async execute(
    request: RequestContext,
    response: ResponseContext,
    options: {
      readonly state?: HttpMiddlewareState;

      readonly signal?: AbortSignal;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): Promise<ResponseContext> {
    return executePipeline(this.entries, request, response, options, {
      metadata: this.metadata,
      onError: this.onError,
    });
  }
}
