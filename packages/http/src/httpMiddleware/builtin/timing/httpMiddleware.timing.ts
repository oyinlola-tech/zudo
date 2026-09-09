/**
 * Timing middleware factory.
 *
 * @module httpMiddleware/builtin/timing
 */

import type { HttpMiddleware } from "../../httpMiddleware.type.js";


import { performanceNow, withResponseHeaders } from "../helpers/index.js";

export function createTimingMiddleware(): HttpMiddleware {
  return async (context, next) => {
    const start = performanceNow();

    const response = await next();

    const duration = performanceNow() - start;

    return withResponseHeaders(response, {
      "server-timing": `total;dur=${duration.toFixed(2)}`,
      "x-response-time": `${duration.toFixed(2)}ms`,
    });
  };
}
