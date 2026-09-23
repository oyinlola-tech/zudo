/**
 * zudojs-cli — Middleware Generator
 */

export {
  generateMiddleware,
  middlewareAppSrc,
  middlewareServerLines,
  type GenerateMiddlewareOptions,
  type MiddlewareRegistration,
} from "./middleware.generator.js";
export { renderMiddlewareFile, type MiddlewareFileOptions } from "./middleware.template.js";
