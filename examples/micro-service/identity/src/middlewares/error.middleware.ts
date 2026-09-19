import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Global error handling middleware.
 * Catches unhandled errors and returns a structured JSON error response.
 */
export function errorMiddleware(
  err: unknown,
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  const error = err as {
    readonly message?: string;
    readonly statusCode?: number;
    readonly metadata?: Record<string, unknown>;
  };
  const statusCode = error.statusCode ?? 500;
  const message = error.message ?? "Internal Server Error";

  if (statusCode >= 500) {
    console.error(`[identity] ${message}`, error);
  }

  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: {
        message,
        statusCode,
        metadata: error.metadata,
      },
    }),
  );
}
