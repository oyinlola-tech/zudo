import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "@zudojs/logger";

const logger = createLogger({ name: "gateway:error" });

/**
 * Normalizes errors from downstream services into a consistent format.
 */
interface NormalizedError {
  error: string;
  message: string;
  statusCode: number;
  service?: string;
  requestId?: string;
}

/**
 * Parses an error response body from a downstream service.
 */
function parseServiceError(body: unknown): NormalizedError {
  if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    return {
      error: String(obj["error"] ?? "Service Error"),
      message: String(obj["message"] ?? obj["error"] ?? "An error occurred"),
      statusCode:
        typeof obj["statusCode"] === "number" ? obj["statusCode"] : 500,
      service: typeof obj["service"] === "string" ? obj["service"] : undefined,
    };
  }
  return {
    error: "Service Error",
    message: "An unexpected error occurred",
    statusCode: 502,
  };
}

/**
 * Error handling middleware.
 * Catches errors and normalizes them into consistent JSON responses.
 */
export function errorMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  error: unknown,
): void {
  const requestId =
    (req as IncomingMessage & { requestId?: string }).requestId ?? "unknown";

  // If headers already sent, we can't send another response
  if (res.headersSent) {
    logger.error("Error after headers sent", {
      requestId,
      error: String(error),
    });
    return;
  }

  let normalized: NormalizedError;

  if (error instanceof Error) {
    // Check if this is a fetch/service error
    if (
      error.message.includes("timed out") ||
      error.message.includes("ECONNREFUSED")
    ) {
      normalized = {
        error: "Service Unavailable",
        message: "A backend service is currently unavailable",
        statusCode: 503,
      };
    } else {
      normalized = {
        error: "Internal Gateway Error",
        message:
          process.env["NODE_ENV"] === "production"
            ? "An unexpected error occurred"
            : error.message,
        statusCode: 500,
      };
    }
  } else if (typeof error === "object" && error !== null && "status" in error) {
    normalized = parseServiceError(error);
  } else {
    normalized = {
      error: "Internal Gateway Error",
      message: "An unexpected error occurred",
      statusCode: 500,
    };
  }

  logger.error("Gateway error", {
    requestId,
    error: normalized.error,
    message: normalized.message,
    statusCode: normalized.statusCode,
  });

  res.writeHead(normalized.statusCode, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ...normalized,
      requestId,
    }),
  );
}
