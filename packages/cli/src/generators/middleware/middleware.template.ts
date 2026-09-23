/**
 * zudojs-cli — Generated `<name>.middleware.ts`.
 *
 * `generate middleware` used to write
 * `(ctx: unknown, next: () => Promise<void>) => Promise<void>`: registering
 * it in the server pipeline failed tsc with TS2322, and because it returned
 * nothing the response produced by `next()` was dropped. The file is now a
 * real `HttpMiddleware` from @zudojs/http that returns `next()`'s response.
 */

/** Options for {@link renderMiddlewareFile}. */
export interface MiddlewareFileOptions {
  /** Normalized (kebab-case) name, e.g. `request-timer`. */
  readonly name: string;
  /** Factory function name, e.g. `requestTimerMiddleware`. */
  readonly factoryName: string;
  /** Where the factory is registered, e.g. `src/server.ts`. */
  readonly serverFile: string;
}

/** Renders the middleware source file. */
export function renderMiddlewareFile(options: MiddlewareFileOptions): string {
  return `import type { HttpMiddleware } from "@zudojs/http";

/**
 * ${options.name} middleware.
 *
 * It runs when \`${options.factoryName}()\` is in the \`middlewares\` list of
 * ${options.serverFile}, between the \`// zudojs:server-middleware\` markers:
 * after the security headers, CORS and rate limit, before routing.
 * \`zudojs generate middleware\` adds it there when the markers exist.
 *
 * To answer without calling \`next()\`, return a response such as
 * \`createResponseContext({ status: 403 }).json({ error: "Forbidden" })\`.
 * Otherwise return what \`next()\` resolves to, and \`clone()\` it before
 * changing its headers.
 */
export function ${options.factoryName}(): HttpMiddleware {
  return async (_context, next) => {
    const response = await next();
    return response;
  };
}
`;
}
