/**
 * @zudojs/http/httpMiddleware/builtin
 *
 * Built-in HTTP middleware factories.
 */

export * from "./cors/index.js";
export * from "./logging/index.js";
export * from "./security/index.js";
export * from "./timing/index.js";
export * from "./compose/index.js";
export * from "./conditional/index.js";
export * from "./helpers/index.js";
export * from "./static/index.js";
export * from "./image/index.js";
export * from "./video/index.js";
export * from "./rateLimit/index.js";

/** State middleware — identity pass-through. */
export function createStateMiddleware(): import("../httpMiddleware.type.js").HttpMiddleware {
  return async (_context, next) => {
    return next();
  };
}
