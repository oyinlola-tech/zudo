/**
 * Web-standard HTTP binding: exposes operations as a
 * `(request: Request) => Promise<Response>` handler that any Fetch API
 * server can mount, with routes taken from each operation's
 * `metadata.http`.
 */

export type { APIFetchHandlerOptions } from "./apiFetch.handler.js";

export { createApiFetchHandler, DEFAULT_API_MAX_BODY_BYTES } from "./apiFetch.handler.js";

export type { APIFetchInput } from "./apiFetch.input.js";

export { readFetchInput } from "./apiFetch.input.js";
