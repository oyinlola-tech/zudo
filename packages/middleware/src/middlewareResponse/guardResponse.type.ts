/**
 * The guard response contract: how a middleware that refuses a request tells
 * the transport which status, headers and body to answer with.
 *
 * @module middlewareResponse/guardResponse.type
 */

/**
 * Brand carried by every {@link GuardResponse}.
 *
 * A registered symbol (`Symbol.for`), so two copies of this package in one
 * process still agree on it. JSON cannot carry a symbol, so request data can
 * never forge the brand: a plain object that merely has a `status` key is not
 * a guard response.
 */
export const GUARD_RESPONSE: unique symbol = Symbol.for(
  "zudojs.middleware.guardResponse",
);

/**
 * A response a middleware returns instead of calling `next()`.
 *
 * Created with {@link createGuardResponse}. `@zudojs/http` turns one into a
 * real response with this status, these headers and this body; any other
 * returned object keeps its previous meaning.
 */
export interface GuardResponse {
  /** Marks the object as a guard response. */
  readonly [GUARD_RESPONSE]: true;
  /** HTTP status code, an integer in 100–599. */
  readonly status: number;
  /** Response body. Serialized as JSON unless it is a string or bytes. */
  readonly body: unknown;
  /** Response headers, keyed by lower-case name. */
  readonly headers: Readonly<Record<string, string>>;
}

/** Input to {@link createGuardResponse}. */
export interface GuardResponseInit {
  /** HTTP status code, an integer in 100–599. */
  readonly status: number;
  /** Response body. Omit for an empty body. */
  readonly body?: unknown;
  /**
   * Response headers. A JSON body gets `content-type: application/json`
   * unless one is given here.
   */
  readonly headers?: Readonly<Record<string, string>>;
}
