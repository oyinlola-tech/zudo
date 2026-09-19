import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "@zudojs/logger";

const logger = createLogger({ name: "gateway:request" });

/**
 * Logs incoming requests and outgoing responses with timing and correlation.
 */
export function loggingMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const startTime = Date.now();
  const requestId =
    (req as IncomingMessage & { requestId?: string }).requestId ?? "unknown";
  const method = req.method ?? "UNKNOWN";
  const url = req.url ?? "/";

  logger.info("Request received", { requestId, method, url });

  // Intercept the response end to log when it finishes
  const originalEnd = res.end;

  res.end = function (
    this: ServerResponse,
    ...args: unknown[]
  ): ServerResponse {
    const duration = Date.now() - startTime;
    const statusCode = this.statusCode ?? 200;

    logger.info("Request completed", {
      requestId,
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
    });

    return originalEnd.apply(this, args as Parameters<typeof originalEnd>);
  } as typeof res.end;

  next();
}
