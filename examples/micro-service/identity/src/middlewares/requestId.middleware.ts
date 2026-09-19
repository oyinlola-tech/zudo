import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * Adds a unique request ID to every incoming request.
 */
export function requestIdMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  const requestId = (req.headers["x-request-id"] as string) ?? randomUUID();
  res.setHeader("X-Request-Id", requestId);
  (req as IncomingMessage & { requestId: string }).requestId = requestId;
  next();
}
