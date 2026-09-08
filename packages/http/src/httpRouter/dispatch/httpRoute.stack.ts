/**
 * Zudojs HTTP route stack.
 *
 * Maintains the ordered execution layers associated with a route.
 * Middleware ordering is explicit and deterministic.
 */

import type {
  MatchedRoute,
  RouterHandler,
} from "../core/types/httpRouter.type.js";

import type { HttpRequestContext as RequestContext } from "../../httpRequest/httpRequest.context.js";

import type { HttpResponseContext as ResponseContext } from "../../httpResponse/httpResponse.context.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RouteStackNext = () => void | Promise<void>;

export type RouteStackHandler = (
  request: RequestContext,
  response: ResponseContext,
  next?: RouteStackNext,
) => void | Promise<void>;

export type RouteStackLayerType = "middleware" | "handler";

export interface RouteStackLayer {
  readonly id: string;

  readonly name: string | undefined;

  readonly type: RouteStackLayerType;

  readonly handler: RouteStackHandler;

  readonly order: number;

  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RouteStackOptions {
  readonly strictNext?: boolean;
}

export interface RouteStackExecutionContext {
  readonly request: RequestContext;

  readonly response: ResponseContext;

  readonly route: MatchedRoute | undefined;
}

export interface RouteStackExecutionResult {
  readonly executed: number;

  readonly completed: boolean;

  readonly error: unknown | undefined;
}

/* -------------------------------------------------------------------------- */
/* Route Stack                                                                */
/* -------------------------------------------------------------------------- */

export class RouteStack {
  private readonly layers: RouteStackLayer[] = [];

  private readonly options: Required<RouteStackOptions>;

  private sequence = 0;

