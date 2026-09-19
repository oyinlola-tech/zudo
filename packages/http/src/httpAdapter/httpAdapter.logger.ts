/**
 * Default logger for contexts built by the stock adapters.
 *
 * @module httpAdapter/httpAdapter.logger
 */

import { createDefaultLogger, type Logger } from "@zudojs/logger";

/**
 * Creates the logger a stock adapter gives each `HTTPContext` when the
 * caller supplies none: a `@zudojs/logger` console logger named `http`.
 *
 * It goes through the logger's secret-field redaction, so metadata such as
 * `authorization`, `password` or `apiKey` passed to `ctx.log()` is printed
 * as `[REDACTED]`. The earlier fallback called `console.*` with the raw
 * metadata object. One logger per context (construction costs a few
 * microseconds), so `setLevel()` / `disable()` / `close()` on one context's
 * logger cannot silence another's.
 */
export function createDefaultContextLogger(): Logger {
  return createDefaultLogger("http");
}
