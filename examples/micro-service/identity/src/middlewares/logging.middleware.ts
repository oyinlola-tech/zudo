import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Logs incoming requests with method, URL, and duration.
 */
export function loggingMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const start = Date.now();
  const method = req.method ?? "UNKNOWN";
  const url = req.url ?? "/";

  res.on("finish", () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    console.log(
      `[${new Date().toISOString()}] ${method} ${url} ${statusCode} ${duration}ms`,
    );
  });

  next();
}
