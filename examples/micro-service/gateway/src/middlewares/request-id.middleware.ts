import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Generates a unique request ID and attaches it to the request and response.
 */
export function requestIdMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const requestId =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();

  // Store on request for downstream use
  (req as IncomingMessage & { requestId: string }).requestId = requestId;

  // Set response header
  res.setHeader("X-Request-Id", requestId);

  next();
}
