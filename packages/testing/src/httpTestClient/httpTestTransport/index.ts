/**
 * @zudojs/testing — HTTP test transports.
 *
 * Each target kind the test client accepts is reduced to a transport that
 * sends one request and releases whatever it opened on `close()`: a socket
 * transport for URLs, Node servers and `@zudojs/http` apps, and an in-process
 * transport for web-standard fetch handlers.
 */

export type {
  FetchApplication,
  FetchHandler,
  HttpTestTransport,
  NodeRequestListener,
  RawHttpRequest,
  RawHttpResponse,
} from "./httpTestTransport.type.js";

export {
  createOriginTransport,
  sendNodeRequest,
} from "./httpTestTransport.node.js";

export {
  createListenerTransport,
  createNodeServerTransport,
  formatOrigin,
} from "./httpTestTransport.server.js";

export { createFetchTransport } from "./httpTestTransport.fetch.js";

export {
  createAdapterTransport,
  createHandlerTransport,
  createHttpServerTransport,
  createPipelineTransport,
  createRouterTransport,
} from "./httpTestTransport.zudo.js";

export type { HttpTestAdapterOptions } from "./httpTestTransport.zudo.js";