  constructor(options: RouteStackOptions = {}) {
    this.options = {
      strictNext: options.strictNext ?? true,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Registration                                                              */
  /* ------------------------------------------------------------------------ */

  use(
    handler: RouteStackHandler,
    options: {
      readonly name?: string;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): RouteStackLayer {
    return this.add("middleware", handler, options);
  }

  handler(
    handler: RouteStackHandler | RouterHandler,
    options: {
      readonly name?: string;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): RouteStackLayer {
    return this.add("handler", handler as RouteStackHandler, options);
  }

  add(
    type: RouteStackLayerType,
    handler: RouteStackHandler,
    options: {
      readonly name?: string;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): RouteStackLayer {
    if (typeof handler !== "function") {
      throw new TypeError("Route stack layer must be a function.");
    }

    this.sequence += 1;

    const layer: RouteStackLayer = Object.freeze({
      id: `layer:${this.sequence}`,

      name: options.name,

      type,

      handler,

      order: this.layers.length,

      metadata: Object.freeze({
        ...(options.metadata ?? {}),
      }),
    });

    this.layers.push(layer);

    return layer;
  }

  addMany(
    layers: readonly (
      | RouteStackLayer
      | {
          readonly type: RouteStackLayerType;

          readonly handler: RouteStackHandler;

          readonly name?: string;

          readonly metadata?: Readonly<Record<string, unknown>>;
        }
    )[],
  ): readonly RouteStackLayer[] {
    const added: RouteStackLayer[] = [];

    for (const layer of layers) {
      if ("id" in layer) {
        this.insertLayer(layer);

        added.push(layer);

        continue;
      }

      added.push(
        this.add(layer.type, layer.handler, {
          name: layer.name,

          metadata: layer.metadata,
        }),
      );
    }

    return Object.freeze(added);
  }

  /* ------------------------------------------------------------------------ */
  /* Ordering                                                                  */
  /* ------------------------------------------------------------------------ */

  before(
    target: string,
    handler: RouteStackHandler,
    options: {
      readonly name?: string;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): RouteStackLayer {
    const index = this.indexOf(target);

    if (index === -1) {
      throw new Error(`Route stack layer "${target}" was not found.`);
    }

    const layer = this.add("middleware", handler, options);

    this.move(layer.id, index);

    return layer;
  }

  after(
    target: string,
    handler: RouteStackHandler,
    options: {
      readonly name?: string;

      readonly metadata?: Readonly<Record<string, unknown>>;
    } = {},
  ): RouteStackLayer {
    const index = this.indexOf(target);

    if (index === -1) {
      throw new Error(`Route stack layer "${target}" was not found.`);
    }

    const layer = this.add("middleware", handler, options);

    this.move(layer.id, index + 1);

    return layer;
  }

  move(layerId: string, targetIndex: number): boolean {
    const sourceIndex = this.indexOf(layerId);

    if (sourceIndex === -1) {
      return false;
    }

    const boundedIndex = Math.max(
      0,
      Math.min(targetIndex, this.layers.length - 1),
    );

    const [layer] = this.layers.splice(sourceIndex, 1);

    if (layer === undefined) {
      /* `indexOf` already proved the index is in range, so this cannot fire. */
      return false;
    }

    this.layers.splice(boundedIndex, 0, layer);

    this.reindex();

    return true;
  }

  /* ------------------------------------------------------------------------ */
  /* Removal                                                                   */
  /* ------------------------------------------------------------------------ */

  remove(layerId: string): boolean {
    const index = this.indexOf(layerId);

    if (index === -1) {
      return false;
    }

    this.layers.splice(index, 1);

    this.reindex();

    return true;
  }

  removeByName(name: string): number {
    const original = this.layers.length;

    for (let index = this.layers.length - 1; index >= 0; index -= 1) {
      if (this.layers[index]?.name === name) {
        this.layers.splice(index, 1);
      }
    }

    this.reindex();

    return original - this.layers.length;
  }

  clear(): void {
    this.layers.length = 0;
  }

  /* ------------------------------------------------------------------------ */
  /* Lookup                                                                    */
  /* ------------------------------------------------------------------------ */

  get(layerId: string): RouteStackLayer | undefined {
    return this.layers.find((layer) => layer.id === layerId);
  }

  getByName(name: string): RouteStackLayer | undefined {
    return this.layers.find((layer) => layer.name === name);
  }

  indexOf(layerId: string): number {
    return this.layers.findIndex((layer) => layer.id === layerId);
  }

  has(layerId: string): boolean {
    return this.indexOf(layerId) !== -1;
  }

  /* ------------------------------------------------------------------------ */
  /* Inspection                                                                */
  /* ------------------------------------------------------------------------ */

  all(): readonly RouteStackLayer[] {
    return Object.freeze([...this.layers]);
  }

  middleware(): readonly RouteStackLayer[] {
    return Object.freeze(
      this.layers.filter((layer) => layer.type === "middleware"),
    );
  }

  getHandler(): RouteStackLayer | undefined {
    for (let index = this.layers.length - 1; index >= 0; index -= 1) {
      const layer = this.layers[index];

      if (layer?.type === "handler") {
        return layer;
      }
    }

    return undefined;
  }

  count(): number {
    return this.layers.length;
  }

  /* ------------------------------------------------------------------------ */
  /* Execution                                                                 */
  /* ------------------------------------------------------------------------ */

  async execute(
    context: RouteStackExecutionContext,
  ): Promise<RouteStackExecutionResult> {
    let index = -1;

    let executed = 0;

    const dispatch = async (current: number): Promise<void> => {
      if (this.options.strictNext && current <= index) {
        throw new Error("Route stack next() called multiple times.");
      }

      index = current;

      const layer = this.layers[current];

      if (!layer) {
        return;
      }

      executed += 1;

      if (layer.type === "handler") {
        await layer.handler(context.request, context.response);

        return;
      }

      await layer.handler(context.request, context.response, () =>
        dispatch(current + 1),
      );
    };

    try {
      await dispatch(0);

      return Object.freeze({
        executed,

        completed: true,

        error: undefined,
      });
    } catch (error) {
      return Object.freeze({
        executed,

        completed: false,

        error,
      });
    }
  }

  async run(
    request: RequestContext,
    response: ResponseContext,
    route?: MatchedRoute,
  ): Promise<RouteStackExecutionResult> {
    return this.execute({
      request,

      response,

      route,
    });
  }

  /* ------------------------------------------------------------------------ */
  /* Conversion                                                                */
  /* ------------------------------------------------------------------------ */

  static fromRoute(
    route: MatchedRoute,
    options: RouteStackOptions = {},
  ): RouteStack {
    const stack = new RouteStack(options);

    const middleware = normalizeMiddleware(route.middleware);

    for (const layer of middleware) {
      stack.use(layer);
    }

    stack.handler(route.handler);

    return stack;
  }

  clone(): RouteStack {
    const clone = new RouteStack(this.options);

    for (const layer of this.layers) {
      clone.insertLayer({
        ...layer,

        metadata: Object.freeze({
          ...layer.metadata,
        }),
      });
    }

    clone.sequence = this.sequence;

    return clone;
  }

  /* ------------------------------------------------------------------------ */
  /* Serialization                                                             */
  /* ------------------------------------------------------------------------ */

  toJSON(): readonly Record<string, unknown>[] {
    return Object.freeze(
      this.layers.map((layer) => ({
        id: layer.id,

        name: layer.name,

        type: layer.type,

        order: layer.order,

        metadata: layer.metadata,
      })),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Internals                                                                 */
  /* ------------------------------------------------------------------------ */

  private insertLayer(layer: RouteStackLayer): void {
    this.layers.push(layer);

    this.sequence = Math.max(this.sequence, extractSequence(layer.id));

    this.reindex();
  }

  private reindex(): void {
    for (const [index, layer] of this.layers.entries()) {
      this.layers[index] = Object.freeze({
        ...layer,

        order: index,
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Factories                                                                  */
/* -------------------------------------------------------------------------- */

export function createRouteStack(options: RouteStackOptions = {}): RouteStack {
  return new RouteStack(options);
}

export function createRouteStackFromRoute(
  route: MatchedRoute,
  options: RouteStackOptions = {},
): RouteStack {
  return RouteStack.fromRoute(route, options);
}

/* -------------------------------------------------------------------------- */
/* Middleware Helpers                                                         */
/* -------------------------------------------------------------------------- */

export function composeRouteStack(
  layers: readonly RouteStackHandler[],
  options: RouteStackOptions = {},
): RouteStack {
  const stack = new RouteStack(options);

  for (const layer of layers) {
    stack.use(layer);
  }

  return stack;
}

function normalizeMiddleware(middleware: unknown): RouteStackHandler[] {
  if (!middleware) {
    return [];
  }

  if (Array.isArray(middleware)) {
    return middleware as RouteStackHandler[];
  }

  return [middleware as RouteStackHandler];
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function extractSequence(id: string): number {
  const match = id.match(/:(\d+)$/);

  return match ? Number(match[1]) : 0;
}

export function isRouteStack(value: unknown): value is RouteStack {
  return value instanceof RouteStack;
}

export function isRouteStackLayer(value: unknown): value is RouteStackLayer {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "id" in value && "type" in value && "handler" in value && "order" in value
  );
}
